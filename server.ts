import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import admin from 'firebase-admin';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// =======================
// Firebase Admin Setup
// =======================
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!serviceAccountJson) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set');
}

const serviceAccount = JSON.parse(serviceAccountJson) as admin.ServiceAccount;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// =======================
// Database Setup
// =======================
const dbPath = process.env.SQLITE_DB_PATH || './nightslip.db';
const db = new Database(dbPath);

// =======================
// Middleware
// =======================
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// =======================
// AUTH ROUTES
// =======================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { token } = req.body;
    await admin.auth().verifyIdToken(token);

    res.cookie('session', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none'
    });

    res.json({ success: true });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('session');
  res.json({ success: true });
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const token = req.cookies.session;
    if (!token) return res.json({ user: null });

    const decoded = await admin.auth().verifyIdToken(token);
    res.json({ user: decoded });
  } catch {
    res.json({ user: null });
  }
});

// =======================
// AUTH MIDDLEWARE
// =======================
const requireAuth = async (req: any, res: any, next: any) => {
  try {
    const token = req.cookies.session;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// =======================
// DATE ROUTES
// =======================

app.get('/api/dates', requireAuth, async (_, res) => {
  const rows = db.prepare('SELECT * FROM dates ORDER BY date_string DESC').all();
  res.json(rows);
});

app.post('/api/dates', requireAuth, async (req, res) => {
  const { date_string } = req.body;
  db.prepare('INSERT INTO dates (date_string) VALUES (?)').run(date_string);
  res.json({ success: true });
});

app.delete('/api/dates/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM dates WHERE id = ?').run(id);
  res.json({ success: true });
});

// =======================
// ENTRIES ROUTES
// =======================

app.get('/api/dates/:id/entries', requireAuth, async (req, res) => {
  const { id } = req.params;
  const rows = db.prepare('SELECT * FROM entries WHERE date_id = ?').all(id);
  res.json(rows);
});

app.patch('/api/dates/:dateId/users/:userId', requireAuth, async (req, res) => {
  const { dateId, userId } = req.params;
  const { field, value } = req.body;

  db.prepare(`UPDATE entries SET ${field} = ? WHERE id = ? AND date_id = ?`).run(value, userId, dateId);

  res.json({ success: true });
});

app.post('/api/dates/:id/reset', requireAuth, async (req, res) => {
  const { id } = req.params;

  db.prepare(
    `UPDATE entries
     SET coming='NOT COMING',
         applied='NOT APPLIED',
         attendance_1='ABSENT',
         attendance_2='ABSENT',
         is_locked=0
     WHERE date_id=?`
  ).run(id);

  res.json({ success: true });
});

// =======================
// USERS ROUTES
// =======================

app.post('/api/users', requireAuth, async (req, res) => {
  const { users } = req.body;

  for (const user of users) {
    db.prepare(
      `INSERT INTO entries (name, reg_no, email, coming, applied, attendance_1, attendance_2, is_locked)
       VALUES (?,?,?,'NOT COMING','NOT APPLIED','ABSENT','ABSENT',0)`
    ).run(user.name, user.reg_no, user.email);
  }

  res.json({ success: true });
});

app.patch('/api/users/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { field, value } = req.body;

  db.prepare(`UPDATE entries SET ${field} = ? WHERE id = ?`).run(value, id);

  res.json({ success: true });
});

app.delete('/api/users/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM entries WHERE id=?').run(id);
  res.json({ success: true });
});

// =======================
// START SERVER
// =======================

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
