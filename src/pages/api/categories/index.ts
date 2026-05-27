import type { APIRoute } from 'astro';
import { query, withTransaction, exportTableAsCSV } from '../../../lib/db';
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

export const GET: APIRoute = async ({ url }) => {
  try {
    if (url.searchParams.get('export') === 'csv') {
      const csv = await exportTableAsCSV('categories', ['name', 'slug', 'display_order', 'seo_title', 'created_at']);
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="categories-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    const res = await query(`
      SELECT c.*, d.name as division_name
      FROM categories c
      JOIN divisions d ON c.division_id = d.id
      ORDER BY d.name, c.display_order ASC
    `);
    return new Response(JSON.stringify(res.rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const parsed = categorySchema.parse(data);

    const result = await withTransaction(async (client) => {
      // Duplicate slug check across all categories
      const slugCheck = await client.query(
        'SELECT id, name FROM categories WHERE slug = $1 LIMIT 1',
        [parsed.slug]
      );
      if (slugCheck.rowCount && slugCheck.rowCount > 0) {
        throw Object.assign(
          new Error(`Slug "${parsed.slug}" is already used by category "${slugCheck.rows[0].name}".`),
          { code: '23505' }
        );
      }

      // Duplicate name check within same division
      const nameCheck = await client.query(
        'SELECT id FROM categories WHERE LOWER(name) = LOWER($1) AND division_id = $2 LIMIT 1',
        [parsed.name, parsed.division_id]
      );
      if (nameCheck.rowCount && nameCheck.rowCount > 0) {
        throw new Error(`Category "${parsed.name}" already exists in this division.`);
      }

      const res = await client.query(
        `INSERT INTO categories (name, slug, division_id, display_order, seo_title, seo_description, image_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [parsed.name, parsed.slug, parsed.division_id, parsed.display_order, parsed.seo_title || null, parsed.seo_description || null, parsed.image_url || null]
      );
      return res.rows[0];
    });

    return new Response(JSON.stringify(result), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: error.errors }), { status: 400 });
    }
    if (error.code === '23505' || error.message?.includes('already')) {
      return new Response(JSON.stringify({ error: error.message }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
};
