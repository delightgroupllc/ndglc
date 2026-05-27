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

// ─────────────────────────────────────────────────────────────
// downloads schema (actual live):
//   id, title, url, type, category_id,
//   visibility_rules (jsonb), permission_required, created_at
//
// type CHECK: ('pdf', 'catalog', 'datasheet')
// ─────────────────────────────────────────────────────────────
const CATALOGUES = [
  {
    title: 'DELIGHT TECHNICAL LIGHTING OUTDOOR CATALOG',
    url: 'https://drive.google.com/uc?export=download&id=1zze_8hJtWiJ6J4siJAaD6isKpGKXQH82',
    type: 'catalog',
    // visibility_rules: which pages + division info
    visibility_rules: { pages: ['home', 'dtl'], division: 'dtl', public: true },
    permission_required: null,
  },
  {
    title: 'DELIGHT TECHNICAL LIGHTING INDOOR CATALOG',
    url: 'https://drive.google.com/uc?export=download&id=1KaLTQlCwTV4SG4RzigTpqyxT9LYwzeD-',
    type: 'catalog',
    visibility_rules: { pages: ['home', 'dtl'], division: 'dtl', public: true },
    permission_required: null,
  },
  {
    title: 'DELIGHT TECHNICAL LIGHTING COMPLETE CATALOG',
    url: 'https://drive.google.com/uc?export=download&id=19fmDEn5YXhWFktjsKsU3jgQRMPRlym4D',
    type: 'catalog',
    visibility_rules: { pages: ['dtl'], division: 'dtl', public: false },
    permission_required: 'admin',
  },
  {
    title: 'DELIGHT TECHNICAL LIGHTING COMPANY PROFILE',
    url: 'https://drive.google.com/uc?export=download&id=1Rg3ILW4mFMYfeYLCt754KCFMRCHsQfCr',
    type: 'pdf',
    visibility_rules: { pages: ['home', 'dtl'], division: 'dtl', public: true },
    permission_required: null,
  },
  {
    title: 'DELIGHT GREENSCAPES CATALOG',
    url: 'https://drive.google.com/uc?export=download&id=178K2oFfRdqAICqygObFnlbXA5AdSLbNU',
    type: 'catalog',
    visibility_rules: { pages: ['home', 'dgs'], division: 'dgs', public: true },
    permission_required: null,
  },
];

// ─────────────────────────────────────────────────────────────
// legal_artifacts schema (actual live):
//   id, title, identifier (UNIQUE), type, content, updated_at
//
// type CHECK: ('public', 'order_clause')
// ─────────────────────────────────────────────────────────────
const DISCLAIMERS = [
  {
    title: 'Privacy Policy',
    identifier: 'privacy-policy',
    type: 'public',
    content: 'We value your privacy and protect your data.',
  },
  {
    title: 'Terms of Use',
    identifier: 'terms-of-use',
    type: 'public',
    content: 'By using this site, you agree to our terms.',
  },
  {
    title: 'Cookie Policy',
    identifier: 'cookie-policy',
    type: 'public',
    content: 'We use cookies to improve your experience.',
  },
  {
    title: 'Terms and Conditions',
    identifier: 'terms-and-conditions',
    type: 'public',
    content: `<h2>1. The Acceptance of Terms</h2><p>By accessing or using our services, you agree to be bound by these Terms and Conditions.</p><h2>2. Use of Services</h2><p>You agree to use our services only for lawful purposes and in accordance with these Terms.</p><h2>3. Intellectual Property</h2><p>All content and materials available through our services are the property of Delight Group LLC or its licensors.</p>`,
  },
];

const TERMS: { title: string; identifier: string; type: string; content: string }[] = [
  // Delight Group (org 1)
  { title: 'General Terms',        identifier: 'delight-group-general-terms',           type: 'order_clause', content: 'These general terms apply to all transactions and agreements.' },
  { title: 'Payment Terms',        identifier: 'delight-group-payment-terms',           type: 'order_clause', content: 'Payment is due within 30 days of invoice date unless stated otherwise.' },
  { title: 'Delivery',             identifier: 'delight-group-delivery',                type: 'order_clause', content: 'Standard delivery time is 2-4 weeks from order confirmation.' },
  { title: 'Warranty & Liability', identifier: 'delight-group-warranty-liability',      type: 'order_clause', content: 'All products carry a standard 12-month manufacturer warranty.' },
  // Delight Greenscapes (org 2)
  { title: 'Payment Terms (Greenscapes)',  identifier: 'delight-greenscapes-payment-terms', type: 'order_clause', content: 'All payments are due within 30 days of invoice date.' },
  { title: 'Warranty (Greenscapes)',       identifier: 'delight-greenscapes-warranty',       type: 'order_clause', content: 'Standard 12-month warranty applies to all technical equipment.' },
  // Delight Technical Lighting (org 3)
  { title: 'Payment Terms (Technical Lighting)', identifier: 'delight-technical-lighting-payment-terms', type: 'order_clause', content: 'All payments are due within 30 days of invoice date.' },
  { title: 'Warranty (Technical Lighting)',       identifier: 'delight-technical-lighting-warranty',       type: 'order_clause', content: 'Standard 12-month warranty applies to all technical equipment.' },
];

