import type { APIRoute } from 'astro';
import { query, withTransaction } from '../../../lib/db';
import { z } from 'zod';

const companySchema = z.object({
  name: z.string().min(1, 'Company Name is required'),
  vat_number: z.string().optional().nullable(),
  billing_address: z.string().optional().nullable(),
  shipping_address: z.string().optional().nullable(),
  code: z.string().optional().nullable(),
  default_customer_id: z.string().optional().nullable(),
  bypassDuplicateCheck: z.boolean().optional(),
  customers: z.array(z.object({
    code: z.string().optional().nullable(),
    name: z.string().min(1, 'Customer Name is required'),
    email: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    billing_address: z.string().optional().nullable(),
    shipping_address: z.string().optional().nullable(),
    is_default: z.boolean().default(false)
  })).optional().default([])
});

function levenshtein(a: string, b: string): number {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export function getSimilarity(a: string, b: string): number {
  const normA = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normB = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1.0;
  return 1.0 - levenshtein(normA, normB) / maxLen;
}

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

    if (!data.bypassDuplicateCheck) {
      const existing = await query("SELECT name FROM companies WHERE is_deleted = false");
      for (const row of existing.rows) {
        if (getSimilarity(parsed.name, row.name) > 0.9 && parsed.name.toLowerCase() !== row.name.toLowerCase()) {
          return new Response(JSON.stringify({
            duplicateWarning: true,
            error: `A company with a very similar name already exists: "${row.name}". Do you want to proceed anyway?`
          }), { status: 409, headers: { 'Content-Type': 'application/json' } });
        }
      }
    }

    const result = await withTransaction(async (client) => {
      let compCode = parsed.code?.trim() || null;
      if (!compCode) {
        const codesRes = await client.query("SELECT code FROM companies WHERE code LIKE 'COM-%'");
        let max = 1000;
        codesRes.rows.forEach(r => {
          const num = parseInt(r.code.replace('COM-', ''), 10);
          if (!isNaN(num) && num > max) max = num;
        });
        compCode = `COM-${max + 1}`;
      }

      const res = await client.query(
        `INSERT INTO companies (name, vat_number, billing_address, shipping_address, code)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [parsed.name, parsed.vat_number || null, parsed.billing_address || null, parsed.shipping_address || null, compCode]
      );
      const company = res.rows[0];

      let defaultCustId = parsed.default_customer_id || null;

      for (const cust of parsed.customers) {
        let custCode = cust.code?.trim() || null;
        if (!custCode) {
          const codesRes = await client.query("SELECT code FROM customers WHERE code LIKE 'CUS-%'");
          let max = 1000;
          codesRes.rows.forEach(r => {
            if (r.code) {
              const num = parseInt(r.code.replace('CUS-', ''), 10);
              if (!isNaN(num) && num > max) max = num;
            }
          });
          custCode = `CUS-${max + 1}`;
        }
        const custRes = await client.query(
          `INSERT INTO customers (name, email, phone, company_name, company_id, company_vat, billing_address, shipping_address, code)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [cust.name, cust.email || null, cust.phone || null, company.name, company.id, company.vat_number || null, cust.billing_address || company.billing_address || null, cust.shipping_address || company.shipping_address || null, custCode]
        );
        const inserted = custRes.rows[0];
        if (cust.is_default || !defaultCustId) {
          defaultCustId = inserted.id;
        }
      }

      if (defaultCustId) {
        await client.query(
          `UPDATE companies SET default_customer_id = $1 WHERE id = $2`,
          [defaultCustId, company.id]
        );
        company.default_customer_id = defaultCustId;
      }

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
