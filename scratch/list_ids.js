import fs from 'fs';
import path from 'path';
import pg from 'pg';

const envPath = path.join(process.cwd(), '.env');
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

const databaseUrl = process.env.DATABASE_URL;
const cleanedUrl = databaseUrl ? databaseUrl.split('?')[0] : '';
const isRemote = databaseUrl && !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1');

const pool = new pg.Pool({
  connectionString: cleanedUrl || undefined,
  ssl: isRemote ? { rejectUnauthorized: false } : undefined,
});

async function run() {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT id, invoice_number, is_archived, is_deleted FROM invoices ORDER BY created_at DESC LIMIT 5');
    console.log(res.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
run();
