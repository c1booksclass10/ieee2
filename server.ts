import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import admin from 'firebase-admin';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// =======================
// Firebase Admin Setup
// =======================
import serviceAccount from './firebase-service-account.json';

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount)
});

// =======================
// Database Setup
// =======================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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
    const decoded = await admin.auth().verifyIdToken(token);

    res.cookie('session', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none'
    });

    res.json({ success: true });
  } catch (err) {
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
  const result = await pool.query('SELECT * FROM dates ORDER BY date_string DESC');
  res.json(result.rows);
});

app.post('/api/dates', requireAuth, async (req, res) => {
  const { date_string } = req.body;
  await pool.query('INSERT INTO dates (date_string) VALUES ($1)', [date_string]);
  res.json({ success: true });
});

app.delete('/api/dates/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM dates WHERE id = $1', [id]);
  res.json({ success: true });
});

// =======================
// ENTRIES ROUTES
// =======================

app.get('/api/dates/:id/entries', requireAuth, async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    'SELECT * FROM entries WHERE date_id = $1',
    [id]
  );
  res.json(result.rows);
});

app.patch('/api/dates/:dateId/users/:userId', requireAuth, async (req, res) => {
  const { dateId, userId } = req.params;
  const { field, value } = req.body;

  await pool.query(
    `UPDATE entries SET ${field} = $1 WHERE id = $2 AND date_id = $3`,
    [value, userId, dateId]
  );

  res.json({ success: true });
});

app.post('/api/dates/:id/reset', requireAuth, async (req, res) => {
  const { id } = req.params;

  await pool.query(
    `UPDATE entries
     SET coming='NOT COMING',
         applied='NOT APPLIED',
         attendance_1='ABSENT',
         attendance_2='ABSENT',
         is_locked=0
     WHERE date_id=$1`,
    [id]
  );

  res.json({ success: true });
});

// =======================
// USERS ROUTES
// =======================

app.post('/api/users', requireAuth, async (req, res) => {
  const { users } = req.body;

  for (const user of users) {
    await pool.query(
      `INSERT INTO entries (name, reg_no, email, coming, applied, attendance_1, attendance_2, is_locked)
       VALUES ($1,$2,$3,'NOT COMING','NOT APPLIED','ABSENT','ABSENT',0)`,
      [user.name, user.reg_no, user.email]
    );
  }

  res.json({ success: true });
});

app.patch('/api/users/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { field, value } = req.body;

  await pool.query(
    `UPDATE entries SET ${field} = $1 WHERE id = $2`,
    [value, id]
  );

  res.json({ success: true });
});

app.delete('/api/users/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM entries WHERE id=$1', [id]);
  res.json({ success: true });
});

// =======================
// START SERVER
// =======================

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
