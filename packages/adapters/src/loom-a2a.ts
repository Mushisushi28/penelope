/**
 * LoomA2aAdapter — internal agent-to-agent adapter.
 *
 * Bridges Penelope's ChannelAdapter interface to the Loom A2A bus
 * (C:/Users/isaac/loom/state/bus.sqlite). Used so Penelope procedures can
 * talk to each other and to Jarvis/Operator via the bus.
 *
 * Protocol:
 *   Inbound: Read messages addressed to the configured agent from the bus DB.
 *   Outbound: Write messages to the bus DB.
 *
 * The bus DB schema has a `messages` table with at minimum:
 *   id, from, to, body, type, created_at, acked_at, processed_at
 *
 * This adapter operates in poll mode (SQLite doesn't support push).
 * It uses the `better-sqlite3` package for synchronous DB access.
 *
 * This adapter is intentionally thin — it does not replicate the full loom-a2a
 * bus protocol. For complex bus interactions (spawn orchestrator, cron, etc.)
 * use the loom-a2a MCP tools from the Jarvis session.
 */

import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
} from './types.js';
import { AdapterConfigError } from './types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface LoomA2aAdapterOptions {
  tenant_id: string;
  /** Agent name that Penelope is presenting as on the bus. */
  agent_id: string;
  /** Path to the loom bus SQLite DB. Default: process.env.LOOM_BUS_DB */
  bus_db_path?: string;
  /** Poll interval in ms. Default 5 000. */
  pollIntervalMs?: number;
  logger?: { info: (msg: string) => void; error: (msg: string) => void };
  /** Test seam: skip the poll loop. */
  manualPolling?: boolean;
}

// ---------------------------------------------------------------------------
// Bus message shape (what we read from the DB)
// ---------------------------------------------------------------------------

interface BusMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  type: string;
  created_at: string;
  acked_at: string | null;
  processed_at: string | null;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_BUS_DB = 'C:/Users/isaac/loom/state/bus.sqlite';

export class LoomA2aAdapter implements ChannelAdapter {
  readonly name = 'loom-a2a';

  private readonly tenantId: string;
  private readonly agentId: string;
  private readonly busDbPath: string;
  private readonly pollIntervalMs: number;
  private readonly log: NonNullable<LoomA2aAdapterOptions['logger']>;
  private readonly manualPolling: boolean;

  private onInbound: ((msg: InboundMessage) => Promise<void>) | null = null;
  private polling = false;
  private stopRequested = false;
  private loopPromise: Promise<void> | null = null;
  private sleepResolver: (() => void) | null = null;

  // better-sqlite3 Database instance
  private db: unknown = null;

  constructor(opts: LoomA2aAdapterOptions) {
    if (!opts.tenant_id?.trim()) throw new AdapterConfigError('loom-a2a', 'tenant_id is required');
    if (!opts.agent_id?.trim()) throw new AdapterConfigError('loom-a2a', 'agent_id is required');

    this.tenantId = opts.tenant_id;
    this.agentId = opts.agent_id;
    this.busDbPath =
      opts.bus_db_path ??
      process.env['LOOM_BUS_DB'] ??
      DEFAULT_BUS_DB;
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.manualPolling = opts.manualPolling ?? false;
    this.log = opts.logger ?? {
      info: (m) => console.info(`[loom-a2a:${this.tenantId}] ${m}`),
      error: (m) => console.error(`[loom-a2a:${this.tenantId}] ${m}`),
    };
  }

  async start(onInbound: (msg: InboundMessage) => Promise<void>): Promise<void> {
    if (this.polling) return;
    this.onInbound = onInbound;
    await this.openDb();
    this.polling = true;
    this.stopRequested = false;
    if (!this.manualPolling) {
      this.loopPromise = this.runLoop();
    }
  }

