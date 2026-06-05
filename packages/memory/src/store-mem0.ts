/**
 * @penelope/memory — mem0 SDK backend (optional)
 *
 * No-ops when MEM0_API_KEY is absent. Tests pass without credentials.
 */

import type { MemoryEntry, MemoryScope, RememberOptions } from './types.js';
import type { MemoryStore } from './store.js';
import { randomUUID } from 'node:crypto';

export interface Mem0StoreOptions {
  tenantId: string;
  apiKey?: string;
}

type Mem0Client = {
  add(messages: string, opts: { user_id: string; metadata?: Record<string, string> }): Promise<unknown>;
  search(query: string, opts: { user_id: string; limit?: number }): Promise<Array<{ id: string; memory: string; score?: number }>>;
  delete(memoryId: string): Promise<void>;
  getAll(opts: { user_id: string }): Promise<Array<{ id: string; memory: string; metadata?: Record<string, string>; created_at?: string }>>;
};

async function loadClient(apiKey: string): Promise<Mem0Client> {
  const mod = await import('mem0ai');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Mem0: any = (mod as any).default ?? (mod as any).MemoryClient ?? (mod as any).Memory;
  if (!Mem0) throw new Error('@penelope/memory: could not locate Mem0 class in mem0ai module');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
  return new Mem0({ api_key: apiKey }) as Mem0Client;
}

function mem0UserId(tenantId: string, scope: MemoryScope, scope_id: string): string {
  return `${tenantId}:${scope}:${scope_id}`;
}

function rowToEntry(
  raw: { id: string; memory: string; metadata?: Record<string, string>; created_at?: string },
  scope: MemoryScope,
  scope_id: string,
): MemoryEntry {
  const meta = raw.metadata ?? {};
  return {
    id: raw.id,
    scope,
    scope_id,
    key: meta['key'] ?? raw.id,
    value: raw.memory,
    tags: meta['tags'] ? JSON.parse(meta['tags']) as string[] : [],
    ttl_ms: meta['ttl_ms'] ? Number(meta['ttl_ms']) : undefined,
    created_at: raw.created_at ? new Date(raw.created_at).getTime() : Date.now(),
  };
}

export class Mem0MemoryStore implements MemoryStore {
  private readonly tenantId: string;
  private readonly apiKey: string | undefined;
  private _client: Mem0Client | null = null;

  constructor(opts: Mem0StoreOptions) {
    this.tenantId = opts.tenantId;
    this.apiKey = opts.apiKey ?? process.env['MEM0_API_KEY'];
  }

  async available(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      await this._getClient();
      return true;
    } catch {
      return false;
    }
  }

  private async _getClient(): Promise<Mem0Client> {
    if (this._client) return this._client;
    if (!this.apiKey) throw new Error('@penelope/memory: MEM0_API_KEY is not set');
    this._client = await loadClient(this.apiKey);
    return this._client;
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
      created_at: Date.now(),
    };

    if (!this.apiKey) return entry;

    const client = await this._getClient();
    const userId = mem0UserId(this.tenantId, scope, scope_id);
    await client.add(`key=${key}: ${value}`, {
      user_id: userId,
      metadata: {
        key,
        tags: JSON.stringify(entry.tags),
        ...(entry.ttl_ms !== undefined ? { ttl_ms: String(entry.ttl_ms) } : {}),
      },
    });

    return entry;
  }

  async recall(scope: MemoryScope, scope_id: string, key?: string): Promise<MemoryEntry | undefined> {
    if (!this.apiKey) return undefined;
    const client = await this._getClient();
    const userId = mem0UserId(this.tenantId, scope, scope_id);

    if (key) {
      const results = await client.search(`key=${key}`, { user_id: userId, limit: 1 });
      const first = results[0];
      if (!first) return undefined;
      return rowToEntry(first, scope, scope_id);
    }

    const all = await client.getAll({ user_id: userId });
    const first = all[0];
    if (!first) return undefined;
    return rowToEntry(first, scope, scope_id);
  }

  async forget(scope: MemoryScope, scope_id: string, key: string): Promise<void> {
    if (!this.apiKey) return;
    const client = await this._getClient();
    const userId = mem0UserId(this.tenantId, scope, scope_id);
    const results = await client.search(`key=${key}`, { user_id: userId, limit: 5 });
    await Promise.all(results.map((r) => client.delete(r.id)));
  }

  async search(scope: MemoryScope, scope_id: string, query: string, limit = 5): Promise<MemoryEntry[]> {
    if (!this.apiKey) return [];
    const client = await this._getClient();
    const userId = mem0UserId(this.tenantId, scope, scope_id);
    const results = await client.search(query, { user_id: userId, limit });
    return results.map((r) => rowToEntry(r, scope, scope_id));
  }

  async list(scope: MemoryScope, scope_id: string, tags?: string[]): Promise<MemoryEntry[]> {
    if (!this.apiKey) return [];
    const client = await this._getClient();
    const userId = mem0UserId(this.tenantId, scope, scope_id);
    const all = await client.getAll({ user_id: userId });
    const entries = all.map((r) => rowToEntry(r, scope, scope_id));
    if (!tags || tags.length === 0) return entries;
    return entries.filter((e) => tags.some((t) => e.tags.includes(t)));
  }
}
