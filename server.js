const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { google } = require('googleapis');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK
const serviceAccount = require('./firebase-service-account.json');
initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: 'life-journey-secret',
    resave: false,
    saveUninitialized: false
}));

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

const credentialsPath = path.join(__dirname, 'oauth2.json');
const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
];

function getOAuthClient() {
    const raw = fs.readFileSync(credentialsPath);
    const { client_secret, client_id, redirect_uris } = JSON.parse(raw).web || JSON.parse(raw).installed;
    return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

async function getDriveForUser(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    try {
        const doc = await db.collection('users').doc(req.session.userId).get();
        if (!doc.exists || !doc.data().refresh_token) {
            return res.status(401).json({ error: 'Please reconnect Google Drive' });
        }
        const auth = getOAuthClient();
        auth.setCredentials({ refresh_token: doc.data().refresh_token });
        req.drive = google.drive({ version: 'v3', auth });
        next();
    } catch (err) {
        res.status(500).json({ error: 'Auth error' });
    }
}

app.get('/api/auth/status', async (req, res) => {
    if (req.session.userId) {
        try {
            const doc = await db.collection('users').doc(req.session.userId).get();
            if (doc.exists) res.json({ connected: true, user: doc.data() });
            else res.json({ connected: false });
        } catch(e) {
            res.json({ connected: false });
        }
    } else {
        res.json({ connected: false });
    }
});

app.get('/api/auth/url', (req, res) => {
    const authUrl = getOAuthClient().generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES,
    });
    res.json({ url: authUrl });
});

app.get('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/oauth2callback', async (req, res) => {
    const code = req.query.code;
    if (code) {
        try {
            const auth = getOAuthClient();
            const { tokens } = await auth.getToken(code);
            auth.setCredentials(tokens);
            
            const oauth2 = google.oauth2({ version: 'v2', auth });
            const userInfo = await oauth2.userinfo.get();
            const profile = userInfo.data;

            const docRef = db.collection('users').doc(profile.id);
            const doc = await docRef.get();
            const rt = tokens.refresh_token || (doc.exists ? doc.data().refresh_token : null);
            
            await docRef.set({
                id: profile.id,
                email: profile.email,
                name: profile.name,
                picture: profile.picture,
                refresh_token: rt
            }, { merge: true });
            
            req.session.userId = profile.id;
            res.redirect('/');
        } catch (err) {
            console.error('Auth error:', err);
            res.redirect('/?error=auth_failed');
        }
    } else {
        res.redirect('/');
    }
});

async function getOrCreateRootFolder(drive) {
    const rootName = 'Life Journey Tracker';
    const query = `mimeType='application/vnd.google-apps.folder' and name='${rootName}' and 'root' in parents and trashed=false`;
    const res = await drive.files.list({ q: query, fields: 'files(id)' });
    if (res.data.files && res.data.files.length > 0) return res.data.files[0].id;
    const folder = await drive.files.create({ resource: { name: rootName, mimeType: 'application/vnd.google-apps.folder', parents: ['root'] }, fields: 'id' });
    return folder.data.id;
}

async function getOrCreateYearFolder(drive, yearStr) {
    const rootFolderId = await getOrCreateRootFolder(drive);
    const query = `mimeType='application/vnd.google-apps.folder' and name='${yearStr}' and '${rootFolderId}' in parents and trashed=false`;
    const res = await drive.files.list({ q: query, fields: 'files(id)' });
    if (res.data.files && res.data.files.length > 0) return res.data.files[0].id;
    const folder = await drive.files.create({ resource: { name: yearStr, mimeType: 'application/vnd.google-apps.folder', parents: [rootFolderId] }, fields: 'id' });
    return folder.data.id;
}

