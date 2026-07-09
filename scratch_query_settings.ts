import pg from 'pg';
const { Pool } = pg;
import fs from 'fs';

const envPath = '.env';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;
    const eqIdx = trimmedLine.indexOf('=');
    if (eqIdx !== -1) {
      process.env[trimmedLine.substring(0, eqIdx).trim()] = trimmedLine.substring(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.split('?')[0],
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT * FROM settings');
    console.log('--- SETTINGS ROWS ---');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Failed to query settings:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
