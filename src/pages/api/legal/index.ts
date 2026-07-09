import type { APIRoute } from 'astro';
import { query } from '../../../lib/db';
import { z } from 'zod';

const artifactSchema = z.object({
  title: z.string().min(1),
  identifier: z.string().min(1),
  type: z.enum(['public', 'order_clause', 'both']),
  content: z.string().min(1),
  division: z.string().optional().nullable()
});

export const GET: APIRoute = async () => {
  try {
    const res = await query('SELECT * FROM legal_artifacts ORDER BY type DESC, identifier ASC');
    return new Response(JSON.stringify(res.rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const parsed = artifactSchema.parse(data);

    const res = await query(
      `INSERT INTO legal_artifacts (title, identifier, type, content, division) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [parsed.title, parsed.identifier, parsed.type, parsed.content, parsed.division || null]
    );

    return new Response(JSON.stringify(res.rows[0]), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: error.errors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (error.code === '23505') {
      return new Response(JSON.stringify({ error: 'Identifier already exists.' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
