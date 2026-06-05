/**
 * @penelope/memory — core types
 */

export type MemoryScope = 'user' | 'session' | 'agent';

export interface MemoryEntry {
  /** Unique ID for this entry */
  id: string;
  scope: MemoryScope;
  /** Scope-specific identifier: PSID for user, thread-id for session, specialist-id for agent */
  scope_id: string;
  /** Logical key within the scope (e.g. "vehicle", "last_intent") */
  key: string;
  /** Serialized value — store JSON.stringify for structured data */
  value: string;
  /** Arbitrary labels for filtering / cross-referencing */
  tags: string[];
  /** Optional TTL in milliseconds from created_at. Absent = no expiry. */
  ttl_ms?: number;
  /** Unix epoch ms when the entry was last written */
  created_at: number;
}

export interface RememberOptions {
  tags?: string[];
  /** TTL in milliseconds. After this duration the entry is treated as expired. */
  ttl_ms?: number;
}