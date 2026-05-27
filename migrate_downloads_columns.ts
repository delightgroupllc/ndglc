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
  const { pool } = await import('./src/lib/db');
  const client = await pool.connect();
  try {
    console.log('\n══════════════════════════════════════════════');
    console.log(' STEP 1: Add missing columns to downloads');
    console.log('══════════════════════════════════════════════');

    // Add file_size — manual text field, nullable so existing rows are fine
    await client.query(`
      ALTER TABLE downloads
        ADD COLUMN IF NOT EXISTS file_size TEXT DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
          CHECK (status IN ('active', 'hidden', 'archived')),
        ADD COLUMN IF NOT EXISTS division TEXT DEFAULT 'dtl'
          CHECK (division IN ('dtl', 'dgs')),
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `);
    console.log('  ✓ Columns added: file_size, status, division, updated_at');

    console.log('\n══════════════════════════════════════════════');
    console.log(' STEP 2: Backfill file_size + division for seeded rows');
    console.log('══════════════════════════════════════════════');

    const backfill = [
      { title: 'DELIGHT TECHNICAL LIGHTING OUTDOOR CATALOG',  file_size: '13 MB',  division: 'dtl', status: 'active' },
      { title: 'DELIGHT TECHNICAL LIGHTING INDOOR CATALOG',   file_size: '19 MB',  division: 'dtl', status: 'active' },
      { title: 'DELIGHT TECHNICAL LIGHTING COMPLETE CATALOG', file_size: '388 MB', division: 'dtl', status: 'hidden' },
      { title: 'DELIGHT TECHNICAL LIGHTING COMPANY PROFILE',  file_size: '13 MB',  division: 'dtl', status: 'active' },
      { title: 'DELIGHT GREENSCAPES CATALOG',                 file_size: '42 MB',  division: 'dgs', status: 'active' },
    ];

    for (const row of backfill) {
      const res = await client.query(
        `UPDATE downloads SET file_size = $1, division = $2, status = $3
         WHERE LOWER(title) = LOWER($4) RETURNING id`,
        [row.file_size, row.division, row.status, row.title]
      );
      if (res.rowCount && res.rowCount > 0) {
        console.log(`  ✓ Updated: ${row.title} → ${row.file_size} [${row.division}]`);
      } else {
        console.log(`  – Not found: ${row.title}`);
      }
    }

    console.log('\n══════════════════════════════════════════════');
    console.log(' VERIFICATION');
    console.log('══════════════════════════════════════════════');

    const rows = await client.query(`SELECT title, file_size, division, status FROM downloads ORDER BY created_at`);
    for (const r of rows.rows) {
      console.log(`  ${r.title.substring(0, 50).padEnd(52)} ${(r.file_size || 'N/A').padEnd(8)} [${r.division}] ${r.status}`);
    }

    // Also show updated column list
    const cols = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'downloads' ORDER BY ordinal_position
    `);
    console.log('\n  downloads columns now:');
    for (const c of cols.rows) {
      console.log(`    ${c.column_name.padEnd(25)} ${c.data_type}`);
    }

    console.log('\n✅ Migration complete!');
  } catch (err) {
    console.error('\n❌ Failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
