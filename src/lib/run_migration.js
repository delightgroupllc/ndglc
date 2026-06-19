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
    console.log('Beginning migration...');
    await client.query('BEGIN');

    // Create companies table
    console.log('Creating companies table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT UNIQUE NOT NULL,
        vat_number TEXT,
        billing_address TEXT,
        shipping_address TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);

    // Add company_id, is_archived, is_deleted, company_vat to customers table
    console.log('Adding columns to customers...');
    await client.query(`
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE NOT NULL;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE NOT NULL;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_vat TEXT;
    `);

    // Migrate existing companies from customers
    console.log('Migrating existing companies...');
    const custRes = await client.query('SELECT DISTINCT company_name, company_vat, billing_address, shipping_address FROM customers WHERE company_name IS NOT NULL AND company_name != \'\'');
    for (const row of custRes.rows) {
      const compName = row.company_name;
      const compVat = row.company_vat || '';
      const billAddr = row.billing_address || '';
      const shipAddr = row.shipping_address || '';

      await client.query(`
        INSERT INTO companies (name, vat_number, billing_address, shipping_address)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (name) DO UPDATE SET
          vat_number = COALESCE(EXCLUDED.vat_number, companies.vat_number),
          billing_address = COALESCE(EXCLUDED.billing_address, companies.billing_address),
          shipping_address = COALESCE(EXCLUDED.shipping_address, companies.shipping_address)
      `, [compName, compVat, billAddr, shipAddr]);
    }

    // Link customers to their companies
    console.log('Linking customers to companies...');
    await client.query(`
      UPDATE customers c
      SET company_id = (SELECT id FROM companies WHERE name = c.company_name)
      WHERE c.company_name IS NOT NULL AND c.company_name != '' AND c.company_id IS NULL
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

main();
