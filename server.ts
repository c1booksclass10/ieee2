import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import admin from 'firebase-admin';

admin.initializeApp({
  projectId: 'ieee-its-b6c77'
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database('nightslip.db');

// The URL of your published Google Apps Script Web App
// Change this to the URL you get after deploying the Apps Script
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxAgZcW5nvWhPSTtoiMeD06cSMA3FmX4qHOJtdADOBJuQX1rK63QESjxg8-mkdWaQ5Brg/exec';

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    reg_no TEXT,
    email TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date_string TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date_id INTEGER NOT NULL,
    coming TEXT DEFAULT 'NOT COMING',
    applied TEXT DEFAULT 'NOT APPLIED',
    attendance_1 TEXT DEFAULT 'ABSENT',
    attendance_2 TEXT DEFAULT 'ABSENT',
    is_locked INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(date_id) REFERENCES dates(id),
    UNIQUE(user_id, date_id)
  );
`);

// Try migrating old entries if they exist
try {
  const hasEntries = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entries'").get();
  if (hasEntries) {
    db.exec(`INSERT OR IGNORE INTO users (name, email) SELECT DISTINCT name, email FROM entries;`);
  }
} catch (e) { }


declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_EMAILS = ['ieeeitsvitvellore@gmail.com', 'liki123456m@gmail.com'];


app.use(express.json());
app.use(cookieParser());

// Update CORS to support multiple origins including Netlify
const allowedOrigins = [
  'http://localhost:5173', 
  'http://localhost:3000', 
  'https://friendly-bublanina-52de2c.netlify.app'
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Middleware to check authentication
const authenticate = async (req: any, res: any, next: any) => {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// Auth Routes
app.post('/api/auth/login', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
    res.json({ success: true, user: decodedToken });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const token = req.cookies.auth_token;
  if (!token) return res.json({ user: null });

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    res.json({ user: decodedToken });
  } catch (error) {
    res.json({ user: null });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.clearCookie('access_token');
  res.json({ success: true });
});


// Date Routes
app.get('/api/dates', authenticate, (req, res) => {
  const dates = db.prepare('SELECT * FROM dates ORDER BY date_string DESC').all();
  res.json(dates);
});

app.post('/api/dates', authenticate, (req, res) => {
  if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });
  const { date_string } = req.body;
  try {
    const info = db.prepare('INSERT INTO dates (date_string) VALUES (?)').run(date_string);
    res.json({ id: info.lastInsertRowid, date_string });
  } catch (error) {
    res.status(400).json({ error: 'Date already exists' });
  }
});

app.delete('/api/dates/:id', authenticate, (req, res) => {
  if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM dates WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Sync entries to Google Apps Script
const syncToAppsScript = async () => {
  if (APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_WEB_APP_URL_HERE') {
    console.log('Apps Script URL not set. Skipping sync.');
    return;
  }

  try {
    // Fetch all needed data
    const allDates = db.prepare('SELECT * FROM dates ORDER BY id ASC').all() as any[];
    const allUsers = db.prepare('SELECT * FROM users ORDER BY name ASC').all() as any[];
    const allEntries = db.prepare('SELECT * FROM attendance').all() as any[];

    // Structure the payload for Apps Script
    const payload = {
      dates: allDates,
      users: allUsers,
      attendance: allEntries
    };

    // Send to Google Apps Script Web App
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

  } catch (error) {
    console.error('Apps Script Sync Error:', error);
  }
};


// Users Routes (Master Data)
app.get('/api/users', authenticate, (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY name ASC').all();
  res.json(users);
});

app.post('/api/users', authenticate, (req: any, res: any) => {
  if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });
  const { users } = req.body;
  if (!Array.isArray(users)) return res.status(400).json({ error: 'Expected users array' });

  const insert = db.prepare('INSERT OR IGNORE INTO users (name, reg_no, email) VALUES (?, ?, ?)');
  const update = db.prepare('UPDATE users SET name = ?, reg_no = ? WHERE email = ?');

  const transaction = db.transaction((usersToSave) => {
    for (const u of usersToSave) {
      if (!u.email || !u.name) continue;
      const res = insert.run(u.name, u.reg_no || '', u.email);
      if (res.changes === 0) {
        update.run(u.name, u.reg_no || '', u.email); // Update name/reg_no if email already exists
      }
    }
  });

  transaction(users);
  
  syncToAppsScript();

  res.json({ success: true });
});

app.patch('/api/users/:id', authenticate, (req: any, res: any) => {
  if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });
  const { field, value } = req.body;
  if (!['name', 'email', 'reg_no'].includes(field)) return res.status(400).json({ error: 'Invalid field' });
  
  db.prepare(`UPDATE users SET ${field} = ? WHERE id = ?`).run(value, req.params.id);
  syncToAppsScript();
  
  res.json({ success: true });
});

app.delete('/api/users/:id', authenticate, (req: any, res: any) => {
  if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });
  
  // Due to SQLite foreign keys, deleting a user will delete all their attendance records
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);

  syncToAppsScript();

  res.json({ success: true });
});

// Entry Routes
app.get('/api/dates/:dateId/entries', authenticate, (req, res) => {
  const entries = db.prepare(`
    SELECT u.id as id, u.name, u.reg_no, u.email,
           IFNULL(a.coming, 'NOT COMING') as coming,
           IFNULL(a.applied, 'NOT APPLIED') as applied,
           IFNULL(a.attendance_1, 'ABSENT') as attendance_1,
           IFNULL(a.attendance_2, 'ABSENT') as attendance_2,
           IFNULL(a.is_locked, 0) as is_locked
    FROM users u
    LEFT JOIN attendance a ON a.user_id = u.id AND a.date_id = ?
    ORDER BY u.name ASC
  `).all(req.params.dateId);
  res.json(entries);
});

app.patch('/api/dates/:dateId/users/:userId', authenticate, async (req: any, res: any) => {
  const { dateId, userId } = req.params;
  const { field, value } = req.body;
  const userEmail = req.user.email;
  const isOwner = ADMIN_EMAILS.includes(userEmail);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });

  const isTargetUser = userEmail.toLowerCase() === user.email.toLowerCase();

  let attendance = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date_id = ?').get(userId, dateId) as any;
  if (!attendance) {
    attendance = { coming: 'NOT COMING', applied: 'NOT APPLIED', attendance_1: 'ABSENT', attendance_2: 'ABSENT', is_locked: 0 };
  }

  if (!isOwner) {
    if (!isTargetUser || (field !== 'coming' && field !== 'applied')) {
      return res.status(403).json({ error: 'Access Denied: You can only edit your own row (Coming/Applied).' });
    }
    if (attendance.is_locked === 1) {
      return res.status(403).json({ error: 'Submission Locked: You have already used your one chance to edit.' });
    }
  }

  let updates: any = { [field]: value };

  if (!isOwner || (isOwner && ['coming', 'applied'].includes(field))) {
    if (field === 'coming') {
      updates.applied = 'NOT APPLIED';
      updates.attendance_1 = 'ABSENT';
      updates.attendance_2 = 'ABSENT';
    }

    if (field === 'applied') {
      const comingVal = field === 'coming' ? value : attendance.coming;
      const appliedVal = field === 'applied' ? value : attendance.applied;

      if (comingVal.toUpperCase() === 'COMING' && appliedVal.toUpperCase() === 'APPLIED') {
        updates.attendance_1 = 'PRESENT';
        updates.attendance_2 = 'PRESENT';
      } else {
        updates.attendance_1 = 'ABSENT';
        updates.attendance_2 = 'ABSENT';
      }
      if (!isOwner) {
        updates.is_locked = 1;
      }
    }
  }

  if (isOwner && !['coming', 'applied'].includes(field)) {
    updates = { [field]: value };
  }

  const newComing = updates.coming || attendance.coming;
  const newApplied = updates.applied || attendance.applied;
  const newAtt1 = updates.attendance_1 || attendance.attendance_1;
  const newAtt2 = updates.attendance_2 || attendance.attendance_2;
  const newLocked = updates.is_locked !== undefined ? updates.is_locked : attendance.is_locked;

  db.prepare(`
    INSERT INTO attendance (user_id, date_id, coming, applied, attendance_1, attendance_2, is_locked)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, date_id) DO UPDATE SET
      coming=excluded.coming,
      applied=excluded.applied,
      attendance_1=excluded.attendance_1,
      attendance_2=excluded.attendance_2,
      is_locked=excluded.is_locked
  `).run(userId, dateId, newComing, newApplied, newAtt1, newAtt2, newLocked);

  syncToAppsScript();

  res.json({ success: true });
});

app.post('/api/dates/:dateId/reset', authenticate, async (req: any, res: any) => {
  if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });

  db.prepare('DELETE FROM attendance WHERE date_id = ?').run(req.params.dateId);

  syncToAppsScript();

  res.json({ success: true });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
