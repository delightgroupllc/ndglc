import dotenv from 'dotenv';
dotenv.config();

async function migrate() {
  console.log('Running migrate-section-images-folder...');

  const { query } = await import('../src/lib/db');

  await query(`
    ALTER TABLE section_images 
    ADD COLUMN IF NOT EXISTS folder_path TEXT DEFAULT '/' NOT NULL;
  `);

  console.log('✅ migration complete.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
