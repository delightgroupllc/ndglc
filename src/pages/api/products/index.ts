import type { APIRoute } from 'astro';
import { query, withTransaction, exportTableAsCSV } from '../../../lib/db';
import { z } from 'zod';

const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  sku: z.string().min(1, 'SKU is required').regex(/^[A-Z0-9\-_]+$/i, 'SKU must be alphanumeric with dashes only'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase with hyphens only'),
  division_id: z.string().uuid('Invalid division ID'),
  category_id: z.string().uuid('Invalid category ID'),
  description: z.string().optional(),
  ideal_room: z.string().optional().nullable(),
  image_url: z.string().url('Invalid image URL').optional().nullable().or(z.literal('')),
  specifications: z.array(z.object({
    key: z.string().min(1),
    value: z.string(),
  })).optional().default([]),
  featured: z.union([z.boolean(), z.string().transform(v => v === 'true')]),
  status: z.enum(['active', 'inactive', 'draft', 'deleted']),
});

export const GET: APIRoute = async ({ url }) => {
  try {
    // CSV export endpoint
    if (url.searchParams.get('export') === 'csv') {
      const csv = await exportTableAsCSV('products',
        ['name', 'sku', 'slug', 'status', 'featured', 'description', 'created_at'],
        undefined, undefined
      );
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="products-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    const res = await query(`
      SELECT p.*, c.name as category_name, d.name as division_name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      JOIN divisions d ON d.id = p.division_id
      ORDER BY p.created_at DESC
    `);
    return new Response(JSON.stringify(res.rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const parsed = productSchema.parse(data);

    const result = await withTransaction(async (client) => {
      // Duplicate SKU check
      const skuCheck = await client.query(
        'SELECT id FROM products WHERE LOWER(sku) = LOWER($1) LIMIT 1',
        [parsed.sku]
      );
      if (skuCheck.rowCount && skuCheck.rowCount > 0) {
        throw Object.assign(new Error(`SKU "${parsed.sku}" already exists.`), { code: '23505', field: 'sku' });
      }

      // Duplicate slug check
      const slugCheck = await client.query(
        'SELECT id FROM products WHERE slug = $1 LIMIT 1',
        [parsed.slug]
      );
      if (slugCheck.rowCount && slugCheck.rowCount > 0) {
        throw Object.assign(new Error(`Slug "${parsed.slug}" already in use.`), { code: '23505', field: 'slug' });
      }

      // Duplicate name check (warning, not error — names may be similar but valid)
      const nameCheck = await client.query(
        'SELECT id FROM products WHERE LOWER(name) = LOWER($1) AND division_id = $2 LIMIT 1',
        [parsed.name, parsed.division_id]
      );
      if (nameCheck.rowCount && nameCheck.rowCount > 0) {
        throw Object.assign(
          new Error(`A product named "${parsed.name}" already exists in this division.`),
          { code: 'DUPLICATE_NAME' }
        );
      }

      const res = await client.query(
        `INSERT INTO products (category_id, division_id, name, sku, slug, description, specifications, featured, status, ideal_room, image_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [parsed.category_id, parsed.division_id, parsed.name, parsed.sku.toUpperCase(),
         parsed.slug, parsed.description || '', JSON.stringify(parsed.specifications),
         parsed.featured, parsed.status, parsed.ideal_room || null, parsed.image_url || null]
      );
      const product = res.rows[0];

      // Initialize inventory row
      await client.query(
        `INSERT INTO inventory (product_id, stock_level, warehouse_location, low_stock_threshold)
         VALUES ($1, 0, 'Warehouse A', 10)`,
        [product.id]
      );

      return product;
    });

    return new Response(JSON.stringify(result), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('Product POST error:', error);
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: error.errors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (error.code === '23505' || error.code === 'DUPLICATE_NAME') {
      return new Response(JSON.stringify({ error: error.message }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'Database error: ' + error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
