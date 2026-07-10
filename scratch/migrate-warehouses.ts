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

async function run() {
  const { pool } = await import('../src/lib/db.js');
  const client = await pool.connect();
  try {
    console.log('Starting migration to multi-warehouse system...');
    await client.query('BEGIN');

    // 1. Create warehouses table
    await client.query(`
      CREATE TABLE IF NOT EXISTS warehouses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT UNIQUE NOT NULL,
        code TEXT UNIQUE NOT NULL,
        address TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `);
    console.log('Created warehouses table.');

    // 2. Insert default warehouses
    const defaultWarehouses = [
      { name: 'Warehouse Alpha', code: 'WH-A', address: 'Al Quoz Logistics Hub' },
      { name: 'Warehouse Beta', code: 'WH-B', address: 'Jebel Ali Depot B' },
      { name: 'Warehouse Delta', code: 'WH-D', address: 'Sharjah Industrial Zone' },
      { name: 'Cloud Region East-1', code: 'WH-C', address: 'AWS East Region' }
    ];

    for (const wh of defaultWarehouses) {
      await client.query(`
        INSERT INTO warehouses (name, code, address)
        VALUES ($1, $2, $3)
        ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code, address = EXCLUDED.address;
      `, [wh.name, wh.code, wh.address]);
    }
    console.log('Seeded default warehouses.');

    // Get the ID of the default warehouse (Warehouse Alpha)
    const defWhRes = await client.query("SELECT id FROM warehouses WHERE name = 'Warehouse Alpha'");
    const defaultWhId = defWhRes.rows[0].id;

    // 3. Add warehouse_id to inventory table
    await client.query(`
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE;
    `);
    console.log('Added warehouse_id column to inventory.');

    // 4. Map existing warehouse_location to warehouse_id
    const inventoryRows = await client.query("SELECT id, warehouse_location FROM inventory");
    for (const row of inventoryRows.rows) {
      let whName = row.warehouse_location || 'Warehouse Alpha';
      // Normalize name
      if (whName === 'Warehouse A') whName = 'Warehouse Alpha';
      
      const whRes = await client.query("SELECT id FROM warehouses WHERE name = $1", [whName]);
      const whId = whRes.rows.length > 0 ? whRes.rows[0].id : defaultWhId;

      await client.query("UPDATE inventory SET warehouse_id = $1 WHERE id = $2", [whId, row.id]);
    }
    console.log('Mapped existing inventory locations to warehouse IDs.');

    // Set any remaining NULL warehouse_id to default
    await client.query("UPDATE inventory SET warehouse_id = $1 WHERE warehouse_id IS NULL", [defaultWhId]);

    // 5. Drop the old UNIQUE constraint on product_id if exists
    // We dynamically find any UNIQUE constraint on product_id in table 'inventory'
    const consRes = await client.query(`
      SELECT conname 
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE rel.relname = 'inventory' 
        AND con.contype = 'u' 
        AND conname LIKE '%product_id%';
    `);
    
    for (const cRow of consRes.rows) {
      console.log(`Dropping unique constraint ${cRow.conname}...`);
      await client.query(`ALTER TABLE inventory DROP CONSTRAINT IF EXISTS "${cRow.conname}" CASCADE`);
    }
    // Also drop default naming if above query missed it
    await client.query(`ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_product_id_key CASCADE`);

    // 6. Make warehouse_id NOT NULL
    await client.query(`
      ALTER TABLE inventory ALTER COLUMN warehouse_id SET NOT NULL;
    `);

    // 7. Add composite UNIQUE constraint on (product_id, warehouse_id)
    await client.query(`
      ALTER TABLE inventory ADD CONSTRAINT inventory_product_warehouse_uniq UNIQUE (product_id, warehouse_id);
    `);
    console.log('Added composite unique constraint (product_id, warehouse_id) to inventory.');

    // 8. Drop old warehouse_location column
    await client.query(`
      ALTER TABLE inventory DROP COLUMN IF EXISTS warehouse_location;
    `);
    console.log('Dropped old warehouse_location column.');

    await client.query('COMMIT');
    console.log('Migration completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

run();
