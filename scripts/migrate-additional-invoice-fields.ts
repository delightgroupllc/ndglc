import { query } from '../src/lib/db';

async function migrate() {
  console.log('Running additional invoice fields migration...');

  // Add new columns to invoices table
  await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS company_vat TEXT;`);
  await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'fixed';`);
  await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_value DOUBLE PRECISION DEFAULT 0;`);
  await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS show_images BOOLEAN DEFAULT FALSE;`);

  // Add new columns to invoice_items table
  await query(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tax_type TEXT DEFAULT 'percentage';`);
  await query(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tax_value DOUBLE PRECISION DEFAULT 5;`);
  await query(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS item_image TEXT;`);

  console.log('✅ Additional invoice fields migration complete.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
