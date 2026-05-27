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
  featured: z.boolean().default(false)
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
      for (const p of parsed) {
        // Resolve UUIDs from slugs
        const divRes = await client.query('SELECT id FROM divisions WHERE slug = $1', [p.division_slug]);
        const catRes = await client.query('SELECT id FROM categories WHERE slug = $1', [p.category_slug]);
        
        if (divRes.rowCount === 0) throw new Error(`Division not found: ${p.division_slug}`);
        if (catRes.rowCount === 0) throw new Error(`Category not found: ${p.category_slug}`);

        const divId = divRes.rows[0].id;
        const catId = catRes.rows[0].id;

        const specsJson = p.specifications ? JSON.stringify(p.specifications) : '[]';

        const prodRes = await client.query(
          `INSERT INTO products (category_id, division_id, name, sku, slug, description, specifications, featured, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [catId, divId, p.name, p.sku, p.slug, p.description, specsJson, p.featured, p.status]
        );
        
        await client.query(
          `INSERT INTO inventory (product_id, stock_level, warehouse_location, low_stock_threshold)
           VALUES ($1, 0, 'Warehouse A', 10)`,
          [prodRes.rows[0].id]
        );

        inserted++;
      }

      await client.query('COMMIT');
      return new Response(JSON.stringify({ success: true, count: inserted }), { status: 201, headers: { 'Content-Type': 'application/json' } });
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
