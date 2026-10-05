const sqlite3 = require('sqlite3').verbose();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase-service-account.json');

initializeApp({
  credential: cert(serviceAccount)
});
const firestore = getFirestore();
const db = new sqlite3.Database('./database.sqlite');

async function migrate() {
  db.all('SELECT * FROM events', [], async (err, events) => {
    if (err) throw err;
    
    db.all('SELECT * FROM media', [], async (err, media) => {
       if (err) throw err;

       console.log(`Found ${events.length} events and ${media.length} media.`);
       const oldToNewEventIds = {};

       for (const event of events) {
         const newEvent = {
             user_id: event.user_id,
             title: event.title,
             date: event.date,
             description: event.description,
             year: event.year || null
         };
         
         const docRef = await firestore.collection('events').add(newEvent);
         oldToNewEventIds[event.id] = docRef.id;
         console.log(`Migrated event: ${event.title}`);
       }

       for (const item of media) {
         if (oldToNewEventIds[item.event_id]) {
             // Find parent event to get user_id
             const parentEvent = events.find(e => e.id === item.event_id);
             
             const newMedia = {
                 user_id: parentEvent ? parentEvent.user_id : '114822513094298424038',
                 event_id: oldToNewEventIds[item.event_id],
                 url: item.url,
                 type: item.type
             };
             await firestore.collection('media').add(newMedia);
             console.log(`Migrated media for old event ID: ${item.event_id}`);
         }
       }
       
       console.log("Migration complete!");
       process.exit(0);
    });
  });
}

migrate();
