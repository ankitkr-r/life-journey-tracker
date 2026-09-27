const { google } = require('googleapis');
const fs = require('fs');
const tokenPath = './token.json';
const credentialsPath = './oauth2.json';
const rawCredentials = fs.readFileSync(credentialsPath);
const credentials = JSON.parse(rawCredentials);
const {client_secret, client_id, redirect_uris} = credentials.web || credentials.installed;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(tokenPath)));
const drive = google.drive({ version: 'v3', auth: oAuth2Client });

async function test() {
    const list = await drive.files.list({ pageSize: 1, q: "mimeType contains 'video'" });
    if (!list.data.files.length) return console.log('no video');
    const fileId = list.data.files[0].id;
    console.log('File ID:', fileId);
    
    const res = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream', headers: { Range: 'bytes=0-100' } }
    );
    console.log('Status:', res.status);
    console.log('Headers:', res.headers);
}
test().catch(console.error);
