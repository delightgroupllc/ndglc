import type { APIRoute } from 'astro';
import { query } from '../../../lib/db';
import { z } from 'zod';

const partnerSchema = z.object({
  name: z.string().min(1),
  logo_url: z.string().url(),
  website_url: z.string().url().optional().nullable(),
  visibility_pages: z.array(z.string()).default([]),
  display_style: z.enum(['grid', 'list', 'scroll']).default('grid'),
  status: z.enum(['active', 'inactive', 'archived']).default('active'),
  division: z.enum(['dtl', 'dgs', 'both']).default('dtl')
});

export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const id = params.id;
    if (!id) throw new Error("ID required");

    const data = await request.json();
    const parsed = partnerSchema.parse(data);

    const res = await query(
      `UPDATE trusted_partners 
       SET name = $1, logo_url = $2, website_url = $3, visibility_pages = $4, display_style = $5, status = $6, division = $7, updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [parsed.name, parsed.logo_url, parsed.website_url || null, JSON.stringify(parsed.visibility_pages), parsed.display_style, parsed.status, parsed.division, id]
    );

    if (res.rowCount === 0) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

    return new Response(JSON.stringify(res.rows[0]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: error.errors }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const id = params.id;
    if (!id) throw new Error("ID required");

    const res = await query(`DELETE FROM trusted_partners WHERE id = $1 RETURNING id`, [id]);

    if (res.rowCount === 0) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
};
