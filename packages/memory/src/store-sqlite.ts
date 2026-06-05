/**
 * @penelope/memory — SQLite backend (node:sqlite, Node >= 22.5)
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error node:sqlite not yet in bundled @types/node
import { DatabaseSync } from 'node:sqlite';
import type { MemoryEntry, MemoryScope, RememberOptions } from './types.js';
import type { MemoryStore } from './store.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memory_entries (
  scope      TEXT    NOT NULL,
  scope_id   TEXT    NOT NULL,
  key        TEXT    NOT NULL,
  id         TEXT    NOT NULL,
  value      TEXT    NOT NULL,
  tags       TEXT    NOT NULL DEFAULT '[]',
  ttl_ms     INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (scope, scope_id, key)
);
CREATE INDEX IF NOT EXISTS idx_me_scope_scopeid ON memory_entries(scope, scope_id);
`;

function now(): number {
  return Date.now();
}

function isExpired(entry: { created_at: number; ttl_ms: number | null | undefined }): boolean {
  if (entry.ttl_ms == null) return false;
  return now() - entry.created_at > entry.ttl_ms;
}

interface RawRow {
  id: string;
  scope: string;
  scope_id: string;
  key: string;
  value: string;
  tags: string;
  ttl_ms: number | null;
  created_at: number;
}

function rowToEntry(row: RawRow): MemoryEntry {
  return {
    id: row.id,
    scope: row.scope as MemoryScope,
    scope_id: row.scope_id,
    key: row.key,
    value: row.value,
    tags: JSON.parse(row.tags) as string[],
    ttl_ms: row.ttl_ms != null ? row.ttl_ms : undefined,
    created_at: row.created_at,
  };
}

export interface SqliteStoreOptions {
  tenantsDir?: string;
  tenantId: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

export class SqliteMemoryStore implements MemoryStore {
  private db: DB;

  constructor(opts: SqliteStoreOptions) {
    const tenantsDir = opts.tenantsDir ?? join(process.cwd(), 'tenants');
    const stateDir = join(tenantsDir, opts.tenantId, 'state');
    mkdirSync(stateDir, { recursive: true });
    const dbPath = join(stateDir, 'memory.db');
    this.db = new DatabaseSync(dbPath) as DB;
    this.db.exec(SCHEMA);
  }

  async remember(
    scope: MemoryScope,
    scope_id: string,
    key: string,
    value: string,
    opts?: RememberOptions,
  ): Promise<MemoryEntry> {
    const entry: MemoryEntry = {
      id: randomUUID(),
      scope,
      scope_id,
      key,
      value,
      tags: opts?.tags ?? [],
      ttl_ms: opts?.ttl_ms,
      created_at: now(),
    };

    this.db
      .prepare(
        `INSERT INTO memory_entries (scope, scope_id, key, id, value, tags, ttl_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(scope, scope_id, key) DO UPDATE SET
           id         = excluded.id,
           value      = excluded.value,
           tags       = excluded.tags,
           ttl_ms     = excluded.ttl_ms,
           created_at = excluded.created_at`,
      )
      .run(
        scope,
        scope_id,
        key,
        entry.id,
        value,
        JSON.stringify(entry.tags),
        entry.ttl_ms ?? null,
        entry.created_at,
      );

    return entry;
  }

  async recall(
    scope: MemoryScope,
    scope_id: string,
    key?: string,
  ): Promise<MemoryEntry | undefined> {
    let row: RawRow | undefined;

    if (key !== undefined) {
      row = this.db
        .prepare(`SELECT * FROM memory_entries WHERE scope = ? AND scope_id = ? AND key = ?`)
        .get(scope, scope_id, key) as RawRow | undefined;
    } else {
      row = this.db
        .prepare(
          `SELECT * FROM memory_entries WHERE scope = ? AND scope_id = ?
           ORDER BY created_at DESC LIMIT 1`,
        )
        .get(scope, scope_id) as RawRow | undefined;
    }

    if (!row) return undefined;

    const entry = rowToEntry(row);
    if (isExpired({ created_at: entry.created_at, ttl_ms: entry.ttl_ms ?? null })) {
      this.db
        .prepare(`DELETE FROM memory_entries WHERE scope = ? AND scope_id = ? AND key = ?`)
        .run(scope, scope_id, entry.key);
      return undefined;
    }

    return entry;
  }

  async forget(scope: MemoryScope, scope_id: string, key: string): Promise<void> {
    this.db
      .prepare(`DELETE FROM memory_entries WHERE scope = ? AND scope_id = ? AND key = ?`)
      .run(scope, scope_id, key);
  }

  async search(
    scope: MemoryScope,
    scope_id: string,
    query: string,
    limit = 5,
  ): Promise<MemoryEntry[]> {
    const like = `%${query}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM memory_entries
         WHERE scope = ? AND scope_id = ?
           AND (value LIKE ? OR key LIKE ? OR tags LIKE ?)
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(scope, scope_id, like, like, like, limit * 3) as RawRow[];

    const results: MemoryEntry[] = [];
    for (const row of rows) {
      const entry = rowToEntry(row);
      if (!isExpired({ created_at: entry.created_at, ttl_ms: entry.ttl_ms ?? null })) {
        results.push(entry);
        if (results.length >= limit) break;
      } else {
        this.db
          .prepare(`DELETE FROM memory_entries WHERE scope = ? AND scope_id = ? AND key = ?`)
          .run(scope, scope_id, entry.key);
      }
    }

    return results;
  }

  async list(
    scope: MemoryScope,
    scope_id: string,
    tags?: string[],
  ): Promise<MemoryEntry[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM memory_entries WHERE scope = ? AND scope_id = ?
         ORDER BY created_at DESC`,
      )
      .all(scope, scope_id) as RawRow[];

    const results: MemoryEntry[] = [];
    for (const row of rows) {
      const entry = rowToEntry(row);
      if (isExpired({ created_at: entry.created_at, ttl_ms: entry.ttl_ms ?? null })) {
        this.db
          .prepare(`DELETE FROM memory_entries WHERE scope = ? AND scope_id = ? AND key = ?`)
          .run(scope, scope_id, entry.key);
        continue;
      }
      if (tags && tags.length > 0) {
        const entryTags = new Set(entry.tags);
        if (!tags.some((t) => entryTags.has(t))) continue;
      }
      results.push(entry);
    }

    return results;
  }

  close(): void {
    this.db.close();
  }
}