// ─────────────────────────────────────────────────────────────

async function migrate() {
  const { pool } = await import('./src/lib/db');
  const client = await pool.connect();
  let totalIns = 0, totalSkip = 0;

  try {
    // ── STEP 1: downloads (catalogues) ────────────────────────
    console.log('\n══════════════════════════════════════════════');
    console.log(' STEP 1: Seed catalogues → downloads');
    console.log('══════════════════════════════════════════════');
    console.log('  Live columns: id, title, url, type, category_id, visibility_rules, permission_required, created_at');

    let ins = 0, skip = 0;
    for (const d of CATALOGUES) {
      const exists = await client.query(
        `SELECT id FROM downloads WHERE LOWER(title) = LOWER($1) LIMIT 1`,
        [d.title]
      );
      if (exists.rowCount && exists.rowCount > 0) {
        console.log(`  – Skipped (exists): ${d.title}`);
        skip++;
        continue;
      }
      await client.query(
        `INSERT INTO downloads (title, url, type, visibility_rules, permission_required)
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [d.title, d.url, d.type, JSON.stringify(d.visibility_rules), d.permission_required]
      );
      console.log(`  ✓ Inserted: ${d.title}`);
      ins++;
    }
    console.log(`  → ${ins} inserted, ${skip} skipped`);
    totalIns += ins; totalSkip += skip;

    // ── STEP 2: legal_artifacts (disclaimers) ────────────────
    console.log('\n══════════════════════════════════════════════');
    console.log(' STEP 2: Seed disclaimers → legal_artifacts (type=public)');
    console.log('══════════════════════════════════════════════');

    ins = 0; skip = 0;
    for (const d of DISCLAIMERS) {
      const res = await client.query(
        `INSERT INTO legal_artifacts (title, identifier, type, content)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (identifier) DO NOTHING
         RETURNING id`,
        [d.title, d.identifier, d.type, d.content]
      );
      if (res.rowCount && res.rowCount > 0) {
        console.log(`  ✓ Inserted: ${d.title} [${d.identifier}]`);
        ins++;
      } else {
        console.log(`  – Skipped (exists): ${d.identifier}`);
        skip++;
      }
    }
    console.log(`  → ${ins} inserted, ${skip} skipped`);
    totalIns += ins; totalSkip += skip;

    // ── STEP 3: legal_artifacts (terms & conditions) ─────────
    console.log('\n══════════════════════════════════════════════');
    console.log(' STEP 3: Seed terms_and_conditions → legal_artifacts (type=order_clause)');
    console.log('══════════════════════════════════════════════');

    ins = 0; skip = 0;
    for (const t of TERMS) {
      const res = await client.query(
        `INSERT INTO legal_artifacts (title, identifier, type, content)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (identifier) DO NOTHING
         RETURNING id`,
        [t.title, t.identifier, t.type, t.content]
      );
      if (res.rowCount && res.rowCount > 0) {
        console.log(`  ✓ Inserted: ${t.title} [${t.identifier}]`);
        ins++;
      } else {
        console.log(`  – Skipped (exists): ${t.identifier}`);
        skip++;
      }
    }
    console.log(`  → ${ins} inserted, ${skip} skipped`);
    totalIns += ins; totalSkip += skip;

    // ── VERIFICATION ────────────────────────────────────────
    console.log('\n══════════════════════════════════════════════');
    console.log(' VERIFICATION — Final row counts');
    console.log('══════════════════════════════════════════════');

    for (const t of ['trusted_partners', 'downloads', 'legal_artifacts']) {
      const r = await client.query(`SELECT COUNT(*) FROM ${t}`);
      console.log(`  ${t.padEnd(20)}: ${r.rows[0].count} rows`);
    }

    console.log(`\n✅ Migration complete! Total inserted: ${totalIns}, skipped: ${totalSkip}`);

  } catch (err) {
    console.error('\n❌ Migration failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
