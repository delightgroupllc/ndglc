import pg from 'pg';
const { Pool } = pg;

const envPath = '.env';
import fs from 'fs';
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

const databaseUrl = process.env.DATABASE_URL || '';
const cleanedUrl = databaseUrl.split('?')[0];

const pool = new Pool({
  connectionString: cleanedUrl || undefined,
  ssl: { rejectUnauthorized: false }
});

const DGS_TERMS = [
  { title: 'Payment', content: '100% Advance against Performa Invoice (Tax Invoice will be issued after receipt of payment). In the event of project cancellation, advance payments are non-refundable.' },
  { title: 'Lead time', content: 'To be discussed' },
  { title: 'Delivery and Installation', content: 'Standard delivery and installation timings are from 8 AM - 5 PM Monday through Friday. Additional charges will apply for work done outside of these hours, including weekends & public holidays.' },
  { title: 'Quotation validity', content: '30 days from the date of issue. The rates in this quotation are based on current market prices and may be subject to change.' },
  { title: 'BOQ Scope Limit', content: 'This quotation is limited to the scope of works mentioned in the BOQ only.' },
  { title: 'Equipment Provision', content: 'Client to provide required equipment (scaffolding, crane, cherry picker, high ladder, etc) when needed.' },
  { title: 'Welfare Facilities', content: 'Client to provide free of charge, full on-site welfare facilities for our operatives.' },
  { title: 'Permits and Site Access', content: 'Client to assist in the arrangement and issuance of permits, gate passes, service lifts and access to site.' },
  { title: 'Governing Law', content: 'The agreement between us is subject to the laws of the Dubai International Financial Centre (DIFC) and it is hereby agreed that any dispute or difference arising out of or in connection with this agreement shall be submitted to the jurisdiction of the Small Claims Tribunal of the DIFC.' },
  { title: 'Copyright', content: 'All designs created by Planters remain under the copyright of Planters Horticulture LLC. You may not copy, reproduce, modify, distribute any of the content without written permission.' },
  { title: 'Property Retention', content: 'All materials remain under the property of Planters Horticulture LLC until the full receipt of payment.' },
  { title: 'Live Plant Sizing', content: 'The height of all proposed live plants are including the nursery pot. Actual size may vary at the time of installation.' }
];

async function run() {
  const client = await pool.connect();
  try {
    console.log('Inserting DGS terms into legal_artifacts...');
    await client.query('BEGIN');
    
    // Set all existing ones to not show in invoice by default, or just let them stay. 
    // Actually, we should make sure our DGS ones have identifiers starting with 'dgs-term-'
    for (let i = 0; i < DGS_TERMS.length; i++) {
      const term = DGS_TERMS[i];
      const identifier = `dgs-term-${i + 1}`;
      await client.query(`
        INSERT INTO legal_artifacts (title, identifier, type, content, show_in_invoice)
        VALUES ($1, $2, 'order_clause', $3, true)
        ON CONFLICT (identifier) DO UPDATE SET
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          show_in_invoice = true;
      `, [term.title, identifier, term.content]);
    }
    
    await client.query('COMMIT');
    console.log('DGS terms inserted successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Insertion failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
