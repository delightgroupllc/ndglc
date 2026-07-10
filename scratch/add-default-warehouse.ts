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
    console.log('Adding is_default column to warehouses table...');
    await client.query('BEGIN');

    // Add is_default column
    await client.query(`
      ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE NOT NULL;
    `);
    console.log('Added is_default column.');

    // Set Warehouse Alpha as default
    await client.query(`
      UPDATE warehouses SET is_default = TRUE WHERE name = 'Warehouse Alpha';
    `);
    console.log('Set Warehouse Alpha as default warehouse.');

    await client.query('COMMIT');
    console.log('is_default column migration completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('is_default column migration failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

run();
