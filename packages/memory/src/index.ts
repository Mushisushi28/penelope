/**
 * @penelope/memory — public API
 */

import { join } from 'node:path';
import { SqliteMemoryStore } from './store-sqlite.js';
import type { MemoryScope, RememberOptions } from './types.js';

export type { MemoryScope, MemoryEntry, RememberOptions } from './types.js';
export type { MemoryStore } from './store.js';
export { SqliteMemoryStore } from './store-sqlite.js';
export { Mem0MemoryStore } from './store-mem0.js';

export interface MemoryOptions {
  /** Directory under which per-tenant DB files are stored. Defaults to <cwd>/tenants */
  tenantsDir?: string;
  /** Tenant identifier (required) */
  tenantId?: string;
  /** Provide a custom MemoryStore implementation (e.g. Mem0MemoryStore) */
  store?: import('./store.js').MemoryStore;
}

/**
 * High-level facade. Instantiate once per tenant and reuse.
 *
 * @example
 * const mem = new Memory({ tenantId: 'acme' });
 * await mem.remember('user', psid, 'vehicle', 'Tesla Model 3');
 * const entry = await mem.recall('user', psid, 'vehicle');
 */
export class Memory {
  private store: import('./store.js').MemoryStore;

  constructor(opts: MemoryOptions = {}) {
    if (opts.store) {
      this.store = opts.store;
    } else {
      const tenantId = opts.tenantId ?? 'default';
      const tenantsDir = opts.tenantsDir ?? join(process.cwd(), 'tenants');
      this.store = new SqliteMemoryStore({ tenantsDir, tenantId });
    }
  }

  remember(scope: MemoryScope, scope_id: string, key: string, value: string, opts?: RememberOptions) {
    return this.store.remember(scope, scope_id, key, value, opts);
  }

  recall(scope: MemoryScope, scope_id: string, key?: string) {
    return this.store.recall(scope, scope_id, key);
  }

  forget(scope: MemoryScope, scope_id: string, key: string) {
    return this.store.forget(scope, scope_id, key);
  }

  search(scope: MemoryScope, scope_id: string, query: string, limit?: number) {
    return this.store.search(scope, scope_id, query, limit);
  }

  list(scope: MemoryScope, scope_id: string, tags?: string[]) {
    return this.store.list(scope, scope_id, tags);
  }

  close() {
    this.store.close();
  }
}