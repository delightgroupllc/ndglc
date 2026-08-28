import type { APIRoute } from 'astro';
import { query, pool } from '../../../lib/db';
import { z } from 'zod';

// Allow settings values to be strings or arrays of strings (for list-type settings like `rooms`).
const settingsSchema = z.record(z.union([z.string(), z.array(z.union([z.string(), z.any()]))]));

export const GET: APIRoute = async () => {
  try {
    const res = await query('SELECT key, value FROM settings');
    const settings = res.rows.reduce((acc: any, row: any) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    
    return new Response(JSON.stringify(settings), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const data = await request.json();
    const parsed = settingsSchema.parse(data);
    
    const keys = Object.keys(parsed);
    if (keys.length === 0) {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of Object.entries(parsed)) {
        // Special-case `rooms` setting: accept array of strings or array of objects { name, iconUrl? }
        let valueToStore: string;
        if (key === 'rooms') {
          if (!Array.isArray(value)) throw new Error('rooms must be an array');
          const normalized = (value as any[]).map((v) => {
            if (typeof v === 'string') return { name: v.trim(), iconUrl: null };
            if (typeof v === 'object' && v !== null) return { name: String(v.name || '').trim(), iconUrl: v.iconUrl ? String(v.iconUrl).trim() : null };
            throw new Error('Invalid room item');
          }).filter(r => r.name);

          // Ensure uniqueness
          const names = normalized.map(r => r.name.toLowerCase());
          const dup = names.find((n, i) => names.indexOf(n) !== i);
          if (dup) throw new Error('Room names must be unique');

          valueToStore = JSON.stringify(normalized);
        } else {
          valueToStore = Array.isArray(value) ? JSON.stringify(value) : String(value);
        }

        await client.query(
          `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`,
          [key, valueToStore]
        );
      }

      // Record update event in audit_logs
      const isFinanceLegal = keys.some(k => ['banks', 'signatures', 'addresses', 'company_stamp', 'enable_both_divisions', 'bank_name', 'trn_number'].includes(k));
      let action = 'UPDATE_SETTINGS';
      let entityType = 'settings';
      let details = `Updated system settings (${keys.join(', ')})`;

      if (isFinanceLegal) {
        action = 'UPDATE_FINANCE_LEGAL';
        entityType = 'finance_legal';

        const detailsParts: string[] = [];
        if (keys.includes('banks')) {
          try {
            const b = typeof parsed.banks === 'string' ? JSON.parse(parsed.banks) : parsed.banks;
            detailsParts.push(`${b.length} bank account(s)`);
          } catch(e) {
            detailsParts.push('bank accounts');
          }
        }
        if (keys.includes('signatures')) {
          try {
            const s = typeof parsed.signatures === 'string' ? JSON.parse(parsed.signatures) : parsed.signatures;
            detailsParts.push(`${s.length} signatory stamp(s)`);
          } catch(e) {
            detailsParts.push('signatory stamps');
          }
        }
        if (keys.includes('addresses')) {
          try {
            const a = typeof parsed.addresses === 'string' ? JSON.parse(parsed.addresses) : parsed.addresses;
            detailsParts.push(`${a.length} office profile(s)`);
          } catch(e) {
            detailsParts.push('office addresses');
          }
        }
        if (keys.includes('company_stamp')) {
          detailsParts.push(parsed.company_stamp ? 'corporate stamp updated' : 'corporate stamp cleared');
        }
        if (keys.includes('enable_both_divisions')) {
          detailsParts.push(`Multi-Division Combined Invoicing ${parsed.enable_both_divisions === 'true' ? 'ENABLED' : 'DISABLED'}`);
        }

        details = `Updated Finance & Legal settings: ${detailsParts.join(', ')}`;
      }

      await client.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [action, entityType, 'finance_legal_config', details, (locals as any)?.user?.id || null]
      );

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: error.errors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
