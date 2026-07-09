import type { APIRoute } from 'astro';
import { query, withTransaction } from '../../../lib/db';
import { z } from 'zod';
import { getSimilarity } from '../companies/index';

const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email format').optional().or(z.literal('')).nullable(),
  phone: z.string().regex(/^\+?[\d\s\-()]{7,25}$/, 'Invalid phone number format (7-25 characters: digits, spaces, dashes, parentheses, or +)').optional().or(z.literal('')).nullable(),
  company_name: z.string().optional().nullable(),
  company_vat: z.string().optional().nullable(),
  billing_address: z.string().optional().nullable(),
  shipping_address: z.string().optional().nullable(),
  code: z.string().optional().nullable(),
  bypassDuplicateCheck: z.boolean().optional(),
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

    if (!data.bypassDuplicateCheck) {
      const existing = await query("SELECT name FROM customers WHERE is_deleted = false");
      for (const row of existing.rows) {
        if (getSimilarity(parsed.name, row.name) > 0.9 && parsed.name.toLowerCase() !== row.name.toLowerCase()) {
          return new Response(JSON.stringify({
            duplicateWarning: true,
            error: `A customer with a very similar name already exists: "${row.name}". Do you want to proceed anyway?`
          }), { status: 409, headers: { 'Content-Type': 'application/json' } });
        }
      }
    }

    const result = await withTransaction(async (client) => {
      let companyId = null;
      let isNewCompany = false;
      if (parsed.company_name) {
        // Check if company already exists
        const checkComp = await client.query('SELECT id FROM companies WHERE name = $1', [parsed.company_name]);
        if (checkComp.rowCount > 0) {
          companyId = checkComp.rows[0].id;
          await client.query(
            `UPDATE companies SET
               vat_number = COALESCE($1, vat_number),
               billing_address = COALESCE($2, billing_address),
               shipping_address = COALESCE($3, shipping_address)
             WHERE id = $4`,
            [parsed.company_vat || null, parsed.billing_address || null, parsed.shipping_address || null, companyId]
          );
        } else {
          // Generate unique company code
          let compCode = null;
          const codesRes = await client.query("SELECT code FROM companies WHERE code LIKE 'COM-%'");
          let max = 1000;
          codesRes.rows.forEach(r => {
            const num = parseInt(r.code.replace('COM-', ''), 10);
            if (!isNaN(num) && num > max) max = num;
          });
          compCode = `COM-${max + 1}`;
          const compRes = await client.query(
            `INSERT INTO companies (name, vat_number, billing_address, shipping_address, code)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [parsed.company_name, parsed.company_vat || null, parsed.billing_address || null, parsed.shipping_address || null, compCode]
          );
          companyId = compRes.rows[0].id;
          isNewCompany = true;
        }
      }

      // Generate unique customer code
      let custCode = parsed.code?.trim() || null;
      if (!custCode) {
        const codesRes = await client.query("SELECT code FROM customers WHERE code LIKE 'CUS-%'");
        let max = 1000;
        codesRes.rows.forEach(r => {
          const num = parseInt(r.code.replace('CUS-', ''), 10);
          if (!isNaN(num) && num > max) max = num;
        });
        custCode = `CUS-${max + 1}`;
      }

      const res = await client.query(
        `INSERT INTO customers (name, email, phone, company_name, company_id, billing_address, shipping_address, company_vat, code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [parsed.name, parsed.email || null, parsed.phone || null, parsed.company_name || null, companyId, parsed.billing_address || null, parsed.shipping_address || null, parsed.company_vat || null, custCode]
      );
      const customer = res.rows[0];

      if (isNewCompany && companyId) {
        await client.query('UPDATE companies SET default_customer_id = $1 WHERE id = $2', [customer.id, companyId]);
      }

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
    if (error.code === '23505') {
      let field = 'record';
      if (error.constraint?.includes('name')) field = 'name';
      else if (error.constraint?.includes('code')) field = 'code';
      else if (error.constraint?.includes('email')) field = 'email';
      return new Response(JSON.stringify({ error: `A customer with this ${field} already exists.` }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

