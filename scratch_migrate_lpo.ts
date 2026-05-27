import fs from 'fs';
import path from 'path';

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

async function migrate() {
  const { pool } = await import('./src/lib/db');
  try {
    console.log('Running invoices schema migrations for LPO and Payment Terms...');
    
    // Add columns
    await pool.query(`
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS lpo_number TEXT;
    `);
    await pool.query(`
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_terms TEXT;
    `);

    console.log('Successfully completed invoices table migrations!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}
migrate();
