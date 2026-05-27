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
  const { pool } = await import('./src/lib/db');
  const client = await pool.connect();
  try {
    console.log('── Current legal_artifacts ──────────────────');
    const rows = await client.query(`SELECT id, type, identifier, title FROM legal_artifacts ORDER BY type DESC, identifier ASC`);
    for (const r of rows.rows) {
      console.log(`  [${r.type.padEnd(12)}] ${r.identifier.padEnd(45)} "${r.title}"`);
    }
    console.log(`\n  Total: ${rows.rowCount}`);

    // Identifiers to DELETE (old numeric ones + per-division duplicates of group-level ones)
    // Old numeric identifiers (10-14): duplicates of delight-group-* ones
    // Per-division ones that are identical content to group-level:
    //   delight-greenscapes-payment-terms  = same as delight-group-payment-terms
    //   delight-greenscapes-warranty       = same as delight-group-warranty-liability  
    //   delight-technical-lighting-payment-terms = same as delight-group-payment-terms
    //   delight-technical-lighting-warranty      = same as delight-group-warranty-liability
    const toDelete = [
      '10', '11', '12', '13', '14',                          // old numeric IDs (the actual id values)
      'delight-greenscapes-payment-terms',
      'delight-greenscapes-warranty',
      'delight-technical-lighting-payment-terms',
      'delight-technical-lighting-warranty',
    ];

    console.log('\n── Deleting duplicates ──────────────────────');
    let deleted = 0;

    // Delete old numeric-identifier ones (identifier IS the number string)
    for (const ident of ['10', '11', '12', '13', '14']) {
      const res = await client.query(`DELETE FROM legal_artifacts WHERE identifier = $1 RETURNING id, title`, [ident]);
      if (res.rowCount && res.rowCount > 0) {
        console.log(`  ✓ Deleted identifier="${ident}" → "${res.rows[0].title}"`);
        deleted++;
      } else {
        console.log(`  – Not found: identifier="${ident}"`);
      }
    }

    // Delete per-division duplicates
    const perDivDups = [
      'delight-greenscapes-payment-terms',
      'delight-greenscapes-warranty',
      'delight-technical-lighting-payment-terms',
      'delight-technical-lighting-warranty',
    ];
    for (const ident of perDivDups) {
      const res = await client.query(`DELETE FROM legal_artifacts WHERE identifier = $1 RETURNING id, title`, [ident]);
      if (res.rowCount && res.rowCount > 0) {
        console.log(`  ✓ Deleted identifier="${ident}" → "${res.rows[0].title}"`);
        deleted++;
      } else {
        console.log(`  – Not found: identifier="${ident}"`);
      }
    }

    // Rename delight-group-* to cleaner identifiers for use in invoice dropdowns
    console.log('\n── Renaming for cleaner identifiers ─────────');
    const renames: [string, string, string][] = [
      ['delight-group-payment-terms',    'payment-terms-30d',    'Payment Terms (30 Days)'],
      ['delight-group-warranty-liability','warranty-liability',   'Warranty & Liability'],
      ['delight-group-general-terms',    'general-terms',        'General Terms'],
      ['delight-group-delivery',         'delivery-terms',       'Delivery Terms'],
    ];

    for (const [oldIdent, newIdent, newTitle] of renames) {
      // Check if new identifier already exists
      const exists = await client.query(`SELECT id FROM legal_artifacts WHERE identifier = $1`, [newIdent]);
      if (exists.rowCount && exists.rowCount > 0) {
        // Just delete the old one
        await client.query(`DELETE FROM legal_artifacts WHERE identifier = $1`, [oldIdent]);
        console.log(`  – Skipped rename (new ident already exists): ${oldIdent} → ${newIdent}`);
        continue;
      }
      const res = await client.query(
        `UPDATE legal_artifacts SET identifier = $1, title = $2 WHERE identifier = $3 RETURNING id`,
        [newIdent, newTitle, oldIdent]
      );
      if (res.rowCount && res.rowCount > 0) {
        console.log(`  ✓ Renamed: ${oldIdent} → ${newIdent} ("${newTitle}")`);
      } else {
        console.log(`  – Not found: ${oldIdent}`);
      }
    }

    console.log('\n── Final state ──────────────────────────────');
    const final = await client.query(`SELECT type, identifier, title FROM legal_artifacts ORDER BY type DESC, identifier ASC`);
    for (const r of final.rows) {
      console.log(`  [${r.type.padEnd(12)}] ${r.identifier.padEnd(30)} "${r.title}"`);
    }
    console.log(`\n  Total: ${final.rowCount} (deleted ${deleted} duplicates)`);
    console.log('\n✅ Done!');
  } catch (err) {
    console.error('❌ Failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}
run();
