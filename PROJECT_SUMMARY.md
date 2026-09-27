# IIT BHU College Experience Tracker - Project Summary

This document summarizes the current state of the College Experience Tracker project, all the features we have built, and how the underlying technology works. You can use this as a reference when you return to continue working on it.

## 🎯 Project Overview
A visually stunning, personal web application to track trips, events, and memories from your time at IIT BHU. It allows you to create events, group them by year, and upload unlimited photos/videos directly to your personal Google Drive to save local storage space.

---

## ✨ Features Implemented

### 1. User Interface & Experience (UI/UX)
*   **Travel Aesthetic**: The website features a beautiful, high-quality mountain travel background with a frosted glass (glassmorphism) design for the cards.
*   **Two-Page Navigation**: 
    *   **Page 1 (Years)**: Displays large folder-like cards for each Calendar Year (e.g., 2024, 2025). 
    *   **Page 2 (Trips)**: Clicking a year opens a grid of all the trips taken during that year, with a "Back to Years" button to navigate home.
*   **Grid Layout**: Replaced the old vertical tree layout with a clean, responsive row-based grid system.
*   **Dynamic Card Backgrounds**: The first photo uploaded to a trip automatically becomes the faded background image for that specific trip's card.

### 2. Media Gallery & Lightbox
*   **Carousel Scroll**: Clicking "View Images" on a trip opens a pop-up modal. Images and videos are displayed one at a time, taking up the full width of the window. You can scroll horizontally to "snap" to the next photo.
*   **Fullscreen Mode**: Clicking directly on any image or video inside the carousel will pop it open into native Fullscreen mode.
*   **Auto-Hide Missing Files**: If a photo is ever manually deleted from Google Drive, the website detects the error and automatically hides the broken image icon.

### 3. Google Drive Integration (OAuth 2.0)
*   **Bypassing Bot Limits**: Standard Service Accounts are blocked from uploading files on free Gmail accounts due to quota restrictions. We successfully implemented a **"Sign in with Google"** (OAuth 2.0) flow to bypass this.
*   **Direct Upload**: When you log in, the website acts on your behalf and uploads files directly into your personal Google Drive storage.
*   **Multiple File Uploads**: You can select and upload multiple images/videos simultaneously. The backend seamlessly loops through and uploads them all in one go.
*   **Streaming**: The backend proxies the images from Google Drive directly to the frontend (`/api/drive/:fileId`), keeping the actual Drive URLs private.

---

## 🛠️ Tech Stack & Architecture
*   **Frontend**: Pure HTML5, CSS3, and Vanilla JavaScript (`index.html`, `style.css`, `script.js`). No complex frontend frameworks.
*   **Backend**: Node.js with Express (`server.js`).
*   **Database**: SQLite (`database.sqlite`).
    *   `events` table: Stores the trip title, date, description, and academic year.
    *   `media` table: Stores the Google Drive URL and file type (image/video), linked to an event.
*   **Storage**: Google Drive API (`googleapis` package).
*   **File Handling**: `multer` for temporarily saving files to the server before immediately sending them to Google Drive and deleting the temporary file.

---

## 🚀 How to Run the Project

If you ever need to start the website after closing your computer:

1. Open your terminal (Command Prompt or VS Code Terminal).
2. Navigate to the project folder:
   ```bash
   cd d:\IIT_BHU\Collage_exp
   ```
3. Start the server:
   ```bash
   node server.js
   ```
4. Open your web browser and go to: **[http://localhost:3000](http://localhost:3000)**

---

## 📂 File Structure Guide
*   **`server.js`**: The brains of the operation. Handles the database connection, Google OAuth login, file uploading, and API endpoints.
*   **`public/index.html`**: The structure of the website, including the header, main views, and popup modals.
*   **`public/style.css`**: The styling, animations, backgrounds, and layout grids.
*   **`public/script.js`**: The frontend logic that fetches data from the server, switches between pages, and handles form submissions.
*   **`oauth2.json`**: Your Google Cloud Client ID credentials (Keep this secret!).
*   **`token.json`**: The active Google login session (Auto-generated when you click "Connect Google Drive").
*   **`database.sqlite`**: Your actual database file containing all your written trips (Don't delete this!).
