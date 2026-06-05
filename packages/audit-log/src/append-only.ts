/**
 * Append-only audit log for per-tenant outbound messages.
 *
 * Each entry is written as one JSON line to:
 *   tenants/<id>/audit/<YYYY-MM-DD>.jsonl
 *
 * Tamper detection: each entry includes a sha256 over its own content fields
 * plus the hash of the previous entry in the file. This creates a hash chain
 * — modifying or deleting any entry breaks every subsequent hash.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

export interface AuditEntry {
  /** Monotonically increasing sequence number within the day file. */
  seq: number;
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Tenant slug. */
  tenant_id: string;
  /** Channel identifier (e.g. "telegram", "sms", "fb-messenger"). */
  channel: string;
  /** Recipient identifier — platform-specific (phone number, user id, etc). */
  recipient_id: string;
  /** The outbound message content. */
  content: string;
  /** Optional: message type (e.g. "draft", "auto-reply", "manual"). */
  message_type?: string;
  /** sha256 over (seq + timestamp + tenant_id + channel + recipient_id + content + prev_hash). */
  hash: string;
  /** Hash of the previous entry in this file. "GENESIS" for the first entry. */
  prev_hash: string;
}

export type AuditEntryInput = Omit<AuditEntry, "seq" | "hash" | "prev_hash" | "timestamp">;

/** Format a Date as YYYY-MM-DD in local time. */
function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Compute sha256 for an audit entry given its fields and the prev hash. */
export function computeEntryHash(
  seq: number,
  timestamp: string,
  tenant_id: string,
  channel: string,
  recipient_id: string,
  content: string,
  prev_hash: string
): string {
  const material = [seq, timestamp, tenant_id, channel, recipient_id, content, prev_hash].join(
    "\x00"
  );
  return crypto.createHash("sha256").update(material, "utf8").digest("hex");
}

export class AuditLog {
  private auditDir: string;

  constructor(tenantId: string, tenantsDir: string) {
    this.auditDir = path.join(tenantsDir, tenantId, "audit");
    fs.mkdirSync(this.auditDir, { recursive: true });
  }

  /** Day-file path for a given date. */
  private filePath(date: Date): string {
    return path.join(this.auditDir, `${toDateString(date)}.jsonl`);
  }

  /**
   * Read all existing entries from a day file.
   * Returns [] if the file does not exist yet.
   */
  private readEntries(filePath: string): AuditEntry[] {
    if (!fs.existsSync(filePath)) return [];
    const text = fs.readFileSync(filePath, "utf8");
    return text
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as AuditEntry);
  }

  /**
   * Append an outbound event to today's log file.
   * Returns the written AuditEntry (including computed hash).
   */
  append(input: AuditEntryInput): AuditEntry {
    const now = new Date();
    const filePath = this.filePath(now);
    const existing = this.readEntries(filePath);

    const seq = existing.length + 1;
    const timestamp = now.toISOString();
    const prev_hash = existing.length > 0
      ? (existing[existing.length - 1]?.hash ?? "GENESIS")
      : "GENESIS";

    const hash = computeEntryHash(
      seq,
      timestamp,
      input.tenant_id,
      input.channel,
      input.recipient_id,
      input.content,
      prev_hash
    );

    const entry: AuditEntry = {
      seq,
      timestamp,
      tenant_id: input.tenant_id,
      channel: input.channel,
      recipient_id: input.recipient_id,
      content: input.content,
      ...(input.message_type !== undefined ? { message_type: input.message_type } : {}),
      hash,
      prev_hash,
    };

    // Atomic-ish append: write one JSON line.
    fs.appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf8");
    return entry;
  }

  /** Read all entries for a given date (defaults to today). */
  entriesForDate(date: Date = new Date()): AuditEntry[] {
    return this.readEntries(this.filePath(date));
  }

  /** List all YYYY-MM-DD dates that have log files. */
  availableDates(): string[] {
    if (!fs.existsSync(this.auditDir)) return [];
    return fs
      .readdirSync(this.auditDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.replace(".jsonl", ""))
      .sort();
  }
}
