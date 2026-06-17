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

async function run() {
  const { pool } = await import('../src/lib/db');
  const client = await pool.connect();
  try {
    const countRes = await client.query('SELECT count(*) FROM invoices');
    console.log('Total invoices count:', countRes.rows[0].count);

    const sampleRes = await client.query('SELECT id, invoice_number, customer_name, payment_status FROM invoices LIMIT 5');
    console.log('\nSample invoices:');
    console.log(sampleRes.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
run();
