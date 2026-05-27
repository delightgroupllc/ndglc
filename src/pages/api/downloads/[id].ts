import type { APIRoute } from 'astro';
import { query } from '../../../lib/db';
import { z } from 'zod';

const downloadSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  type: z.enum(['pdf', 'catalog', 'datasheet']),
  category_id: z.string().uuid().nullable().optional(),
  file_size: z.string().nullable().optional(),          // manual text e.g. "19 MB"
  status: z.enum(['active', 'hidden', 'archived']).default('active'),
  division: z.enum(['dtl', 'dgs']).default('dtl'),
  visibility_rules: z.record(z.any()).nullable().optional(),
  permission_required: z.string().nullable().optional(),
});

export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const id = params.id;
    if (!id) throw new Error("ID required");

    const data = await request.json();
    const parsed = downloadSchema.parse(data);

    const visRules = parsed.visibility_rules ?? {
      pages: ['home', parsed.division],
      division: parsed.division,
      public: parsed.status === 'active',
    };

    const res = await query(
      `UPDATE downloads 
       SET title = $1, url = $2, type = $3, category_id = $4, file_size = $5,
           status = $6, division = $7, visibility_rules = $8::jsonb,
           permission_required = $9, updated_at = NOW()
       WHERE id = $10 RETURNING *`,
      [
        parsed.title,
        parsed.url,
        parsed.type,
        parsed.category_id || null,
        parsed.file_size || null,
        parsed.status,
        parsed.division,
        JSON.stringify(visRules),
        parsed.permission_required || null,
        id,
      ]
    );

    if (res.rowCount === 0) {
      throw new Error('Download not found');
    }

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

    const res = await query(`DELETE FROM downloads WHERE id = $1 RETURNING id`, [id]);

    if (res.rowCount === 0) {
      return new Response(JSON.stringify({ error: 'Download not found' }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
};
