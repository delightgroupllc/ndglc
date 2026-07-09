import type { APIRoute } from 'astro';
import { query } from '../../../lib/db';
import { z } from 'zod';

const productSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  slug: z.string().min(1),
  division_id: z.string().min(1),
  category_id: z.string().min(1),
  description: z.string().optional(),
  image_url: z.string().optional().nullable(),
  ideal_room: z.string().optional().nullable(),
  specifications: z.array(z.object({
    key: z.string(),
    value: z.string()
  })).optional().default([]),
  featured: z.string().transform((v) => v === 'true').or(z.boolean()),
  status: z.enum(['active', 'inactive', 'draft', 'deleted'])
});

export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const id = params.id;
    if (!id) throw new Error("ID required");

    const data = await request.json();
    const parsed = productSchema.parse(data);

    const res = await query(
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
      return new Response(JSON.stringify({ error: 'Product not found' }), { status: 404 });
    }

    return new Response(JSON.stringify(res.rows[0]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
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
