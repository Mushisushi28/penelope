/**
 * @penelope/memory — MemoryStore interface
 */

import type { MemoryEntry, MemoryScope, RememberOptions } from './types.js';

export interface MemoryStore {
  remember(
    scope: MemoryScope,
    scope_id: string,
    key: string,
    value: string,
    opts?: RememberOptions,
  ): Promise<MemoryEntry>;

  recall(
    scope: MemoryScope,
    scope_id: string,
    key?: string,
  ): Promise<MemoryEntry | undefined>;

  forget(scope: MemoryScope, scope_id: string, key: string): Promise<void>;

  search(
    scope: MemoryScope,
    scope_id: string,
    query: string,
    limit?: number,
  ): Promise<MemoryEntry[]>;

  list(
    scope: MemoryScope,
    scope_id: string,
    tags?: string[],
  ): Promise<MemoryEntry[]>;
}
