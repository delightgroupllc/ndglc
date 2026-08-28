import type { APIRoute } from 'astro';
import { query, withTransaction } from '../../../../lib/db';
import { z } from 'zod';

const transactionSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  payment_method: z.enum(['bank_transfer', 'cash', 'cheque', 'card', 'other']),
  transaction_ref: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  transaction_date: z.string().optional(),
});

export const GET: APIRoute = async ({ params }) => {
  try {
    const { id } = params;
    if (!id) return new Response(JSON.stringify({ error: 'Invoice ID required' }), { status: 400 });

    const res = await query(
      `SELECT * FROM transactions WHERE invoice_id = $1 ORDER BY transaction_date DESC, created_at DESC`,
      [id]
    );
    return new Response(JSON.stringify(res.rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ params, request }) => {
  try {
    const { id } = params;
    if (!id) return new Response(JSON.stringify({ error: 'Invoice ID required' }), { status: 400 });

    const data = await request.json();
    const parsed = transactionSchema.parse(data);

    const result = await withTransaction(async (client) => {
      // 1. Fetch invoice info
      const invRes = await client.query('SELECT total_amount, payment_status, inventory_deducted, order_type FROM invoices WHERE id = $1 FOR UPDATE', [id]);
      if (invRes.rows.length === 0) throw new Error('Invoice not found');
      const invoice = invRes.rows[0];

      // 2. Insert transaction record
      const date = parsed.transaction_date ? new Date(parsed.transaction_date) : new Date();
      const insertRes = await client.query(
        `INSERT INTO transactions (invoice_id, amount, payment_method, transaction_ref, transaction_date, notes, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [id, parsed.amount, parsed.payment_method, parsed.transaction_ref || null, date, parsed.notes || null, 'System']
      );

      // 3. Sum all transactions for this invoice
      const sumRes = await client.query('SELECT COALESCE(SUM(amount), 0) as total_paid FROM transactions WHERE invoice_id = $1', [id]);
      const totalPaid = parseFloat(sumRes.rows[0].total_paid);

      // 4. Determine new payment status
      let newStatus = invoice.payment_status;
      if (totalPaid >= invoice.total_amount) {
        newStatus = 'paid';
      } else if (totalPaid > 0) {
        newStatus = 'partially_paid';
      } else {
        newStatus = 'unpaid';
      }

      // 5. Update invoice status
      await client.query('UPDATE invoices SET payment_status = $1, updated_at = NOW() WHERE id = $2', [newStatus, id]);

      // 6. Handle Inventory Deduction if moving to paid (and not already deducted)
      const shouldDeduct = newStatus === 'paid' || invoice.order_type === 'delivery_note' || invoice.order_type === 'sample_order';
      if (shouldDeduct && !invoice.inventory_deducted) {
        // Fetch invoice items to deduct
        const itemsRes = await client.query('SELECT product_id, quantity FROM invoice_items WHERE invoice_id = $1', [id]);
        for (const item of itemsRes.rows) {
          if (!item.product_id) continue;
          
          const invStockRes = await client.query('SELECT id, stock_level FROM inventory WHERE product_id = $1 FOR UPDATE', [item.product_id]);
          if (invStockRes.rows.length > 0) {
            const stockRow = invStockRes.rows[0];
            const newStock = stockRow.stock_level - item.quantity;
            
            await client.query('UPDATE inventory SET stock_level = $1, updated_at = NOW() WHERE id = $2', [newStock, stockRow.id]);
            
            await client.query(`
              INSERT INTO inventory_logs (inventory_id, change_amount, previous_stock, new_stock, reason, user_id)
              VALUES ($1, $2, $3, $4, 'sales', null)
            `, [stockRow.id, -item.quantity, stockRow.stock_level, newStock]);
          }
        }
        await client.query('UPDATE invoices SET inventory_deducted = true WHERE id = $1', [id]);
      }

      return {
        transaction: insertRes.rows[0],
        total_paid: totalPaid,
        new_status: newStatus
      };
    });

    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: error.errors }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
};
