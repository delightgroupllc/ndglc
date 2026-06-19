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

export const PUT: APIRoute = async ({ params, request, locals }) => {
  try {
    const { id } = params;
    if (!id) throw new Error('Company ID is required');

    const data = await request.json();
    const parsed = companySchema.parse(data);

    const result = await withTransaction(async (client) => {
      const res = await client.query(
        `UPDATE companies
         SET name = $1, vat_number = $2, billing_address = $3, shipping_address = $4, code = $5
         WHERE id = $6
         RETURNING *`,
        [parsed.name, parsed.vat_number || null, parsed.billing_address || null, parsed.shipping_address || null, parsed.code?.trim() || null, id]
      );
      if (res.rows.length === 0) throw new Error('Company not found');
      const company = res.rows[0];

      // Update linked customers' company name
      await client.query(
        `UPDATE customers
         SET company_name = $1
         WHERE company_id = $2`,
        [parsed.name, id]
      );

      // Insert Audit Log
      await client.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
         VALUES ('COMPANY_UPDATE', 'companies', $1, $2, $3)`,
        [id, `Updated company: ${parsed.name}`, locals.user?.id || null]
      );

      return company;
    });

    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const details = error.errors.map(e => e.message).join(', ');
      return new Response(JSON.stringify({ error: details, details: error.errors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  try {
    const { id } = params;
    if (!id) throw new Error('Company ID is required');

    const result = await withTransaction(async (client) => {
      // Find company
      const compRes = await client.query('SELECT name FROM companies WHERE id = $1', [id]);
      if (compRes.rows.length === 0) throw new Error('Company not found');
      const compName = compRes.rows[0].name;

      // Delete company
      await client.query('DELETE FROM companies WHERE id = $1', [id]);

      // Unlink customers
      await client.query('UPDATE customers SET company_id = NULL, company_name = NULL WHERE company_id = $1', [id]);

      // Insert Audit Log
      await client.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
         VALUES ('COMPANY_DELETE', 'companies', $1, $2, $3)`,
        [id, `Deleted company: ${compName}`, locals.user?.id || null]
      );

      return { success: true };
    });

    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
