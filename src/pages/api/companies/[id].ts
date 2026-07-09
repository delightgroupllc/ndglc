import type { APIRoute } from 'astro';
import { query, withTransaction } from '../../../lib/db';
import { z } from 'zod';
import { getSimilarity } from './index';

const companySchema = z.object({
  name: z.string().min(1, 'Company Name is required').optional(),
  vat_number: z.string().optional().nullable(),
  billing_address: z.string().optional().nullable(),
  shipping_address: z.string().optional().nullable(),
  code: z.string().optional().nullable(),
  default_customer_id: z.string().optional().nullable(),
  bypassDuplicateCheck: z.boolean().optional(),
  action: z.enum(['archive', 'unarchive', 'restore', 'trash', 'permanent_remove']).optional(),
  customers: z.array(z.object({
    code: z.string().optional().nullable(),
    name: z.string().min(1, 'Customer Name is required'),
    email: z.string().email('Invalid email format').optional().or(z.literal('')).nullable(),
    phone: z.string().regex(/^\+?[\d\s\-()]{7,25}$/, 'Invalid phone number format (7-25 characters: digits, spaces, dashes, parentheses, or +)').optional().or(z.literal('')).nullable(),
    billing_address: z.string().optional().nullable(),
    shipping_address: z.string().optional().nullable(),
    is_default: z.boolean().default(false)
  })).optional().default([])
});

export const PUT: APIRoute = async ({ params, request, locals }) => {
  try {
    const { id } = params;
    if (!id) throw new Error('Company ID is required');

    const data = await request.json();
    const parsed = companySchema.parse(data);

    if (parsed.action) {
      if (parsed.action === 'permanent_remove') {
        const result = await withTransaction(async (client) => {
          const compRes = await client.query('SELECT name FROM companies WHERE id = $1', [id]);
          if (compRes.rows.length === 0) throw new Error('Company not found');
          const compName = compRes.rows[0].name;

          await client.query('UPDATE customers SET company_id = NULL, company_name = NULL WHERE company_id = $1', [id]);
          await client.query('DELETE FROM companies WHERE id = $1', [id]);
          await client.query(
            `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
             VALUES ('COMPANY_DELETE', 'companies', $1, $2, $3)`,
            [id, `Deleted company: ${compName}`, locals.user?.id || null]
          );
          return { success: true };
        });
        return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (parsed.action === 'archive' || parsed.action === 'unarchive') {
        const isArchived = parsed.action === 'archive';
        const result = await withTransaction(async (client) => {
          const res = await client.query(
            `UPDATE companies SET is_archived = $1 WHERE id = $2 RETURNING *`,
            [isArchived, id]
          );
          await client.query(
            `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
             VALUES ($1, 'companies', $2, $3, $4)`,
            [isArchived ? 'COMPANY_ARCHIVE' : 'COMPANY_UNARCHIVE', id, `${isArchived ? 'Archived' : 'Unarchived'} company: ${res.rows[0].name}`, locals.user?.id || null]
          );
          return res.rows[0];
        });
        return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } else {
        const isDeleted = parsed.action === 'trash';
        const result = await withTransaction(async (client) => {
          const res = await client.query(
            `UPDATE companies SET is_deleted = $1 WHERE id = $2 RETURNING *`,
            [isDeleted, id]
          );
          await client.query(
            `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
             VALUES ($1, 'companies', $2, $3, $4)`,
            [isDeleted ? 'COMPANY_SOFT_DELETE' : 'COMPANY_RESTORE', id, `${isDeleted ? 'Soft-deleted' : 'Restored'} company: ${res.rows[0].name}`, locals.user?.id || null]
          );
          return res.rows[0];
        });
        return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    if (!data.bypassDuplicateCheck) {
      const existing = await query("SELECT name FROM companies WHERE is_deleted = false AND id != $1", [id]);
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
      const res = await client.query(
        `UPDATE companies
         SET name = $1, vat_number = $2, billing_address = $3, shipping_address = $4, code = $5
         WHERE id = $6
         RETURNING *`,
        [parsed.name, parsed.vat_number || null, parsed.billing_address || null, parsed.shipping_address || null, parsed.code?.trim() || null, id]
      );
      if (res.rows.length === 0) throw new Error('Company not found');
      const company = res.rows[0];

      // Delete existing customers linked to this company
      await client.query('DELETE FROM customers WHERE company_id = $1', [id]);

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
    if (error.code === '23505') {
      let field = 'record';
      if (error.constraint?.includes('name')) field = 'name';
      else if (error.constraint?.includes('code')) field = 'code';
      return new Response(JSON.stringify({ error: `A company with this ${field} already exists.` }), { status: 400, headers: { 'Content-Type': 'application/json' } });
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

      // Unlink customers
      await client.query('UPDATE customers SET company_id = NULL, company_name = NULL WHERE company_id = $1', [id]);

      // Delete company
      await client.query('DELETE FROM companies WHERE id = $1', [id]);

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
