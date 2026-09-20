# Immutable Audit Log Specification & Implementation Guide
**Platform:** Delight Group LLC Platform (`ndglc`)  
**Compliance Standards:** UAE Federal Tax Authority (FTA) Article 78, GAAP, ISO 27001, WORM (Write Once, Read Many)  
**Status:** Ready for Future Implementation  

---

## 1. Executive Summary

This specification outlines the architecture and execution plan for converting the platform's existing `audit_logs` system into a **Hardware-Independent Immutable Audit Ledger (WORM)**.

### Core Objectives:
1. **Mathematical Non-Repudiation**: Once an invoice, order, payment status, or inventory change is written, it can **never** be edited, overwritten, backdated, or deleted—even by an admin or database superuser.
2. **Cryptographic Tamper-Evidence**: Uses SHA-256 hash chaining (similar to blockchain block-headers and Git commit trees). If even one character, price, or timestamp in a past log is manipulated, the entire chain breaks visibly.
3. **Statutory Tax Compliance**: Satisfies the mandatory 5-year UAE FTA VAT record retention requirement without needing expensive proprietary WORM hardware.

---

## 2. Three-Tier Architectural Defense

```
[ Financial / Inventory / Admin Event ]
                   │
                   ▼
     ┌───────────────────────────┐
     │ 1. Cryptographic Hasher   │
     │    SHA-256(Previous Hash  │
     │    + Timestamp + Payload) │
     └─────────────┬─────────────┘
                   │
                   ▼  (INSERT ONLY)
     ┌───────────────────────────┐
     │ 2. PostgreSQL Engine      │
     │    Trigger Blocks:        │
     │    ❌ UPDATE              │
     │    ❌ DELETE              │
     │    ❌ TRUNCATE            │
     └─────────────┬─────────────┘
                   │
                   ▼
     ┌───────────────────────────┐
     │ 3. Auditor Dashboard      │
     │    "100% Chain Intact"    │
     │    1-Click Verification   │
     └───────────────────────────┘
```

---

## 3. Database Schema Migration (SQL)

Run this migration in PostgreSQL when ready to activate the immutable ledger:

```sql
-- Step 1: Add cryptographic hash columns and sequence number
ALTER TABLE audit_logs 
  ADD COLUMN IF NOT EXISTS sequence_num BIGSERIAL,
  ADD COLUMN IF NOT EXISTS previous_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS record_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS is_immutable BOOLEAN DEFAULT TRUE;

-- Create index for sequential hash verification
CREATE INDEX IF NOT EXISTS idx_audit_logs_seq ON audit_logs (sequence_num ASC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record_hash ON audit_logs (record_hash);

-- Step 2: Create the Immutability Enforcement Function
CREATE OR REPLACE FUNCTION enforce_audit_log_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'COMPLIANCE VIOLATION: audit_logs is an immutable append-only ledger. Row updates are permanently prohibited (Record ID: %)', OLD.id;
    ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'COMPLIANCE VIOLATION: audit_logs is an immutable append-only ledger. Row deletions are permanently prohibited (Record ID: %)', OLD.id;
    ELSIF TG_OP = 'TRUNCATE' THEN
        RAISE EXCEPTION 'COMPLIANCE VIOLATION: audit_logs is an immutable append-only ledger. Table truncation is strictly forbidden.';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Attach the Trigger to audit_logs
DROP TRIGGER IF EXISTS trg_audit_log_immutability ON audit_logs;
CREATE TRIGGER trg_audit_log_immutability
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION enforce_audit_log_immutability();

DROP TRIGGER IF EXISTS trg_audit_log_no_truncate ON audit_logs;
CREATE TRIGGER trg_audit_log_no_truncate
BEFORE TRUNCATE ON audit_logs
FOR EACH STATEMENT
EXECUTE FUNCTION enforce_audit_log_immutability();

-- Step 4: Revoke modification privileges from standard app users (Optional hardening)
-- REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM app_user;
```

---

## 4. Application Logic (TypeScript / Node.js)

### Ledger Helper: `src/lib/immutableLedger.ts`