  async stop(): Promise<void> {
    if (!this.polling) return;
    this.stopRequested = true;
    try { this.sleepResolver?.(); } catch { /* ignore */ }
    if (this.loopPromise) {
      try { await this.loopPromise; } catch { /* swallow */ }
      this.loopPromise = null;
    }
    try {
      if (this.db && typeof (this.db as { close?: () => void }).close === 'function') {
        (this.db as { close: () => void }).close();
      }
    } catch { /* ignore */ }
    this.db = null;
    this.polling = false;
    this.onInbound = null;
  }

  async send(out: OutboundMessage): Promise<{ external_id: string }> {
    if (!this.db) await this.openDb();

    const id = `${this.agentId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    // Insert into bus messages table
    const db = this.db as {
      prepare: (sql: string) => { run: (...args: unknown[]) => void };
    };
    db.prepare(
      `INSERT INTO messages (id, "from", "to", body, type, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, this.agentId, out.external_thread_id, out.text, 'a2a', now);

    return { external_id: id };
  }

  // -------------------------------------------------------------------------
  // Test / advanced surface
  // -------------------------------------------------------------------------

  async pollOnce(): Promise<number> {
    if (!this.onInbound) throw new Error('pollOnce: call start() first');
    if (!this.db) await this.openDb();

    const db = this.db as {
      prepare: (sql: string) => {
        all: (...args: unknown[]) => BusMessage[];
        run: (...args: unknown[]) => void;
      };
    };

    // Fetch un-acked messages addressed to this agent
    const rows: BusMessage[] = db
      .prepare(
        `SELECT * FROM messages
         WHERE "to" = ? AND acked_at IS NULL
         ORDER BY created_at ASC
         LIMIT 50`
      )
      .all(this.agentId);

    let delivered = 0;
    for (const row of rows) {
      const inbound: InboundMessage = {
        id: row.id,
        channel: 'loom-a2a',
        tenant_id: this.tenantId,
        external_thread_id: row.from,
        external_user_id: row.from,
        text: row.body,
        received_at: row.created_at,
        raw: row,
      };
      try {
        await this.onInbound(inbound);
        // Ack the message
        db.prepare(`UPDATE messages SET acked_at = ? WHERE id = ?`)
          .run(new Date().toISOString(), row.id);
        delivered++;
      } catch (err) {
        this.log.error(`onInbound error for msg ${row.id}: ${(err as Error).message}`);
      }
    }
    return delivered;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async openDb(): Promise<void> {
    // Prefer Node 24 built-in node:sqlite; fall back to better-sqlite3.
    // Both expose a synchronous interface with the same .prepare().all() / .run() shape.
    try {
      // node:sqlite (Node >= 22.5 experimental, Node 24 stable)
      const { DatabaseSync } = await import('node:sqlite' as never);
      this.db = new (DatabaseSync as new (path: string) => unknown)(this.busDbPath);
      this.log.info(`bus DB opened via node:sqlite: ${this.busDbPath}`);
    } catch {
      // Fall back to better-sqlite3 (requires native build)
      try {
        const { default: Database } = await import('better-sqlite3');
        this.db = new Database(this.busDbPath, { readonly: false });
        this.log.info(`bus DB opened via better-sqlite3: ${this.busDbPath}`);
      } catch (err2) {
        throw new Error(
          `loom-a2a: cannot open SQLite DB at ${this.busDbPath}. ` +
          `Install better-sqlite3 or use Node >= 24 (node:sqlite). ` +
          `Underlying error: ${(err2 as Error).message}`
        );
      }
    }
  }

  private async runLoop(): Promise<void> {
    while (!this.stopRequested) {
      try {
        await this.pollOnce();
      } catch (err) {
        if (!this.stopRequested) {
          this.log.error(`poll failed: ${(err as Error).message}`);
        }
      }
      if (this.stopRequested) break;
      await this.sleep(this.pollIntervalMs);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      const t = setTimeout(() => resolve(), ms);
      this.sleepResolver = () => { clearTimeout(t); resolve(); };
    });
  }
}
