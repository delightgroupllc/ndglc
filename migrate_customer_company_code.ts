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
  const { pool } = await import('./src/lib/db');
  const client = await pool.connect();
  try {
    console.log('Starting migration to add Customer and Company codes...');
    await client.query('BEGIN');

    // 1. Add code column to customers
    await client.query(`
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS code TEXT UNIQUE;
    `);

    // 2. Add code column to companies
    await client.query(`
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS code TEXT UNIQUE;
    `);

    // 3. Migrate existing customers
    const custRes = await client.query('SELECT id, name FROM customers WHERE code IS NULL');
    console.log(`Migrating ${custRes.rows.length} customers...`);
    let custSeq = 1000;
    for (const row of custRes.rows) {
      custSeq++;
      const code = `CUS-${custSeq}`;
      await client.query('UPDATE customers SET code = $1 WHERE id = $2', [code, row.id]);
    }

    // 4. Migrate existing companies
    const compRes = await client.query('SELECT id, name FROM companies WHERE code IS NULL');
    console.log(`Migrating ${compRes.rows.length} companies...`);
    let compSeq = 1000;
    for (const row of compRes.rows) {
      compSeq++;
      const code = `COM-${compSeq}`;
      await client.query('UPDATE companies SET code = $1 WHERE id = $2', [code, row.id]);
    }

    await client.query('COMMIT');
    console.log('Migration succeeded!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
