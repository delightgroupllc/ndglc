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

async function diagnose() {
  console.log('--- DATABASE DIAGNOSTIC START ---');
  try {
    const { query } = await import('./src/lib/db');
    
    const res = await query(`
      SELECT i.id, i.invoice_number, i.customer_name, COUNT(ii.id) as item_count
      FROM invoices i
      LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
      GROUP BY i.id, i.invoice_number, i.customer_name
      ORDER BY item_count DESC
      LIMIT 10;
    `);
    console.log('Invoices with item count:');
    res.rows.forEach(r => {
      console.log(`ID: ${r.id} | No: ${r.invoice_number} | Customer: ${r.customer_name} | Items: ${r.item_count}`);
    });
  } catch (err: any) {
    console.error('Error querying invoices:', err.message);
  }
  console.log('--- DATABASE DIAGNOSTIC END ---');
  process.exit(0);
}

diagnose();
