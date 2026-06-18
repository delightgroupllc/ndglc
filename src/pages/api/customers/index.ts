import type { APIRoute } from 'astro';
import { query, withTransaction } from '../../../lib/db';
import { z } from 'zod';

const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email format').optional().or(z.literal('')).nullable(),
  phone: z.string().regex(/^\+?[\d\s\-()]{7,25}$/, 'Invalid phone number format (7-25 characters: digits, spaces, dashes, parentheses, or +)').optional().or(z.literal('')).nullable(),
  company_name: z.string().optional().nullable(),
  company_vat: z.string().optional().nullable(),
  billing_address: z.string().optional().nullable(),
  shipping_address: z.string().optional().nullable(),
});

export const GET: APIRoute = async () => {
  try {
    const res = await query('SELECT * FROM customers ORDER BY name ASC');
    return new Response(JSON.stringify(res.rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const data = await request.json();
    const parsed = customerSchema.parse(data);

    const result = await withTransaction(async (client) => {
      const res = await client.query(
        `INSERT INTO customers (name, email, phone, company_name, billing_address, shipping_address, company_vat)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [parsed.name, parsed.email || null, parsed.phone || null, parsed.company_name || null, parsed.billing_address || null, parsed.shipping_address || null, parsed.company_vat || null]
      );
      const customer = res.rows[0];

      // Insert Audit Log
      await client.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
         VALUES ('CUSTOMER_CREATE', 'customers', $1, $2, $3)`,
        [customer.id, `Created customer: ${parsed.name}`, locals.user?.id || null]
      );

      return customer;
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

