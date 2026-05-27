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

export const POST: APIRoute = async ({ request }) => {
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
