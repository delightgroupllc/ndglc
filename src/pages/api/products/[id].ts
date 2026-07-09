import type { APIRoute } from 'astro';
import { query, withTransaction } from '../../../lib/db';
import { z } from 'zod';

const productSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required'),
  sku: z.string().trim().toUpperCase().min(1, 'SKU is required').regex(/^[A-Z0-9\-_]+$/i, 'SKU must be alphanumeric with dashes only'),
  slug: z.string().trim().toLowerCase().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase with hyphens only'),
  division_id: z.string().uuid('Invalid division ID'),
  category_id: z.string().uuid('Invalid category ID'),
  description: z.string().optional(),
  image_url: z.string().optional().nullable(),
  ideal_room: z.string().optional().nullable(),
  specifications: z.array(z.object({
    key: z.string(),
    value: z.string()
  })).optional().default([]),
  featured: z.string().transform((v) => v === 'true').or(z.boolean()),
  status: z.enum(['active', 'inactive', 'draft', 'deleted']),
  images: z.array(z.object({
    url: z.string().url(),
    is_primary: z.boolean()
  })).optional().default([])
});

export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const id = params.id;
    if (!id) throw new Error("ID required");

    const data = await request.json();
    const parsed = productSchema.parse(data);

    const result = await withTransaction(async (client) => {
      const res = await client.query(
        `UPDATE products 
         SET category_id = $1, division_id = $2, name = $3, sku = $4, slug = $5, 
            description = $6, specifications = $7, featured = $8, status = $9, ideal_room = $10, image_url = $11, updated_at = NOW()
         WHERE id = $12 RETURNING *`,
        [
          parsed.category_id,
          parsed.division_id,
          parsed.name,
          parsed.sku,
          parsed.slug,
          parsed.description || '',
          JSON.stringify(parsed.specifications),
          parsed.featured,
          parsed.status,
          parsed.ideal_room || null,
          parsed.image_url || null,
          id
        ]
      );

      if (res.rowCount === 0) {
        throw new Error('NOT_FOUND');
      }

      // Replace images
      await client.query(`DELETE FROM product_images WHERE product_id = $1`, [id]);
      
      for (const img of parsed.images) {
        await client.query(
          `INSERT INTO product_images (product_id, url, is_primary) VALUES ($1, $2, $3)`,
          [id, img.url, img.is_primary]
        );
      }

      return res.rows[0];
    });

    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    if (error.message === 'NOT_FOUND') {
      return new Response(JSON.stringify({ error: 'Product not found' }), { status: 404 });
    }
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: error.errors }), { status: 400 });
    }
    if (error.code === '23505') {
      return new Response(JSON.stringify({ error: 'SKU or Slug already exists.' }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const id = params.id;
    if (!id) throw new Error("ID required");

    const res = await query(`DELETE FROM products WHERE id = $1 RETURNING id`, [id]);

    if (res.rowCount === 0) {
      return new Response(JSON.stringify({ error: 'Product not found' }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
};
