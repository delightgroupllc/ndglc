// Migration: Add missing invoice fields
// Run: npx tsx scripts/migrate-invoice-fields.ts

import { query } from '../src/lib/db';

async function migrate() {
  console.log('Running invoice fields migration...');

  // Add new columns to invoices table (if not exist)
  await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS company_name TEXT;`);
  await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'standard';`);
  await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source_division TEXT;`);
  await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_amount DOUBLE PRECISION DEFAULT 0;`);
  await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS internal_notes TEXT;`);

  // Add new columns to invoice_items table (if not exist)
  await query(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS catalogue_ref TEXT;`);
  await query(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tech_spec TEXT;`);
  await query(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tax_rate DOUBLE PRECISION DEFAULT 5;`);
  await query(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tax_amount DOUBLE PRECISION DEFAULT 0;`);

  console.log('✅ Invoice fields migration complete.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
