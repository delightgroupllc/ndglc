import pg from 'pg';
const { Pool } = pg;

/**
 * DATABASE CONFIGURATION
 * ─────────────────────
 * Uses standard `pg` (node-postgres) — NO Neon SDK, NO serverless driver.
 * Connection is to any PostgreSQL-compatible server via DATABASE_URL.
 * 
 * Supports:
 *   - Local PostgreSQL: postgres://user:pass@localhost:5432/dbname
 *   - Remote PostgreSQL with SSL (Aiven, RDS, etc.): full URL with sslmode
 *   - Unix socket: no DATABASE_URL needed, uses PG* env vars automatically
 *
 * Pool settings are tuned for a low-traffic admin dashboard.
 * ACID compliance: all multi-step writes must use pool.connect() + BEGIN/COMMIT/ROLLBACK.
 */

const databaseUrl =
  process.env.DATABASE_URL ||
  (typeof import.meta !== 'undefined' && import.meta.env?.DATABASE_URL);

// Strip ?sslmode=... from URL — we handle SSL config ourselves below
const cleanedUrl = databaseUrl ? databaseUrl.split('?')[0] : '';

// Detect if running in SSL context (not localhost)
const isRemote =
  databaseUrl &&
  !databaseUrl.includes('localhost') &&
  !databaseUrl.includes('127.0.0.1');

// Detect sslmode from original URL
const sslModeMatch = databaseUrl?.match(/[?&]sslmode=([^&]+)/);
const sslMode = sslModeMatch ? sslModeMatch[1] : null;

// Detect CA cert (optional — used for verify-full mode)
import fs from 'fs';
import path from 'path';

const searchPaths = [
  path.join(process.cwd(), 'ca.pem'),
  path.join(process.cwd(), '..', 'ca.pem'),
  path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'ca.pem'),
  path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'ca.pem'),
];

let caPath = '';
for (const p of searchPaths) {
  const normPath = p.replace(/^\/([A-Za-z]:)/, '$1');
  if (fs.existsSync(normPath)) { caPath = normPath; break; }
}

let sslConfig: any = undefined;
if (isRemote) {
  if (sslMode === 'verify-full' && caPath) {
    sslConfig = { rejectUnauthorized: true, ca: fs.readFileSync(caPath).toString() };
  } else if (sslMode === 'require' || sslMode === 'verify-ca' || sslMode === 'verify-full') {
    sslConfig = { rejectUnauthorized: false };
  } else if (caPath) {
    sslConfig = { rejectUnauthorized: true, ca: fs.readFileSync(caPath).toString() };
  } else {
    sslConfig = { rejectUnauthorized: false };
  }
}

if (process.env.NODE_ENV !== 'production') {
  console.log('─── DB CONNECT ───────────────────────');
  console.log('Driver     : pg (node-postgres, standard)');
  console.log('Target     : ' + (cleanedUrl ? cleanedUrl.replace(/:([^@]+)@/, ':***@') : 'LOCAL (env vars)'));
  console.log('SSL Mode   : ' + (sslMode || (isRemote ? 'auto' : 'disabled')));
  console.log('CA Cert    : ' + (caPath || 'not found'));
  console.log('──────────────────────────────────────');
}

export const pool = new Pool({
  connectionString: cleanedUrl || undefined,
  ssl: sslConfig,
  // Connection pool settings
  max: 10,                  // max connections in pool
  idleTimeoutMillis: 30000, // close idle connections after 30s
  connectionTimeoutMillis: 5000, // fail fast if DB is unreachable
});

// Graceful shutdown
pool.on('error', (err) => {
  console.error('Unexpected pg pool error:', err);
});

// Intercept all raw client queries inside the pool to clear cache on writes
pool.on('connect', (client) => {
  const originalQuery = client.query;
  client.query = function (this: any, text: any, params: any, callback: any) {
    let queryText = '';
    if (typeof text === 'string') {
      queryText = text;
    } else if (text && typeof text.text === 'string') {
      queryText = text.text;
    }
    
    if (queryText) {
      const isSelect = queryText.trim().toUpperCase().startsWith('SELECT');
      if (!isSelect) {
        clearQueryCache();
      }
    }
    return originalQuery.apply(this, arguments as any);
  } as any;
});

