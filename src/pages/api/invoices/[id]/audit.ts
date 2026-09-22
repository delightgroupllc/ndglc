import type { APIRoute } from 'astro';
import { getInvoiceAuditTrail } from '../../../../lib/audit';

export const GET: APIRoute = async ({ params }) => {
  try {
    const id = params.id;
    if (!id) {
      return new Response(JSON.stringify({ error: 'Invoice ID or number required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const auditTrail = await getInvoiceAuditTrail(id);
    return new Response(JSON.stringify(auditTrail), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Invoice audit API error:', error);
    const status = error.message?.includes('not found') ? 404 : 500;
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
