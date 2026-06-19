import pg from 'pg';
import fs from 'fs';
import path from 'path';

// Parse .env manually
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;
    const eqIdx = trimmedLine.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmedLine.substring(0, eqIdx).trim();
      const val = trimmedLine.substring(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      process.env[key] = val;
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

async function main() {
  const client = await pool.connect();
  try {
    console.log('Beginning signatory migration...');
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS signatory_incharge TEXT;
    `);

    await client.query('COMMIT');
    console.log('Signatory migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Signatory migration failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
