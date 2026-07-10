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

async function run() {
  const { pool } = await import('../src/lib/db.js');
  const client = await pool.connect();
  try {
    console.log('Adding status column to warehouses table...');
    await client.query('BEGIN');

    // Add status column with CHECK constraint
    await client.query(`
      ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'archived', 'deleted'));
    `);
    console.log('Added status column with active/archived/deleted CHECK constraint.');

    await client.query('COMMIT');
    console.log('Status column migration completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Status column migration failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

run();
