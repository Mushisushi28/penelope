/**
 * @penelope/memory — mem0ai backend (optional)
 *
 * Install mem0ai as a peer dependency and set MEM0_API_KEY to enable.
 * All methods are no-ops until that wiring is complete; swap in for
 * SqliteMemoryStore when cross-tenant cloud search is needed.
 */

import { randomUUID } from 'node:crypto';
import type { MemoryEntry, MemoryScope, RememberOptions } from './types.js';
import type { MemoryStore } from './store.js';

export class Mem0MemoryStore implements MemoryStore {
  /** Returns true when mem0ai peer dep is installed and MEM0_API_KEY is set. */
  static available(): boolean {
    try {
      require.resolve('mem0ai');
      return Boolean(process.env.MEM0_API_KEY);
    } catch {
      return false;
    }
  }

  async remember(
    scope: MemoryScope,
    scope_id: string,
    key: string,
    value: string,
    opts?: RememberOptions,
  ): Promise<MemoryEntry> {
    // TODO: forward to mem0ai Memory.add() once wired
    return {
      id: randomUUID(),
      scope,
      scope_id,
      key,
      value,
      tags: opts?.tags ?? [],
      ttl_ms: opts?.ttl_ms,
      created_at: Date.now(),
    };
  }

  async recall(_scope: MemoryScope, _scope_id: string, _key?: string): Promise<MemoryEntry | undefined> {
    return undefined;
  }

  async forget(_scope: MemoryScope, _scope_id: string, _key: string): Promise<void> {}

  async search(
    _scope: MemoryScope,
    _scope_id: string,
    _query: string,
    _limit = 5,
  ): Promise<MemoryEntry[]> {
    return [];
  }

  async list(_scope: MemoryScope, _scope_id: string, _tags?: string[]): Promise<MemoryEntry[]> {
    return [];
  }

  close(): void {}
}