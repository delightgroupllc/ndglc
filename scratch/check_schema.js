import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const dbUrl = process.env.DATABASE_URL;
const cleanUrl = dbUrl ? dbUrl.split('?')[0] : '';

const pool = new Pool({
  connectionString: cleanUrl,
  ssl: { rejectUnauthorized: false }
});

try {
  const r1 = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='companies'");
  console.log('companies table:', r1.rows.length > 0 ? 'EXISTS' : 'MISSING');

  const r2 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='customers' AND column_name='company_id'");
  console.log('customers.company_id:', r2.rows.length > 0 ? 'EXISTS' : 'MISSING');

  const r3 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='invoices' AND column_name='signatory_incharge'");
  console.log('invoices.signatory_incharge:', r3.rows.length > 0 ? 'EXISTS' : 'MISSING');

  const r4 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='customers' AND column_name='is_deleted'");
  console.log('customers.is_deleted:', r4.rows.length > 0 ? 'EXISTS' : 'MISSING');

  if (r1.rows.length > 0) {
    const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='companies' ORDER BY ordinal_position");
    console.log('\ncompanies table columns:');
    cols.rows.forEach(c => console.log(`  ${c.column_name} (${c.data_type})`));

    const count = await pool.query("SELECT COUNT(*) as cnt FROM companies");
    console.log('  Row count:', count.rows[0].cnt);
  }

  const custCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='customers' ORDER BY ordinal_position");
  console.log('\ncustomers table columns:');
  custCols.rows.forEach(c => console.log(`  ${c.column_name} (${c.data_type})`));

  const invCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='invoices' ORDER BY ordinal_position");
  console.log('\ninvoices columns:', invCols.rows.map(c => c.column_name).join(', '));

} catch (e) {
  console.error('Error:', e.message);
}
process.exit(0);
