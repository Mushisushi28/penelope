# @penelope/audit-log

Append-only per-tenant audit log with sha256 hash-chain tamper detection.

Every customer-facing outbound message is recorded locally. No data is sent anywhere.

## Storage

Each day's entries are written to:

```
tenants/<id>/audit/<YYYY-MM-DD>.jsonl
```

One JSON object per line. Each entry includes:

```json
{
  "seq": 1,
  "timestamp": "2026-06-04T14:30:00.000Z",
  "tenant_id": "acme-auto",
  "channel": "sms",
  "recipient_id": "+14035550001",
  "content": "Your vehicle is ready!",
  "message_type": "manual",
  "hash": "sha256hex...",
  "prev_hash": "GENESIS"
}
```

## Tamper detection

Each entry's `hash` is `sha256(seq + timestamp + tenant_id + channel + recipient_id + content + prev_hash)`.

This creates a hash chain: modifying or deleting any entry breaks every subsequent hash.
Run `verifyEntries()` to check integrity.

```ts
import { AuditLog } from "@penelope/audit-log";
import { verifyEntries } from "@penelope/audit-log";

const log = new AuditLog("acme-auto", "./tenants");
const entries = log.entriesForDate(new Date());
const result = verifyEntries("2026-06-04", entries);
console.log(result.ok); // true if unmodified
```

## Usage

```ts
import { AuditLog, queryOutbound, auditTrailForCustomer } from "@penelope/audit-log";

const log = new AuditLog("acme-auto", "./tenants");

// Log an outbound message
log.append({
  tenant_id: "acme-auto",
  channel: "sms",
  recipient_id: "+14035550001",
  content: "Your headlights are restored!",
  message_type: "auto-reply",
});

// Compliance query: everything sent to a customer
const trail = auditTrailForCustomer(log, "+14035550001", {
  since: "2026-01-01",
  until: "2026-12-31",
});

// Query with filters
const { entries } = queryOutbound(log, {
  channel: "sms",
  since: "2026-06-01",
  limit: 100,
});
```

## Architecture

- `src/append-only.ts` — AuditLog class, hash computation, JSONL writer
- `src/verify.ts` — integrity verification (sequence, chain, hash recomputation)
- `src/query.ts` — compliance query helpers
