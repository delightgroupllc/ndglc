import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL env var not found");
  process.exit(1);
}

const cleanedUrl = databaseUrl.split('?')[0];
const sslModeMatch = databaseUrl.match(/[?&]sslmode=([^&]+)/);
const sslMode = sslModeMatch ? sslModeMatch[1] : null;

let sslConfig = undefined;
if (!databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1')) {
  sslConfig = { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString: cleanedUrl,
  ssl: sslConfig,
});

try {
  const res = await pool.query("SELECT key, value FROM settings");
  console.log("─── SETTINGS TABLE ────────────────");
  res.rows.forEach(row => {
    console.log(`${row.key}: ${row.value}`);
  });
  console.log("───────────────────────────────────");
} catch (err) {
  console.error("Error querying settings:", err);
} finally {
  await pool.end();
}