app.get('/api/events', async (req, res) => {
    if (!req.session.userId) return res.json([]);
    try {
        const eventsSnapshot = await db.collection('events').where('user_id', '==', req.session.userId).get();
        const eventsMap = {};
        const events = [];
        
        eventsSnapshot.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            data.media = [];
            events.push(data);
            eventsMap[doc.id] = data;
        });

        // Sort events in memory to avoid Firestore composite index requirement
        events.sort((a, b) => new Date(b.date) - new Date(a.date));

        const mediaSnapshot = await db.collection('media').where('user_id', '==', req.session.userId).get();
        mediaSnapshot.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            if (eventsMap[data.event_id]) {
                eventsMap[data.event_id].media.push(data);
            }
        });

        res.json(events);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/events', getDriveForUser, async (req, res) => {
    const { title, date, description } = req.body;
    try {
        let calendarYear = date ? new Date(date).getFullYear().toString() : "Unknown";
        await getOrCreateYearFolder(req.drive, calendarYear); // Just to ensure structure exists
        
        const newEvent = {
            user_id: req.session.userId,
            title, date, description
        };
        const docRef = await db.collection('events').add(newEvent);
        res.json({ id: docRef.id, ...newEvent, media: [] });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

async function uploadToDrive(drive, filePath, mimeType, originalName, parentFolderId) {
    const fileMetadata = { name: originalName, parents: [parentFolderId] };
    const media = { mimeType: mimeType, body: fs.createReadStream(filePath) };
    const file = await drive.files.create({ resource: fileMetadata, media: media, fields: 'id' });
    return file.data.id;
}

app.post('/api/events/:id/media', upload.array('media'), getDriveForUser, async (req, res) => {
    const eventId = req.params.id;
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded.' });
    
    try {
        const drive = req.drive;
        let eventDate = 'Unknown';
        const eventDoc = await db.collection('events').doc(eventId).get();
        if (eventDoc.exists) eventDate = eventDoc.data().date;
        
        let calendarYear = eventDate ? new Date(eventDate).getFullYear().toString() : 'Unknown';
        const yearFolderId = await getOrCreateYearFolder(drive, calendarYear);
        
        const uploadedMedia = [];
        for (const file of req.files) {
            const mimeType = file.mimetype;
            const mediaType = mimeType.startsWith('video/') ? 'video' : 'image';
            const driveFileId = await uploadToDrive(drive, file.path, mimeType, file.originalname, yearFolderId);
            try { fs.unlinkSync(file.path); } catch(e) {}
            
            const mediaUrl = '/api/drive/' + driveFileId;
            const newMedia = { event_id: eventId, user_id: req.session.userId, url: mediaUrl, type: mediaType };
            const docRef = await db.collection('media').add(newMedia);
            uploadedMedia.push({ id: docRef.id, ...newMedia });
        }
        res.json({ success: true, uploaded: uploadedMedia });
    } catch (err) {
        if (req.files) req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch(e) {} });
        res.status(500).json({ error: 'Failed to upload' });
    }
});

app.get('/api/drive/:fileId', getDriveForUser, async (req, res) => {
    try {
        const fileId = req.params.fileId;
        const drive = req.drive;
        const fileMeta = await drive.files.get({ fileId: fileId, fields: 'mimeType' });
        if (fileMeta.data.mimeType) res.setHeader('Content-Type', fileMeta.data.mimeType);
        
        const fetchOptions = { responseType: 'stream' };
        if (req.headers.range) fetchOptions.headers = { Range: req.headers.range };
        
        const driveResponse = await drive.files.get({ fileId: fileId, alt: 'media' }, fetchOptions);
        res.status(driveResponse.status);
        
        const h = driveResponse.headers;
        if (typeof h.get === 'function') {
            if (h.get('content-range')) res.setHeader('Content-Range', h.get('content-range'));
            if (h.get('content-length')) res.setHeader('Content-Length', h.get('content-length'));
        }
        res.setHeader('Accept-Ranges', 'bytes');
        
        driveResponse.data.on('error', () => { if (!res.headersSent) res.status(500).send('Error') }).pipe(res);
        req.on('close', () => { if (!res.writableEnded) driveResponse.data.destroy(); });
    } catch (err) {
        if (!res.headersSent) res.status(500).send('File not found');
    }
});

app.delete('/api/events/:id', getDriveForUser, async (req, res) => {
    const eventId = req.params.id;
    try {
        const mediaSnapshot = await db.collection('media').where('event_id', '==', eventId).get();
        for (const doc of mediaSnapshot.docs) {
            const driveFileId = doc.data().url.split('/').pop();
            await req.drive.files.delete({ fileId: driveFileId }).catch(() => {});
            await db.collection('media').doc(doc.id).delete();
        }
        await db.collection('events').doc(eventId).delete();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/media/:id', getDriveForUser, async (req, res) => {
    const mediaId = req.params.id;
    try {
        const doc = await db.collection('media').doc(mediaId).get();
        if (!doc.exists) return res.status(404).json({ error: 'Not found' });
        
        const driveFileId = doc.data().url.split('/').pop();
        await req.drive.files.delete({ fileId: driveFileId }).catch(() => {});
        await db.collection('media').doc(mediaId).delete();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
