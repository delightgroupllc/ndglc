import type { APIRoute } from 'astro';
import { query } from '../../../lib/db';
import { z } from 'zod';

const downloadSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  type: z.enum(['pdf', 'catalog', 'datasheet']),
  category_id: z.string().uuid().nullable().optional(),
  file_size: z.string().nullable().optional(),          // manual text e.g. "19 MB" — auto-filled if uploaded
  status: z.enum(['active', 'hidden', 'archived']).default('active'),
  division: z.enum(['dtl', 'dgs']).default('dtl'),
  visibility_rules: z.record(z.any()).nullable().optional(),
  permission_required: z.string().nullable().optional(),
});

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const parsed = downloadSchema.parse(data);

    // Build visibility_rules: merge division into JSONB for public-facing filter
    const visRules = parsed.visibility_rules ?? {
      pages: ['home', parsed.division],
      division: parsed.division,
      public: parsed.status === 'active',
    };

    const res = await query(
      `INSERT INTO downloads (title, url, type, category_id, file_size, status, division, visibility_rules, permission_required, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, NOW()) RETURNING *`,
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
      ]
    );

    return new Response(JSON.stringify(res.rows[0]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: error.errors }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
};
