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

async function update() {
  const { pool } = await import('./src/lib/db');
  try {
    // Drop constraint temporarily to modify it
    await pool.query(`ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_payment_status_check;`);
    
    // Create customers
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT UNIQUE NOT NULL,
        email TEXT,
        phone TEXT,
        billing_address TEXT,
        shipping_address TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `);

    // Alter invoices
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_address TEXT;`);
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS shipping_address TEXT;`);
    
    // Add check constraint back
    await pool.query(`ALTER TABLE invoices ADD CONSTRAINT invoices_payment_status_check CHECK (payment_status IN ('paid', 'unpaid', 'overdue', 'cancelled', 'draft'));`);
    
    console.log('Successfully updated DB for Professional Invoices');
  } catch (err) {
    console.error('Failed', err);
  } finally {
    await pool.end();
  }
}
update();
