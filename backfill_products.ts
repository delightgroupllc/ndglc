import { query } from './src/lib/db';

async function run() {
  try {
    const res = await query('SELECT * FROM invoice_items WHERE product_id IS NULL');
    console.log(`Found ${res.rows.length} items to backfill.`);
    
    let added = 0;
    let linked = 0;
    
    const divRes = await query("SELECT id FROM divisions ORDER BY name ASC LIMIT 1");
    const catRes = await query("SELECT id FROM categories ORDER BY name ASC LIMIT 1");
    const defaultDivisionId = divRes.rows[0]?.id || null;
    const defaultCategoryId = catRes.rows[0]?.id || null;
    
    for (const item of res.rows) {
      if (!item.description) {
         console.log(`Skipping item ID ${item.id} because description is empty.`);
         continue;
      }
      
      const sku = item.catalogue_ref || `PROD-${Math.floor(100000 + Math.random() * 900000)}`;
      
      // 1. Check for duplicates by SKU or Description
      let existingProductId = null;
      
      const dupRes = await query(
        `SELECT id FROM products WHERE (sku = UPPER($1) AND $1 != '') OR LOWER(name) = $2 LIMIT 1`,
        [item.catalogue_ref || 'NO_SKU', item.description.toLowerCase()]
      );
      
      if (dupRes.rows.length > 0) {
        existingProductId = dupRes.rows[0].id;
        console.log(`Found duplicate in catalog for "${item.description}" -> Linking to existing Product ID: ${existingProductId}`);
      } else {
        const slug = item.description.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `prod-${Math.floor(100000 + Math.random() * 900000)}`;
        console.log(`Adding new to catalog: ${item.description} -> ${sku}`);

        // Insert product
        const insProdRes = await query(
          `INSERT INTO products (category_id, division_id, name, sku, slug, description, specifications, featured, status, image_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [defaultCategoryId, defaultDivisionId, item.description, sku.toUpperCase(), slug, 'Auto-created from legacy invoice', '[]', false, 'active', item.item_image || null]
        );
        existingProductId = insProdRes.rows[0].id;

        // Initialize inventory row
        await query(
          `INSERT INTO inventory (product_id, stock_level, warehouse_location, low_stock_threshold)
           VALUES ($1, 0, 'Warehouse A', 10)`,
          [existingProductId]
        );
        
        // If it had an image, create a product_image record
        if (item.item_image) {
          await query(
            `INSERT INTO product_images (product_id, url, is_primary) VALUES ($1, $2, true)`,
            [existingProductId, item.item_image]
          );
        }
        added++;
      }

      // Update the invoice_item to link to the existing/new product
      await query(`UPDATE invoice_items SET product_id = $1 WHERE id = $2`, [existingProductId, item.id]);
      linked++;
    }
    
    console.log(`Successfully added ${added} new products to catalog and linked ${linked} legacy invoice items.`);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();
