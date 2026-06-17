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
  const { pool } = await import('../src/lib/db');
  try {
    console.log('Running database migrations...');

    // Drop constraint temporarily to modify it
    await pool.query(`ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_payment_status_check;`);
    
    // Add check constraint back with partially_paid status
    await pool.query(`
      ALTER TABLE invoices 
      ADD CONSTRAINT invoices_payment_status_check 
      CHECK (payment_status IN ('paid', 'partially_paid', 'unpaid', 'overdue', 'cancelled', 'draft'));
    `);
    console.log('Updated invoices table payment_status constraints.');

    // Create transactions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        amount DOUBLE PRECISION NOT NULL,
        payment_method TEXT NOT NULL CHECK (payment_method IN ('bank_transfer', 'cash', 'cheque', 'card', 'other')),
        transaction_ref TEXT, -- Reference number, cheque number, or bank transaction ID
        transaction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        recorded_by TEXT, -- Text, stores Clerk User ID or email or 'System'
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `);
    console.log('Created transactions table.');

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_invoice ON transactions(invoice_id);
    `);
    console.log('Created index on transactions table.');

    console.log('Database migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