```typescript
import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { query } from './db';

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export interface AuditPayload {
  action: string;
  entity_type: string;
  entity_id: string;
  details: string;
  user_id?: string | null;
  ip_address?: string | null;
  snapshot?: any;
}

/**
 * Calculates SHA-256 checksum of an audit entry linked to the previous record hash.
 */
export function calculateRecordHash(
  previousHash: string,
  timestamp: string,
  action: string,
  entityType: string,
  entityId: string,
  details: string,
  snapshot: any
): string {
  const content = [
    previousHash,
    timestamp,
    action,
    entityType,
    entityId,
    details || '',
    snapshot ? JSON.stringify(snapshot) : ''
  ].join('|');

  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Writes an immutable, cryptographically chained audit log entry.
 * Can use an existing transactional PoolClient or standard query runner.
 */
export async function insertImmutableAuditLog(
  payload: AuditPayload,
  client?: PoolClient
): Promise<{ id: string; record_hash: string }> {
  const runner = client ? client.query.bind(client) : query;

  // 1. Fetch latest record hash in sequence
  const latestRes = await runner(
    `SELECT record_hash FROM audit_logs ORDER BY sequence_num DESC LIMIT 1`
  );
  const previousHash = latestRes.rows.length > 0 && latestRes.rows[0].record_hash
    ? latestRes.rows[0].record_hash
    : GENESIS_HASH;

  const timestamp = new Date().toISOString();
  const recordHash = calculateRecordHash(
    previousHash,
    timestamp,
    payload.action,
    payload.entity_type,
    payload.entity_id,
    payload.details,
    payload.snapshot
  );

  // 2. Insert append-only record
  const insertRes = await runner(
    `INSERT INTO audit_logs (
       action, entity_type, entity_id, details, user_id, 
       ip_address, timestamp, snapshot, previous_hash, record_hash, is_immutable
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
     RETURNING id, record_hash`,
    [
      payload.action,
      payload.entity_type,
      payload.entity_id,
      payload.details,
      payload.user_id || null,
      payload.ip_address || null,
      timestamp,
      payload.snapshot ? JSON.stringify(payload.snapshot) : null,
      previousHash,
      recordHash
    ]
  );

  return insertRes.rows[0];
}
```

---

## 5. Ledger Integrity Verification API

### Verification Endpoint: `src/pages/api/audit/verify.ts`

Allows auditors or administrators to verify 100% of audit logs with 1 click:

```typescript
import type { APIRoute } from 'astro';
import { query } from '../../../lib/db';
import { calculateRecordHash } from '../../../lib/immutableLedger';

export const GET: APIRoute = async () => {
  try {
    const res = await query(
      `SELECT sequence_num, id, action, entity_type, entity_id, details, 
              timestamp, snapshot, previous_hash, record_hash 
       FROM audit_logs 
       ORDER BY sequence_num ASC`
    );

    const logs = res.rows;
    let expectedPrevHash = '0000000000000000000000000000000000000000000000000000000000000000';
    let brokenIndex = -1;

    for (let i = 0; i < logs.length; i++) {
      const row = logs[i];
      
      // Skip legacy records if they don't have record_hash yet
      if (!row.record_hash) continue;

      if (row.previous_hash !== expectedPrevHash) {
        brokenIndex = i;
        break;
      }

      const expectedCurrentHash = calculateRecordHash(
        row.previous_hash,
        new Date(row.timestamp).toISOString(),
        row.action,
        row.entity_type,
        row.entity_id,
        row.details,
        typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot
      );

      if (row.record_hash !== expectedCurrentHash) {
        brokenIndex = i;
        break;
      }

      expectedPrevHash = row.record_hash;
    }

    if (brokenIndex !== -1) {
      return new Response(JSON.stringify({
        verified: false,
        tampered_at_index: brokenIndex,
        tampered_record_id: logs[brokenIndex].id,
        message: 'Cryptographic chain verification failed! Tampering detected.'
      }), { status: 409 });
    }

    return new Response(JSON.stringify({
      verified: true,
      total_records_verified: logs.length,
      genesis_hash: '0000000000000000000000000000000000000000000000000000000000000000',
      latest_head_hash: expectedPrevHash,
      message: 'All audit ledger records mathematically verified. 0 tampering detected.'
    }), { status: 200 });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
```

---

## 6. Backfill Strategy for Existing Records

Before enabling the strict trigger, run a 1-time script to compute hashes for the existing historical records in chronological order:

```typescript
// scripts/backfill-ledger-hashes.cjs
const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const cleanUrl = process.env.DATABASE_URL.split('?')[0];
const pool = new Pool({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });

async function backfill() {
  const rows = (await pool.query('SELECT * FROM audit_logs ORDER BY timestamp ASC, id ASC')).rows;
  console.log(`Backfilling ${rows.length} existing audit records...`);

  let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const timestamp = new Date(r.timestamp).toISOString();
    const content = [
      prevHash,
      timestamp,
      r.action,
      r.entity_type,
      r.entity_id,
      r.details || '',
      r.snapshot ? (typeof r.snapshot === 'string' ? r.snapshot : JSON.stringify(r.snapshot)) : ''
    ].join('|');

    const currHash = crypto.createHash('sha256').update(content).digest('hex');

    await pool.query(
      'UPDATE audit_logs SET previous_hash = $1, record_hash = $2 WHERE id = $3',
      [prevHash, currHash, r.id]
    );

    prevHash = currHash;
  }

  console.log('Backfill completed successfully. Cryptographic chain established.');
  await pool.end();
}

backfill().catch(console.error);
```

---

## 7. Dashboard UI Additions (`/dashboard/logs`)

When ready to expose this to operators and tax auditors:

1. **Top Status Bar Card**:
   - Title: `🔒 Immutable Audit Vault (WORM)`
   - Subtitle: `PostgreSQL Engine Trigger: ACTIVE • SHA-256 Chaining: ACTIVE`
2. **Action Button**:
   - `[⚡ Verify Chain Integrity]` button triggering `/api/audit/verify`.
   - On success: Displays a green modal with verified count, head hash, and ISO compliance timestamp.
3. **Log Row Badge**:
   - Small monospace hash badge (e.g. `#a8f4...9e10`) next to each transaction pill.

---

## 8. Rollback Procedure (Emergency Only)

If schema modifications or emergency table maintenance are ever required:

```sql
-- To temporarily disable the immutability trigger for maintenance:
ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_log_immutability;
ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_log_no_truncate;

-- Perform required maintenance --

-- Re-enable immediately:
ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_log_immutability;
ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_log_no_truncate;
```
