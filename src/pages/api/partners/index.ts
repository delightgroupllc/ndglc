import type { APIRoute } from 'astro';
import { query, withTransaction, exportTableAsCSV } from '../../../lib/db';
import { z } from 'zod';

const partnerSchema = z.object({
  name: z.string().min(1, 'Partner name is required'),
  logo_url: z.string().url('Logo URL must be a valid URL'),
  website_url: z.string().url('Website URL must be a valid URL').optional().nullable().or(z.literal('')),
  visibility_pages: z.array(z.string()).default([]),
  display_style: z.enum(['grid', 'list', 'scroll']).default('grid'),
  status: z.enum(['active', 'inactive', 'archived']).default('active'),
  division: z.enum(['dtl', 'dgs', 'both']).default('dtl'),
});

export const GET: APIRoute = async ({ url }) => {
  try {
    if (url.searchParams.get('export') === 'csv') {
      const csv = await exportTableAsCSV('trusted_partners',
        ['name', 'website_url', 'division', 'display_style', 'status', 'created_at']
      );
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="partners-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    const res = await query('SELECT * FROM trusted_partners ORDER BY created_at DESC');
    return new Response(JSON.stringify(res.rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const parsed = partnerSchema.parse(data);

    const result = await withTransaction(async (client) => {
      // Duplicate partner name check
      const nameCheck = await client.query(
        'SELECT id FROM trusted_partners WHERE LOWER(name) = LOWER($1) LIMIT 1',
        [parsed.name]
      );
      if (nameCheck.rowCount && nameCheck.rowCount > 0) {
        throw Object.assign(
          new Error(`A partner named "${parsed.name}" already exists.`),
          { code: 'DUPLICATE_NAME' }
        );
      }

      const res = await client.query(
        `INSERT INTO trusted_partners (name, logo_url, website_url, visibility_pages, display_style, status, division)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [parsed.name, parsed.logo_url, parsed.website_url || null,
         JSON.stringify(parsed.visibility_pages), parsed.display_style, parsed.status, parsed.division]
      );
      return res.rows[0];
    });

    return new Response(JSON.stringify(result), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: error.errors }), { status: 400 });
    }
    if (error.code === 'DUPLICATE_NAME' || error.code === '23505') {
      return new Response(JSON.stringify({ error: error.message }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
};
