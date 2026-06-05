/**
 * CLI helper functions for penelope tenant secret management.
 *
 * These are called by the CLI's `tenant secret` sub-commands:
 *   penelope tenant secret set <tenant> <key> [--value <v>]
 *   penelope tenant secret get <tenant> <key>
 *   penelope tenant secret delete <tenant> <key>
 *   penelope tenant secret list <tenant>
 *   penelope tenant secret rotate <tenant> <key> [--value <v>]
 */

import { SecretRef, SecretStore } from './types.js';

// ── set ────────────────────────────────────────────────────────────────────────

export async function setSecret(
  store: SecretStore,
  tenantId: string,
  key: string,
  value: string
): Promise<void> {
  const ref: SecretRef = { tenantId, key };
  await store.set(ref, value);
}

// ── get ────────────────────────────────────────────────────────────────────────

export async function getSecret(
  store: SecretStore,
  tenantId: string,
  key: string
): Promise<string | undefined> {
  const ref: SecretRef = { tenantId, key };
  return store.get(ref);
}

// ── delete ─────────────────────────────────────────────────────────────────────

export async function deleteSecret(
  store: SecretStore,
  tenantId: string,
  key: string
): Promise<void> {
  const ref: SecretRef = { tenantId, key };
  await store.delete(ref);
}

// ── list ───────────────────────────────────────────────────────────────────────

export async function listSecrets(
  store: SecretStore,
  tenantId: string
): Promise<SecretRef[]> {
  return store.list(tenantId);
}

// ── rotate ─────────────────────────────────────────────────────────────────────

export interface RotateResult {
  previousExists: boolean;
  rotated: boolean;
}

/**
 * Atomically replace an existing secret value.
 * If the key does not exist, sets it and returns { previousExists: false, rotated: true }.
 */
export async function rotateSecret(
  store: SecretStore,
  tenantId: string,
  key: string,
  newValue: string
): Promise<RotateResult> {
  const ref: SecretRef = { tenantId, key };
  const existing = await store.get(ref);
  await store.set(ref, newValue);
  return {
    previousExists: existing !== undefined,
    rotated: true,
  };
}

// ── prompt helper ──────────────────────────────────────────────────────────────

/**
 * Prompt the user for a secret value interactively (masked input).
 * Falls back to an error if stdin is not a TTY.
 */
export async function promptSecretValue(message: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error('stdin is not a TTY — pass --value <secret> explicitly');
  }
  const { password } = await import('@inquirer/prompts');
  return password({ message, mask: '*' });
}
