/**
 * @penelope/secrets — type definitions
 */

/** Opaque reference to a stored secret (no value inline). */
export interface SecretRef {
  /** Tenant slug this secret belongs to. */
  tenantId: string;
  /** Logical key, e.g. "telegram.botToken", "fb.pageToken". */
  key: string;
  /** Human-readable label, optional. */
  label?: string;
}

/** What a particular store implementation can do. */
export interface StoreCapabilities {
  /** Store can persist secrets across reboots. */
  persistent: boolean;
  /** Secrets are encrypted at rest (DPAPI / Keychain / AES-256-GCM). */
  encryptedAtRest: boolean;
  /** Underlying backend identifier. */
  backend: 'dpapi' | 'keychain' | 'libsecret' | 'encrypted-file' | 'memory';
}

/** Common interface all store implementations must satisfy. */
export interface SecretStore {
  /** Returns the capabilities of this store. */
  capabilities(): StoreCapabilities;

  /**
   * Check whether this store is available on the current machine.
   * Must not throw — returns false if unavailable.
   */
  available(): Promise<boolean>;

  /** Persist a secret. */
  set(ref: SecretRef, value: string): Promise<void>;

  /** Retrieve a secret. Returns undefined if not found. */
  get(ref: SecretRef): Promise<string | undefined>;

  /** Delete a secret. Silently succeeds if not found. */
  delete(ref: SecretRef): Promise<void>;

  /** List all SecretRefs for a tenant. */
  list(tenantId: string): Promise<SecretRef[]>;
}

/** Normalise a SecretRef into a flat string key usable by backends. */
export function refToKey(ref: SecretRef): string {
  return `penelope:${ref.tenantId}:${ref.key}`;
}

/** Service name used in OS keychain entries. */
export const SERVICE_NAME = 'penelope';
