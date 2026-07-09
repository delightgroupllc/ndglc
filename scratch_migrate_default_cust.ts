import pg from 'pg';
const { Pool } = pg;

const envPath = '.env';
import fs from 'fs';
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

const databaseUrl = process.env.DATABASE_URL || '';
const cleanedUrl = databaseUrl.split('?')[0];

const pool = new Pool({
  connectionString: cleanedUrl || undefined,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('Running migration...');
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE companies 
      ADD COLUMN IF NOT EXISTS default_customer_id UUID;
    `);
    await client.query('COMMIT');
    console.log('Migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
