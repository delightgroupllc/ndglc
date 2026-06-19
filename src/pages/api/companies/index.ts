import type { APIRoute } from 'astro';
import { query, withTransaction } from '../../../lib/db';
import { z } from 'zod';

const companySchema = z.object({
  name: z.string().min(1, 'Company Name is required'),
  vat_number: z.string().optional().nullable(),
  billing_address: z.string().optional().nullable(),
  shipping_address: z.string().optional().nullable(),
  code: z.string().optional().nullable(),
});

export const GET: APIRoute = async () => {
  try {
    const res = await query('SELECT * FROM companies ORDER BY name ASC');
    return new Response(JSON.stringify(res.rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const data = await request.json();
    const parsed = companySchema.parse(data);

    const result = await withTransaction(async (client) => {
      let compCode = parsed.code?.trim() || null;
      if (!compCode) {
        let isUnique = false;
        let attempts = 0;
        while (!isUnique && attempts < 100) {
          const randomNum = Math.floor(1000 + Math.random() * 9000);
          compCode = `COM-${randomNum}`;
          const check = await client.query('SELECT 1 FROM companies WHERE code = $1', [compCode]);
          if (check.rowCount === 0) {
            isUnique = true;
          }
          attempts++;
        }
      }

      const res = await client.query(
        `INSERT INTO companies (name, vat_number, billing_address, shipping_address, code)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [parsed.name, parsed.vat_number || null, parsed.billing_address || null, parsed.shipping_address || null, compCode]
      );
      const company = res.rows[0];

      // Insert Audit Log
      await client.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
         VALUES ('COMPANY_CREATE', 'companies', $1, $2, $3)`,
        [company.id, `Created company: ${parsed.name}`, locals.user?.id || null]
      );

      return company;
    });

    return new Response(JSON.stringify(result), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const details = error.errors.map(e => e.message).join(', ');
      return new Response(JSON.stringify({ error: details, details: error.errors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
