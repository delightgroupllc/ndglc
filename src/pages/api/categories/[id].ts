import type { APIRoute } from 'astro';
import { query, withTransaction } from '../../../lib/db';
import { z } from 'zod';

const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase with hyphens only'),
  division_id: z.string().uuid('Invalid division ID'),
  display_order: z.coerce.number().default(0),
  seo_title: z.string().optional(),
  seo_description: z.string().optional(),
  image_url: z.string().optional().nullable().or(z.literal('')),
});

export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const id = params.id;
    if (!id) return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 });

    const data = await request.json();
    const parsed = categorySchema.parse(data);

    const updated = await withTransaction(async (client) => {
      // Lock the row before updating
      const check = await client.query('SELECT id FROM categories WHERE id = $1 FOR UPDATE', [id]);
      if (check.rowCount === 0) throw new Error('Category not found');

      // Check slug uniqueness (excluding self)
      const slugCheck = await client.query(
        'SELECT id FROM categories WHERE slug = $1 AND id != $2 LIMIT 1',
        [parsed.slug, id]
      );
      if (slugCheck.rowCount && slugCheck.rowCount > 0) {
        throw Object.assign(new Error(`Slug "${parsed.slug}" is already in use by another category.`), { code: '23505' });
      }

      const res = await client.query(
        `UPDATE categories
         SET name=$1, slug=$2, division_id=$3, display_order=$4, seo_title=$5, seo_description=$6, image_url=$7
         WHERE id=$8 RETURNING *`,
        [parsed.name, parsed.slug, parsed.division_id, parsed.display_order,
         parsed.seo_title || null, parsed.seo_description || null, parsed.image_url || null, id]
      );
      return res.rows[0];
    });

    return new Response(JSON.stringify(updated), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: error.errors }), { status: 400 });
    }
    if (error.code === '23505') {
      return new Response(JSON.stringify({ error: error.message }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const id = params.id;
    if (!id) return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 });

    // Try direct delete first; if FK violation, tag the category instead
    try {
      const res = await query('DELETE FROM categories WHERE id = $1 RETURNING id', [id]);
      if (res.rowCount === 0) {
        return new Response(JSON.stringify({ error: 'Category not found' }), { status: 404 });
      }
      return new Response(JSON.stringify({ success: true, renamed: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (error: any) {
      // PostgreSQL FK violation — category has products linked
      if (error.code === '23503') {
        const catRes = await query('SELECT name, slug FROM categories WHERE id = $1', [id]);
        if (catRes.rowCount === 0) {
          return new Response(JSON.stringify({ error: 'Category not found' }), { status: 404 });
        }
        const cat = catRes.rows[0];
        // Avoid double-tagging
        const newName = cat.name.startsWith('deleted-cat-') ? cat.name : `deleted-cat-${cat.name}`;
        const newSlug = `deleted-cat-${cat.slug}-${Date.now()}`;

        await query(
          'UPDATE categories SET name=$1, slug=$2 WHERE id=$3',
          [newName, newSlug, id]
        );

        return new Response(JSON.stringify({
          success: true,
          renamed: true,
          message: `Category has active products and was tagged as "${newName}" instead of deleted.`,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw error;
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
};
