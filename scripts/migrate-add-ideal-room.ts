import { query } from '../src/lib/db';

async function migrate() {
  console.log('Running migrate-add-ideal-room...');

  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ideal_room TEXT;`);

  console.log('✅ migration complete.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
