import type { APIRoute } from 'astro';
import { query, pool } from '../../../lib/db';
import { z } from 'zod';

const bulkProductSchema = z.array(z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  slug: z.string().min(1),
  division_slug: z.string().min(1),
  category_slug: z.string().min(1),
  description: z.string().optional().default(''),
  specifications: z.union([z.array(z.any()), z.record(z.any())]).optional(),
  status: z.enum(['active', 'inactive', 'draft']).default('active'),
  featured: z.boolean().default(false),
  image_url: z.string().optional(),
  import_mode: z.enum(['insert', 'update', 'skip']).default('insert')
}));

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const parsed = bulkProductSchema.parse(data);

    if (parsed.length === 0) {
      return new Response(JSON.stringify({ error: 'No products provided' }), { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      let inserted = 0;
      let updated = 0;

      for (const p of parsed) {
        if (p.import_mode === 'skip') continue;

        // Resolve UUIDs from slugs
        const divRes = await client.query('SELECT id FROM divisions WHERE slug = $1', [p.division_slug]);
        const catRes = await client.query('SELECT id FROM categories WHERE slug = $1', [p.category_slug]);
        
        if (divRes.rowCount === 0) throw new Error(`Division not found: ${p.division_slug}`);
        if (catRes.rowCount === 0) throw new Error(`Category not found: ${p.category_slug}`);

        const divId = divRes.rows[0].id;
        const catId = catRes.rows[0].id;

        const specsJson = p.specifications ? JSON.stringify(p.specifications) : '[]';

        if (p.import_mode === 'update') {
          // Check if SKU exists
          const existRes = await client.query('SELECT id FROM products WHERE sku = $1', [p.sku]);
          if (existRes.rowCount > 0) {
            const prodId = existRes.rows[0].id;
            await client.query(
              `UPDATE products 
               SET category_id = $1, division_id = $2, name = $3, slug = $4, description = $5, specifications = $6, featured = $7, status = $8, updated_at = NOW()
               WHERE id = $9`,
              [catId, divId, p.name, p.slug, p.description, specsJson, p.featured, p.status, prodId]
            );

            if (p.image_url) {
              const imgCheck = await client.query('SELECT id FROM product_images WHERE product_id = $1 AND is_primary = true', [prodId]);
              if (imgCheck.rowCount > 0) {
                await client.query('UPDATE product_images SET url = $1 WHERE id = $2', [p.image_url, imgCheck.rows[0].id]);
              } else {
                await client.query('INSERT INTO product_images (product_id, url, is_primary) VALUES ($1, $2, true)', [prodId, p.image_url]);
              }
            }
            updated++;
            continue;
          }
        }

        // Default Insert mode
        const prodRes = await client.query(
          `INSERT INTO products (category_id, division_id, name, sku, slug, description, specifications, featured, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [catId, divId, p.name, p.sku, p.slug, p.description, specsJson, p.featured, p.status]
        );
        const newProdId = prodRes.rows[0].id;
        
        await client.query(
          `INSERT INTO inventory (product_id, stock_level, warehouse_id, low_stock_threshold)
           VALUES ($1, 0, (SELECT id FROM warehouses ORDER BY name ASC LIMIT 1), 10)`,
          [newProdId]
        );

        if (p.image_url) {
          await client.query(
            `INSERT INTO product_images (product_id, url, is_primary)
             VALUES ($1, $2, true)`,
            [newProdId, p.image_url]
          );
        }

        inserted++;
      }

      await client.query('COMMIT');
      return new Response(JSON.stringify({ success: true, inserted, updated }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: error.errors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (error.code === '23505') {
      return new Response(JSON.stringify({ error: 'A product with one of these SKUs or Slugs already exists.' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
