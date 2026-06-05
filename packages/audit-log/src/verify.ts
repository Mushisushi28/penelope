/**
 * Log integrity verification.
 *
 * Checks:
 *   1. No sequence gaps (seq must be 1, 2, 3, … N).
 *   2. Hash chain is unbroken — each entry's prev_hash equals the previous entry's hash.
 *   3. Each entry's hash can be recomputed from its content fields.
 */

import { computeEntryHash } from "./append-only.js";
import type { AuditEntry } from "./append-only.js";

export interface VerificationResult {
  ok: boolean;
  date: string;
  totalEntries: number;
  errors: VerificationError[];
}

export interface VerificationError {
  seq: number;
  kind: "hash_mismatch" | "chain_break" | "sequence_gap";
  detail: string;
}

export function verifyEntries(date: string, entries: AuditEntry[]): VerificationResult {
  const errors: VerificationError[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;

    // 1. Sequence check
    if (entry.seq !== i + 1) {
      errors.push({
        seq: entry.seq,
        kind: "sequence_gap",
        detail: `Expected seq ${i + 1}, got ${entry.seq}`,
      });
    }

    // 2. Chain check
    const expectedPrevHash = i === 0 ? "GENESIS" : (entries[i - 1]?.hash ?? "GENESIS");
    if (entry.prev_hash !== expectedPrevHash) {
      errors.push({
        seq: entry.seq,
        kind: "chain_break",
        detail: `prev_hash mismatch: expected ${expectedPrevHash.slice(0, 12)}…, got ${entry.prev_hash.slice(0, 12)}…`,
      });
    }

    // 3. Hash recomputation check
    const recomputed = computeEntryHash(
      entry.seq,
      entry.timestamp,
      entry.tenant_id,
      entry.channel,
      entry.recipient_id,
      entry.content,
      entry.prev_hash
    );
    if (recomputed !== entry.hash) {
      errors.push({
        seq: entry.seq,
        kind: "hash_mismatch",
        detail: `stored ${entry.hash.slice(0, 12)}…, recomputed ${recomputed.slice(0, 12)}…`,
      });
    }
  }

  return {
    ok: errors.length === 0,
    date,
    totalEntries: entries.length,
    errors,
  };
}
