/**
 * @penelope/memory — type definitions
 */

/** The three memory scopes available in Penelope. */
export type MemoryScope = 'user' | 'session' | 'agent';

/** A single memory entry stored in the memory layer. */
export interface MemoryEntry {
  /** Unique identifier (UUID v4). */
  id: string;
  /** Scope that owns this entry. */
  scope: MemoryScope;
  /**
   * Scope-specific identifier:
   * - user: psid / customer identifier
   * - session: conversation / thread id
   * - agent: specialist role name (e.g. "quote-builder")
   */
  scope_id: string;
  /** Logical key, e.g. "preferred_service", "vehicle", "seasonal_note". */
  key: string;
  /** Stored value — always a string; encode JSON for structured data. */
  value: string;
  /** Arbitrary tags for filtering (e.g. ["pricing", "vehicle"]). */
  tags: string[];
  /** Optional TTL in milliseconds. Undefined = no expiry. */
  ttl_ms?: number;
  /** Unix epoch ms when this entry was created. */
  created_at: number;
}

/** Options accepted by remember(). */
export interface RememberOptions {
  tags?: string[];
  ttl_ms?: number;
}