// In-memory query read cache (ACID self-invalidating)
interface CacheEntry {
  data: any;
  expiry: number;
}
const queryCache = new Map<string, CacheEntry>();
const CACHE_TTL = 30000; // 30 seconds query cache TTL

export function clearQueryCache() {
  queryCache.clear();
  if (process.env.NODE_ENV !== 'production') {
    console.log('[db-cache] ACID Invalidation triggered: Cache cleared.');
  }
}

/**
 * Execute a single query. For multi-step writes, use withTransaction() instead.
 */
export async function query<T extends pg.QueryResultRow = any>(text: string, params?: any[]) {
  const isSelect = text.trim().toUpperCase().startsWith('SELECT');
  
  if (!isSelect) {
    clearQueryCache();
  } else {
    // Check if valid cache entry exists
    const cacheKey = JSON.stringify({ text, params });
    const cached = queryCache.get(cacheKey);
    const now = Date.now();
    
    if (cached && cached.expiry > now) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[db-cache] SERVED FROM CACHE: ${text.substring(0, 85)}${text.length > 85 ? '…' : ''}`);
      }
      return cached.data;
    }
  }

  const start = Date.now();
  try {
    const res = await pool.query<T>(text, params);
    if (process.env.NODE_ENV !== 'production') {
      const duration = Date.now() - start;
      console.log(`[db] EXECUTE: ${text.substring(0, 80)}${text.length > 80 ? '…' : ''} (${duration}ms)`);
    }

    // Cache the SELECT query result
    if (isSelect) {
      const cacheKey = JSON.stringify({ text, params });
      queryCache.set(cacheKey, {
        data: res,
        expiry: Date.now() + CACHE_TTL
      });
    }

    return res;
  } catch (err) {
    console.error('[db] Query error:', err);
    throw err;
  }
}

// Derived categories cache (module-level) to avoid heavy aggregation hits on high traffic.
const derivedCategoriesCache = new Map<string, CacheEntry>();

/**
 * Return top categories for a division derived from products, cached for `ttl` ms.
 * Returns rows with `{ name, slug, product_count }`.
 */
export async function getDerivedCategories(divisionId: string, limit = 6, ttl = 30000) {
  const cacheKey = `derived_cat_${divisionId}_${limit}`;
  const now = Date.now();
  const cached = derivedCategoriesCache.get(cacheKey);
  if (cached && cached.expiry > now) {
    return cached.data;
  }

  const res = await pool.query(
    `SELECT c.name, c.slug, COUNT(p.id) as product_count
     FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE c.division_id = $1
     GROUP BY c.id
     ORDER BY product_count DESC
     LIMIT $2`,
    [divisionId, limit]
  );

  derivedCategoriesCache.set(cacheKey, { data: res, expiry: Date.now() + ttl });
  return res;
}

/**
 * ACID-safe transaction wrapper.
 * Automatically handles BEGIN / COMMIT / ROLLBACK and connection release.
 */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  clearQueryCache(); // Invalidate cache on transactions
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    clearQueryCache(); // Clear cache again post-transaction commit
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Export table data as CSV string.
 * Usage: const csv = await exportTableAsCSV('products', ['name', 'sku', 'status']);
 */
export async function exportTableAsCSV(table: string, columns: string[], where?: string, params?: any[]): Promise<string> {
  const cols = columns.map(c => `"${c}"`).join(', ');
  const whereClause = where ? ` WHERE ${where}` : '';
  const res = await query(`SELECT ${cols} FROM ${table}${whereClause} ORDER BY created_at DESC`, params);

  if (res.rows.length === 0) return columns.join(',') + '\n';

  const header = columns.join(',');
  const rows = res.rows.map((row: any) =>
    columns.map(col => {
      const val = row[col];
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
    }).join(',')
  );
  return [header, ...rows].join('\n');
}
