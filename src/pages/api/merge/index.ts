import type { APIRoute } from 'astro';
import { withTransaction } from '../../../lib/db';
import { z } from 'zod';

const mergeSchema = z.object({
  entityType: z.enum(['customer', 'company']),
  primaryCode: z.string().min(1),
  duplicateId: z.string().min(1),
});

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const data = await request.json();
    const parsed = mergeSchema.parse(data);

    const result = await withTransaction(async (client) => {
      if (parsed.entityType === 'company') {
        // Fetch primary & duplicate names
        const primRes = await client.query('SELECT id, name FROM companies WHERE code = $1', [parsed.primaryCode.trim()]);
        const dupRes = await client.query('SELECT name FROM companies WHERE id = $1', [parsed.duplicateId]);

        if (primRes.rows.length === 0) throw new Error(`Primary company with code "${parsed.primaryCode}" not found`);
        if (dupRes.rows.length === 0) throw new Error('Duplicate company not found');

        const primaryId = primRes.rows[0].id;
        const primaryName = primRes.rows[0].name;
        const duplicateName = dupRes.rows[0].name;

        if (primaryId === parsed.duplicateId) throw new Error('Cannot merge a company into itself');

        // 1. Move customers
        await client.query(
          `UPDATE customers SET company_id = $1, company_name = $2 WHERE company_id = $3`,
          [primaryId, primaryName, parsed.duplicateId]
        );

        // 2. Update Invoices company name
        await client.query(
          `UPDATE invoices SET company_name = $1 WHERE company_name = $2`,
          [primaryName, duplicateName]
        );

        // 3. Delete duplicate company
        await client.query(`DELETE FROM companies WHERE id = $1`, [parsed.duplicateId]);

        // Insert Audit Log
        await client.query(
          `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
           VALUES ('COMPANY_MERGE', 'companies', $1, $2, $3)`,
          [primaryId, `Merged company "${duplicateName}" into "${primaryName}"`, locals.user?.id || null]
        );

        return { success: true, message: `Successfully merged "${duplicateName}" into "${primaryName}".` };
      } else {
        // Fetch primary & duplicate details
        const primRes = await client.query('SELECT id, name, email, phone FROM customers WHERE code = $1', [parsed.primaryCode.trim()]);
        const dupRes = await client.query('SELECT name, email, phone FROM customers WHERE id = $1', [parsed.duplicateId]);

        if (primRes.rows.length === 0) throw new Error(`Primary customer with code "${parsed.primaryCode}" not found`);
        if (dupRes.rows.length === 0) throw new Error('Duplicate customer not found');

        const primaryId = primRes.rows[0].id;
        const primary = primRes.rows[0];
        const duplicate = dupRes.rows[0];

        if (primaryId === parsed.duplicateId) throw new Error('Cannot merge a customer into itself');

        // 1. Update Invoices customer details
        await client.query(
          `UPDATE invoices 
           SET customer_name = $1, customer_email = $2, customer_phone = $3 
           WHERE customer_name = $4`,
          [primary.name, primary.email || null, primary.phone || null, duplicate.name]
        );

        // 2. Delete duplicate customer
        await client.query(`DELETE FROM customers WHERE id = $1`, [parsed.duplicateId]);

        // Insert Audit Log
        await client.query(
          `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
           VALUES ('CUSTOMER_MERGE', 'customers', $1, $2, $3)`,
          [primaryId, `Merged customer "${duplicate.name}" into "${primary.name}"`, locals.user?.id || null]
        );

        return { success: true, message: `Successfully merged "${duplicate.name}" into "${primary.name}".` };
      }
    });

    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const details = error.errors.map(e => e.message).join(', ');
      return new Response(JSON.stringify({ error: details }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
};
