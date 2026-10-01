/** Database export and snapshot helper module */
import { query } from '../src/lib/db';
import fs from 'fs';
import path from 'path';

async function backupDatabase() {
  console.log('Starting full database backup...');
  
  // Get all table names in public schema
  const tablesRes = await query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  const backupData: Record<string, any[]> = {};
  const backupDir = path.join(process.cwd(), 'scratch', 'backups');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilePath = path.join(backupDir, `db_backup_${timestamp}.json`);

  for (const row of tablesRes.rows) {
    const tableName = row.table_name;
    try {
      const dataRes = await query(`SELECT * FROM "${tableName}"`);
      backupData[tableName] = dataRes.rows;
      console.log(`✓ Backed up table: ${tableName} (${dataRes.rows.length} rows)`);
    } catch (err: any) {
      console.error(`✗ Error backing up table ${tableName}:`, err.message);
    }
  }

  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2));
  console.log(`\n✅ Database backup completed successfully!`);
  console.log(`Saved to: ${backupFilePath}`);
  process.exit(0);
}

backupDatabase().catch(err => {
  console.error('Backup failed:', err);
  process.exit(1);
});
