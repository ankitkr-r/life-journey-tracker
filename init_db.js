const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'), (err) => {
    if (err) {
        console.error('Could not connect to database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        
        // Reset and create tables
        db.serialize(() => {
            db.run("DROP TABLE IF EXISTS media");
            db.run("DROP TABLE IF EXISTS events");

            db.run(`CREATE TABLE events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                date TEXT NOT NULL,
                description TEXT,
                year TEXT
            )`);

            db.run(`CREATE TABLE media (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER,
                url TEXT NOT NULL,
                type TEXT NOT NULL,
                FOREIGN KEY(event_id) REFERENCES events(id)
            )`, () => {
                console.log("Tables 'events' and 'media' ready. Inserting initial data...");
                insertData();
            });
        });
    }
});

const initialEvents = [
    // 1st Year
    { title: "Admission & Orientation", date: "2024-07-28", description: "Admission date, then after orientation for somedays then after Classes stared", year: "1st Year" },
    { title: "Exploring Campus", date: "2024-08-15", description: "Started exploring campus and all and along with attending classes also", year: "1st Year" },
    { title: "College Event", date: "2024-10-01", description: "College event", year: "1st Year" },
    { title: "Lakhaniya Dari Waterfall", date: "2024-10-20", description: "Trip to Lakhaniya Dari Waterfall", year: "1st Year" },
    { title: "CSE Fresher Party", date: "2024-10-26", description: "CSE fresher Party", year: "1st Year" },
    { title: "Varanasi Trip", date: "2024-10-28", description: "Varanasi trip", year: "1st Year" },
    { title: "Ramanagar Fort", date: "2024-11-19", description: "Visited Ramanagar fort", year: "1st Year" },
    { title: "Ayodhya Trip", date: "2024-11-25", description: "Ayodhya trip", year: "1st Year" },
    { title: "Sarnath Trip", date: "2024-11-26", description: "Sarnath Trip", year: "1st Year" },
    { title: "Ramanagar Fort 2nd Visit", date: "2024-11-27", description: "Visited Ramanagar fort again", year: "1st Year" },
    { title: "Dakshana Felicitation", date: "2024-12-26", description: "Dakshana felicitation", year: "1st Year" },
    { title: "Many College Events", date: "2025-01-15", description: "Participated in many college events", year: "1st Year" },
    { title: "Kumbh Trip", date: "2025-02-18", description: "Kumbh trip day 1", year: "1st Year" },
    { title: "Kumbh Trip", date: "2025-02-27", description: "Kumbh trip day 2", year: "1st Year" },
    { title: "Last Day of 1st Year", date: "2025-05-03", description: "Last day of 1st Year", year: "1st Year" },
    
    // 2nd Year
    { title: "Sarnath Trip", date: "2025-07-20", description: "Sarnath Trip", year: "2nd Year" },
    { title: "Swarved", date: "2025-07-26", description: "Visited Swarved", year: "2nd Year" },
    { title: "Rajdari Waterfall", date: "2025-10-18", description: "Rajdari Waterfall", year: "2nd Year" },
    { title: "Campus wali Diwali", date: "2025-10-20", description: "Campus wali diwali", year: "2nd Year" },
    { title: "Dev Diwali", date: "2025-11-04", description: "Dev diwali 4-5 Nov", year: "2nd Year" },
    { title: "Lucknow Trip", date: "2025-11-25", description: "Lucknow trip", year: "2nd Year" },
    { title: "College Event", date: "2026-01-16", description: "College event 16-18 Jan", year: "2nd Year" },
    { title: "Sahyog Gram Mela", date: "2026-02-01", description: "Sahyog Gram mela", year: "2nd Year" },
    { title: "Holi", date: "2026-02-26", description: "Holi celebrations", year: "2nd Year" },
    { title: "College Event", date: "2026-03-13", description: "College event 13-15 March", year: "2nd Year" },
    { title: "Dakshana Party", date: "2026-03-21", description: "Dakshana party", year: "2nd Year" },
    { title: "Waterpark", date: "2026-03-31", description: "Waterpark visit", year: "2nd Year" },
    { title: "Sahyog Farewell", date: "2026-04-10", description: "Sahyog Farewell", year: "2nd Year" },
    { title: "Last Day of 2nd Year", date: "2026-05-06", description: "Last day of 2nd year", year: "2nd Year" },
    
    // 3rd Year
    { title: "Patna Trip [H]", date: "2026-06-03", description: "Patna trip [H]", year: "3rd Year" }
];

function insertData() {
    const stmt = db.prepare(`INSERT INTO events (title, date, description, year) VALUES (?, ?, ?, ?)`);
    
    let count = 0;
    initialEvents.forEach((event) => {
        stmt.run([event.title, event.date, event.description, event.year], (err) => {
            if (err) {
                console.error("Error inserting event:", err.message);
            }
            count++;
            if (count === initialEvents.length) {
                console.log("All initial data inserted successfully!");
                stmt.finalize();
                db.close();
            }
        });
    });
}
