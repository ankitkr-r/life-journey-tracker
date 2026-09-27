const fs = require('fs');

let code = fs.readFileSync('server.js', 'utf8');

// Replace sqlite3 with firebase-admin
code = code.replace(/const sqlite3 = require\('sqlite3'\)\.verbose\(\);/, `const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();`);

code = code.replace(/const db = new sqlite3\.Database\([\s\S]*?\}\);/, '');

// getDriveForUser
code = code.replace(/function getDriveForUser[\s\S]*?next\(\);\s*\}\s*\}\);\s*\}/, `async function getDriveForUser(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    try {
        const doc = await db.collection('users').doc(req.session.userId).get();
        if (!doc.exists || !doc.data().refresh_token) return res.status(401).json({ error: 'Please reconnect Google Drive' });
        const auth = getOAuthClient();
        auth.setCredentials({ refresh_token: doc.data().refresh_token });
        req.drive = google.drive({ version: 'v3', auth });
        next();
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
}`);

// auth/status
code = code.replace(/app\.get\('\/api\/auth\/status'[\s\S]*?\}\);/, `app.get('/api/auth/status', async (req, res) => {
    if (req.session.userId) {
        const doc = await db.collection('users').doc(req.session.userId).get();
        if (doc.exists) res.json({ connected: true, user: doc.data() });
        else res.json({ connected: false });
    } else {
        res.json({ connected: false });
    }
});`);

// oauth2callback
code = code.replace(/db\.get\('SELECT refresh_token FROM users[\s\S]*?\}\);\s*\}\);/, `const docRef = db.collection('users').doc(profile.id);
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
            res.redirect('/');`);

// getEvents
code = code.replace(/app\.get\('\/api\/events'[\s\S]*?\}\);\s*\}\);/, `app.get('/api/events', async (req, res) => {
    if (!req.session.userId) return res.json([]);
    try {
        const eventsSnapshot = await db.collection('events').where('user_id', '==', req.session.userId).orderBy('date', 'desc').get();
        const events = [];
        const eventsMap = {};
        for (const doc of eventsSnapshot.docs) {
            const data = doc.data();
            data.id = doc.id;
            data.media = [];
            events.push(data);
            eventsMap[doc.id] = data;
        }
        
        const mediaSnapshot = await db.collection('media').where('user_id', '==', req.session.userId).get();
        for (const doc of mediaSnapshot.docs) {
            const data = doc.data();
            data.id = doc.id;
            if (eventsMap[data.event_id]) {
                eventsMap[data.event_id].media.push(data);
            }
        }
        res.json(events);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});`);

// postEvents
code = code.replace(/db\.run\('INSERT INTO events[\s\S]*?\}\);/, `
    try {
        const newEvent = {
            user_id: req.session.userId,
            title, date, description
        };
        const docRef = await db.collection('events').add(newEvent);
        res.json({ id: docRef.id, ...newEvent, media: [] });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }`);

// postMedia
code = code.replace(/await new Promise\(\(res, rej\) => db\.get\('SELECT date FROM events WHERE id = \?', \[eventId\], \(err, r\) => r \? res\(r\.date\) : res\(null\)\)\)\.then\(d => eventDate = d\);/, `const doc = await db.collection('events').doc(eventId).get();
        if (doc.exists) eventDate = doc.data().date;`);

code = code.replace(/await new Promise\(\(resolve\) => \{\s*db\.run\('INSERT INTO media[\s\S]*?\}\);\s*\}\);/, `const newMedia = { event_id: eventId, user_id: req.session.userId, url: mediaUrl, type: mediaType };
            const docRef = await db.collection('media').add(newMedia);
            uploadedMedia.push({ id: docRef.id, ...newMedia });`);

// deleteEvent
code = code.replace(/db\.all\('SELECT url FROM media WHERE event_id = \?'[\s\S]*?\}\);\s*\}\);/, `try {
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
    }`);

// deleteMedia
code = code.replace(/db\.get\('SELECT url FROM media WHERE id = \?'[\s\S]*?\}\);\s*\}\);/, `try {
        const doc = await db.collection('media').doc(mediaId).get();
        if (!doc.exists) return res.status(404).json({ error: 'Not found' });
        const driveFileId = doc.data().url.split('/').pop();
        await req.drive.files.delete({ fileId: driveFileId }).catch(() => {});
        await db.collection('media').doc(mediaId).delete();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }`);

fs.writeFileSync('server.js', code);
console.log('Done rewriting server.js');
