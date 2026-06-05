/**
 * @penelope/telemetry — per-tenant usage meter
 *
 * Persists counters to tenants/<id>/state/telemetry.sqlite using better-sqlite3.
 * All operations are synchronous and local; nothing is sent anywhere by this module.
 */

import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

export interface MetricsSnapshot {
  tenant_id: string;
  period_start: number; // unix ms
  period_end: number; // unix ms
  messages_handled: number;
  drafts_pending: number;
  ai_tokens_used: number;
  channels_active: number;
  uptime_hours: number;
  captured_at: number; // unix ms
}

export interface CounterRow {
  name: string;
  value: number;
  updated_at: number;
}

export interface UptimeRow {
  started_at: number;
  stopped_at: number | null;
}

export class TenantMeter {
  private db: Database.Database;
  private tenantId: string;

  constructor(tenantId: string, stateDir: string) {
    this.tenantId = tenantId;
    fs.mkdirSync(stateDir, { recursive: true });
    const dbPath = path.join(stateDir, "telemetry.sqlite");
    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS counters (
        name TEXT PRIMARY KEY,
        value INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS counter_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        delta INTEGER NOT NULL,
        recorded_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS uptime_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at INTEGER NOT NULL,
        stopped_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_events_name_time
        ON counter_events(name, recorded_at);
    `);
  }

  /** Increment a counter by delta (default 1). */
  increment(counter: string, delta = 1): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO counters(name, value, updated_at)
         VALUES(?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           value = value + excluded.value,
           updated_at = excluded.updated_at`
      )
      .run(counter, delta, now);

    this.db
      .prepare(
        `INSERT INTO counter_events(name, delta, recorded_at) VALUES(?, ?, ?)`
      )
      .run(counter, delta, now);
  }

  /** Set a gauge-style counter to an absolute value. */
  set(counter: string, value: number): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO counters(name, value, updated_at)
         VALUES(?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`
      )
      .run(counter, value, now);
  }

  /** Get the current value of a counter. Returns 0 if not set. */
  get(counter: string): number {
    const row = this.db
      .prepare(`SELECT value FROM counters WHERE name = ?`)
      .get(counter) as { value: number } | undefined;
    return row?.value ?? 0;
  }

  /** Sum of counter events in [sinceMs, untilMs). */
  sumInWindow(counter: string, sinceMs: number, untilMs: number): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(delta), 0) as total
         FROM counter_events
         WHERE name = ? AND recorded_at >= ? AND recorded_at < ?`
      )
      .get(counter, sinceMs, untilMs) as { total: number };
    return row.total;
  }

  /** Record session start for uptime tracking. */
  startSession(): void {
    this.db
      .prepare(`INSERT INTO uptime_sessions(started_at) VALUES(?)`)
      .run(Date.now());
  }

  /** Record session end for uptime tracking. */
  stopSession(): void {
    this.db
      .prepare(
        `UPDATE uptime_sessions SET stopped_at = ? WHERE stopped_at IS NULL ORDER BY id DESC LIMIT 1`
      )
      .run(Date.now());
  }

  /** Compute total uptime hours in [sinceMs, untilMs). */
  uptimeHoursInWindow(sinceMs: number, untilMs: number): number {
    const rows = this.db
      .prepare(
        `SELECT started_at, stopped_at FROM uptime_sessions
         WHERE started_at < ? AND (stopped_at IS NULL OR stopped_at > ?)`
      )
      .all(untilMs, sinceMs) as UptimeRow[];

    let totalMs = 0;
    for (const row of rows) {
      const start = Math.max(row.started_at, sinceMs);
      const end = Math.min(row.stopped_at ?? Date.now(), untilMs);
      if (end > start) totalMs += end - start;
    }
    return totalMs / (1000 * 60 * 60);
  }

  /**
   * Snapshot current metrics for a time window.
   * @param sinceMs  window start (unix ms). Defaults to 24h ago.
   * @param untilMs  window end (unix ms). Defaults to now.
   */
  snapshot(sinceMs?: number, untilMs?: number): MetricsSnapshot {
    const now = Date.now();
    const since = sinceMs ?? now - 24 * 60 * 60 * 1000;
    const until = untilMs ?? now;

    return {
      tenant_id: this.tenantId,
      period_start: since,
      period_end: until,
      messages_handled: this.sumInWindow("messages_handled", since, until),
      drafts_pending: this.get("drafts_pending"),
      ai_tokens_used: this.sumInWindow("ai_tokens_used", since, until),
      channels_active: this.get("channels_active"),
      uptime_hours: this.uptimeHoursInWindow(since, until),
      captured_at: now,
    };
  }

  /** Stable install-id derived from tenant dir — not reversible to slug. */
  installIdHash(): string {
    return crypto
      .createHash("sha256")
      .update(this.tenantId + "penelope-install-salt-v1")
      .digest("hex")
      .slice(0, 16);
  }

  close(): void {
    this.db.close();
  }
}
