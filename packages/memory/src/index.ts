/**
 * @penelope/memory — public API
 */

export type { MemoryScope, MemoryEntry, RememberOptions } from './types.js';
export type { MemoryStore } from './store.js';
export { SqliteMemoryStore } from './store-sqlite.js';
export { Mem0MemoryStore } from './store-mem0.js';

import type { MemoryScope, MemoryEntry, RememberOptions } from './types.js';
import type { MemoryStore } from './store.js';
import { SqliteMemoryStore } from './store-sqlite.js';

export interface MemoryOptions {
  store?: MemoryStore;
  tenantId?: string;
  tenantsDir?: string;
}

/**
 * High-level memory facade. Construct once per specialist.
 *
 * Before drafting any reply, call `memory.recall('user', psid)` to get
 * customer history. After detecting new facts, call `memory.remember(...)`.
 */
export class Memory {
  private readonly store: MemoryStore;

  constructor(opts: MemoryOptions = {}) {
    if (opts.store) {
      this.store = opts.store;
    } else {
      this.store = new SqliteMemoryStore({
        tenantId: opts.tenantId ?? 'default',
        tenantsDir: opts.tenantsDir,
      });
    }
  }

  recall(scope: MemoryScope, scope_id: string, key?: string): Promise<MemoryEntry | undefined> {
    return this.store.recall(scope, scope_id, key);
  }

  remember(
    scope: MemoryScope,
    scope_id: string,
    key: string,
    value: string,
    opts?: RememberOptions,
  ): Promise<MemoryEntry> {
    return this.store.remember(scope, scope_id, key, value, opts);
  }

  forget(scope: MemoryScope, scope_id: string, key: string): Promise<void> {
    return this.store.forget(scope, scope_id, key);
  }

  search(
    scope: MemoryScope,
    scope_id: string,
    query: string,
    limit?: number,
  ): Promise<MemoryEntry[]> {
    return this.store.search(scope, scope_id, query, limit);
  }

  list(scope: MemoryScope, scope_id: string, tags?: string[]): Promise<MemoryEntry[]> {
    return this.store.list(scope, scope_id, tags);
  }
}
