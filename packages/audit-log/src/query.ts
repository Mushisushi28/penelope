/**
 * Query helpers for compliance and operational review.
 *
 * Example usage:
 *   const log = new AuditLog("acme", "./tenants");
 *   const results = queryOutbound(log, { recipientId: "+14035551234" });
 */

import type { AuditLog, AuditEntry } from "./append-only.js";

export interface QueryOptions {
  /** Filter by recipient_id (exact match). */
  recipientId?: string;
  /** Filter by channel (e.g. "sms", "telegram"). */
  channel?: string;
  /** Filter by message_type. */
  messageType?: string;
  /** ISO date string lower bound (inclusive), e.g. "2026-01-01". */
  since?: string;
  /** ISO date string upper bound (inclusive), e.g. "2026-12-31". */
  until?: string;
  /** Limit the number of results returned. */
  limit?: number;
}

export interface QueryResult {
  entries: AuditEntry[];
  totalScanned: number;
  datesCovered: string[];
}

/**
 * Query audit log entries across date files.
 *
 * Scans all available date files (or the subset within [since, until])
 * and returns entries matching the filters.
 */
export function queryOutbound(log: AuditLog, opts: QueryOptions = {}): QueryResult {
  const available = log.availableDates();
  const datesCovered: string[] = [];

  // Filter to the requested date range
  const filteredDates = available.filter((d) => {
    if (opts.since && d < opts.since) return false;
    if (opts.until && d > opts.until) return false;
    return true;
  });

  const matched: AuditEntry[] = [];
  let totalScanned = 0;

  for (const date of filteredDates) {
    // Parse as local time to match how toDateString() writes the filename
    const [year, month, day] = date.split("-").map(Number);
    const dateObj = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
    const entries = log.entriesForDate(dateObj);
    totalScanned += entries.length;
    datesCovered.push(date);

    for (const entry of entries) {
      if (opts.recipientId !== undefined && entry.recipient_id !== opts.recipientId) continue;
      if (opts.channel !== undefined && entry.channel !== opts.channel) continue;
      if (opts.messageType !== undefined && entry.message_type !== opts.messageType) continue;
      matched.push(entry);
      if (opts.limit !== undefined && matched.length >= opts.limit) {
        return { entries: matched, totalScanned, datesCovered };
      }
    }
  }

  return { entries: matched, totalScanned, datesCovered };
}

/**
 * Summarise outbound volume per recipient for a given date range.
 * Useful for "how many messages did we send to customer X?"
 */
export function outboundSummaryByRecipient(
  log: AuditLog,
  opts: Pick<QueryOptions, "since" | "until" | "channel"> = {}
): Map<string, number> {
  const { entries } = queryOutbound(log, opts);
  const summary = new Map<string, number>();
  for (const e of entries) {
    summary.set(e.recipient_id, (summary.get(e.recipient_id) ?? 0) + 1);
  }
  return summary;
}

/**
 * Return all entries for a specific customer, newest-first.
 * Compliance helper: "show everything we sent to +14035551234 in 2026".
 */
export function auditTrailForCustomer(
  log: AuditLog,
  recipientId: string,
  opts: Pick<QueryOptions, "since" | "until"> = {}
): AuditEntry[] {
  const { entries } = queryOutbound(log, { ...opts, recipientId });
  return entries.slice().reverse();
}
