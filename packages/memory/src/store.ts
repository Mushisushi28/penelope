/**
 * @penelope/memory — MemoryStore interface
 */

import type { MemoryEntry, MemoryScope, RememberOptions } from './types.js';

export interface MemoryStore {
  /**
   * Write (or overwrite) a key-value pair for the given scope + scope_id.
   * Returns the entry as persisted.
   */
  remember(
    scope: MemoryScope,
    scope_id: string,
    key: string,
    value: string,
    opts?: RememberOptions,
  ): Promise<MemoryEntry>;

  /**
   * Retrieve a single entry by key, or the most recent entry when key is omitted.
   * Returns undefined if not found or if the entry is expired.
   */
  recall(scope: MemoryScope, scope_id: string, key?: string): Promise<MemoryEntry | undefined>;

  /**
   * Delete an entry by key.
   */
  forget(scope: MemoryScope, scope_id: string, key: string): Promise<void>;

  /**
   * LIKE-based full-text search across value, key, and tags columns.
   * Returns at most `limit` (default 5) non-expired entries.
   */
  search(
    scope: MemoryScope,
    scope_id: string,
    query: string,
    limit?: number,
  ): Promise<MemoryEntry[]>;

  /**
   * List all non-expired entries for a scope+scope_id, optionally filtered by tags.
   */
  list(scope: MemoryScope, scope_id: string, tags?: string[]): Promise<MemoryEntry[]>;

  /**
   * Release any underlying resources (database handles, connections).
   */
  close(): void;
}