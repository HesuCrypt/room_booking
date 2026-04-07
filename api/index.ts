import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const app = express();
app.use(express.json());

let pool: pkg.Pool | null = null;
let isInitialized = false;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      const err = new Error('DATABASE_URL is not set. Please add it to your Vercel Project Settings -> Environment Variables.');
      (err as any).code = 'MISSING_SECRET';
      throw err;
    }
    if (connectionString.includes('[YOUR-PASSWORD]')) {
      const err = new Error('DATABASE_URL still contains [YOUR-PASSWORD]. Please replace it with your actual database password.');
      (err as any).code = 'INVALID_SECRET';
      throw err;
    }
    
    pool = new Pool({ 
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
}

async function ensureDB() {
  if (isInitialized) return;
  try {
    const db = getPool();
    await db.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        group_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        user_name TEXT NOT NULL,
        purpose TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    isInitialized = true;
  } catch (e: any) {
    console.error("Database connection/init failed:", e.message);
  }
}

// Diagnostic Route
app.get('/api/test', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'API is alive!', 
    timestamp: new Date().toISOString(),
    env: {
      has_db_url: !!process.env.DATABASE_URL,
      node_env: process.env.NODE_ENV,
      vercel: !!process.env.VERCEL
    }
  });
});

// API Routes
app.get('/api/bookings', async (req, res) => {
  try {
    await ensureDB();
    const { roomId, startDate, endDate } = req.query;
    const db = getPool();
    let result;
    
    if (roomId) {
      result = await db.query(
        'SELECT * FROM bookings WHERE room_id = $1 AND date >= $2 AND date <= $3',
        [roomId, startDate, endDate]
      );
    } else {
      result = await db.query(
        'SELECT * FROM bookings WHERE date >= $1 AND date <= $2',
        [startDate, endDate]
      );
    }
    res.json(result.rows);
  } catch (e: any) {
    res.status(e.code === 'MISSING_SECRET' || e.code === 'INVALID_SECRET' ? 503 : 500).json({ 
      error: e.message,
      code: e.code || 'INTERNAL_ERROR'
    });
  }
});

app.post('/api/bookings', async (req, res) => {
  try {
    await ensureDB();
    const bookings = req.body;
    const db = getPool();
    
    if (!bookings || !bookings.length) {
      res.json([]);
      return;
    }

    const roomId = bookings[0].room_id;
    const minDate = bookings.reduce((min: string, b: any) => b.date < min ? b.date : min, bookings[0].date);
    const maxDate = bookings.reduce((max: string, b: any) => b.date > max ? b.date : max, bookings[0].date);

    // Fetch existing bookings in this range
    const existing = await db.query(
      'SELECT date, time FROM bookings WHERE room_id = $1 AND date >= $2 AND date <= $3',
      [roomId, minDate, maxDate]
    );

    const conflicts: string[] = [];
    for (const b of bookings) {
      const isConflict = existing.rows.some((e: any) => e.date === b.date && e.time === b.time);
      if (isConflict) {
        conflicts.push(`${b.date} at ${b.time}`);
      }
    }

    if (conflicts.length > 0) {
      return res.status(409).json({ 
        error: `Conflict detected for: ${conflicts.slice(0, 3).join(', ')}`,
        code: 'CONFLICT'
      });
    }

    const values: any[] = [];
    const placeholders = bookings.map((b: any, i: number) => {
      const offset = i * 6;
      values.push(b.group_id, b.room_id, b.date, b.time, b.user_name, b.purpose);
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
    }).join(', ');

    const result = await db.query(`
      INSERT INTO bookings (group_id, room_id, date, time, user_name, purpose)
      VALUES ${placeholders}
      RETURNING *;
    `, values);
    
    res.json(result.rows);
  } catch (e: any) {
    res.status(e.code === 'MISSING_SECRET' || e.code === 'INVALID_SECRET' ? 503 : 500).json({ 
      error: e.message,
      code: e.code || 'INTERNAL_ERROR'
    });
  }
});

app.delete('/api/bookings/:groupId', async (req, res) => {
  try {
    await ensureDB();
    const { groupId } = req.params;
    const db = getPool();
    await db.query('DELETE FROM bookings WHERE group_id = $1', [groupId]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(e.code === 'MISSING_SECRET' || e.code === 'INVALID_SECRET' ? 503 : 500).json({ 
      error: e.message,
      code: e.code || 'INTERNAL_ERROR'
    });
  }
});

// Fallback for non-API routes (locally)
if (!process.env.VERCEL) {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
}

export default app;
