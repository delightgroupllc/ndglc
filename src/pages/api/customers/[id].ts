import type { APIRoute } from 'astro';
import { pool, withTransaction } from '../../../lib/db';
import { z } from 'zod';
import { getSimilarity } from '../companies/index';

const customerSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  email: z.string().email('Invalid email format').optional().or(z.literal('')).nullable(),
  phone: z.string().regex(/^\+?[\d\s\-()]{7,25}$/, 'Invalid phone number format (7-25 characters: digits, spaces, dashes, parentheses, or +)').optional().or(z.literal('')).nullable(),
  company_name: z.string().optional().nullable(),
  company_vat: z.string().optional().nullable(),
  billing_address: z.string().optional().nullable(),
  shipping_address: z.string().optional().nullable(),
  code: z.string().optional().nullable(),
  action: z.enum(['archive', 'unarchive', 'delete', 'restore', 'trash', 'permanent_remove']).optional(),
  bypassDuplicateCheck: z.boolean().optional(),
});

export const PUT: APIRoute = async ({ params, request, locals }) => {
  try {
    const id = params.id;
    if (!id) return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 });

    const data = await request.json();
    const parsed = customerSchema.parse(data);

    const result = await withTransaction(async (client) => {
      // Fetch current state
      const curRes = await client.query('SELECT * FROM customers WHERE id = $1', [id]);
      if (curRes.rows.length === 0) {
        throw new Error('Customer not found');
      }
      const customer = curRes.rows[0];

      if (parsed.name && parsed.name !== customer.name && !data.bypassDuplicateCheck) {
        const existing = await client.query("SELECT name FROM customers WHERE is_deleted = false AND id != $1", [id]);
        for (const row of existing.rows) {
          if (getSimilarity(parsed.name, row.name) > 0.9 && parsed.name.toLowerCase() !== row.name.toLowerCase()) {
            throw new Error(`DUPLICATE_WARNING: A customer with a very similar name already exists: "${row.name}"`);
          }
        }
      }

      if (parsed.action) {
        if (parsed.action === 'permanent_remove') {
          await client.query('UPDATE companies SET default_customer_id = NULL WHERE default_customer_id = $1', [id]);
          await client.query('DELETE FROM customers WHERE id = $1', [id]);
          await client.query(
            `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
             VALUES ('CUSTOMER_DELETE', 'customers', $1, $2, $3)`,
            [id, `Permanently removed customer: ${customer.name}`, locals.user?.id || null]
          );
          return { success: true, message: 'Customer permanently removed' };
        }
        if (parsed.action === 'archive' || parsed.action === 'unarchive') {
          const isArchived = parsed.action === 'archive';
          const res = await client.query(
            `UPDATE customers SET is_archived = $1 WHERE id = $2 RETURNING *`,
            [isArchived, id]
          );
          
          // Log archive status change
          await client.query(
            `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
             VALUES ($1, 'customers', $2, $3, $4)`,
            [isArchived ? 'CUSTOMER_ARCHIVE' : 'CUSTOMER_UNARCHIVE', id, `${isArchived ? 'Archived' : 'Unarchived'} customer: ${customer.name}`, locals.user?.id || null]
          );

          return res.rows[0];
        } else {
          const isDeleted = parsed.action === 'delete' || parsed.action === 'trash';
          const res = await client.query(
            `UPDATE customers SET is_deleted = $1 WHERE id = $2 RETURNING *`,
            [isDeleted, id]
          );
          
          // Log soft delete / restore status change
          await client.query(
            `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
             VALUES ($1, 'customers', $2, $3, $4)`,
            [isDeleted ? 'CUSTOMER_SOFT_DELETE' : 'CUSTOMER_RESTORE', id, `${isDeleted ? 'Soft-deleted' : 'Restored'} customer: ${customer.name}`, locals.user?.id || null]
          );

          return res.rows[0];
        }
      } else {
        const name = parsed.name !== undefined ? parsed.name : customer.name;
        const email = parsed.email !== undefined ? parsed.email : customer.email;
        const phone = parsed.phone !== undefined ? parsed.phone : customer.phone;
        const company = parsed.company_name !== undefined ? parsed.company_name : customer.company_name;
        const company_vat = parsed.company_vat !== undefined ? parsed.company_vat : customer.company_vat;
        const billing = parsed.billing_address !== undefined ? parsed.billing_address : customer.billing_address;
        const shipping = parsed.shipping_address !== undefined ? parsed.shipping_address : customer.shipping_address;

        const code = parsed.code !== undefined ? parsed.code?.trim() : customer.code;

        let companyId = null;
        let isNewCompany = false;
        if (company) {
          const checkComp = await client.query('SELECT id FROM companies WHERE name = $1', [company]);
          if (checkComp.rowCount > 0) {
            companyId = checkComp.rows[0].id;
            await client.query(
              `UPDATE companies SET
                 vat_number = COALESCE($1, vat_number),
                 billing_address = COALESCE($2, billing_address),
                 shipping_address = COALESCE($3, shipping_address)
               WHERE id = $4`,
              [company_vat || null, billing || null, shipping || null, companyId]
            );
          } else {
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
              [company, company_vat || null, billing || null, shipping || null, compCode]
            );
            companyId = compRes.rows[0].id;
            isNewCompany = true;
          }
        }

        const res = await client.query(
          `UPDATE customers SET
            name = $1, email = $2, phone = $3, company_name = $4, company_id = $5, billing_address = $6, shipping_address = $7, company_vat = $8, code = $9
           WHERE id = $10 RETURNING *`,
          [name, email || null, phone || null, company || null, companyId, billing || null, shipping || null, company_vat || null, code || null, id]
        );

        if (isNewCompany && companyId) {
          await client.query('UPDATE companies SET default_customer_id = $1 WHERE id = $2', [id, companyId]);
        }

        // Log edit action
        await client.query(
          `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
           VALUES ('CUSTOMER_UPDATE', 'customers', $1, $2, $3)`,
          [id, `Updated details for customer: ${name}`, locals.user?.id || null]
        );

        return res.rows[0];
      }
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
      else if (error.constraint?.includes('email')) field = 'email';
      return new Response(JSON.stringify({ error: `A customer with this ${field} already exists.` }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (error.message && error.message.startsWith('DUPLICATE_WARNING:')) {
      const msg = error.message.replace('DUPLICATE_WARNING: ', '');
      return new Response(JSON.stringify({ duplicateWarning: true, error: msg }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  try {
    const id = params.id;
    if (!id) return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 });

    const result = await withTransaction(async (client) => {
      const curRes = await client.query('SELECT name FROM customers WHERE id = $1', [id]);
      if (curRes.rows.length === 0) {
        throw new Error('Customer not found');
      }
      const name = curRes.rows[0].name;

      await client.query('UPDATE companies SET default_customer_id = NULL WHERE default_customer_id = $1', [id]);
      await client.query('DELETE FROM customers WHERE id = $1', [id]);

      // Log deletion
      await client.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
         VALUES ('CUSTOMER_DELETE', 'customers', $1, $2, $3)`,
        [id, `Deleted customer: ${name}`, locals.user?.id || null]
      );

      return { success: true, name };
    });

    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
};
