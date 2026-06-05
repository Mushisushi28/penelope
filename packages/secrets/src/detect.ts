/**
 * Auto-detect the best available SecretStore for the current platform.
 *
 * Priority:
 *   1. DpapiStore   — Windows (always available on win32)
 *   2. KeychainStore — macOS
 *   3. LibsecretStore — Linux with secret-tool installed
 *   4. EncryptedFileStore — universal fallback
 *
 * Never throws — returns the fallback store if all OS-native checks fail.
 */

import { SecretStore } from './types.js';
import { DpapiStore } from './store-dpapi.js';
import { KeychainStore } from './store-keychain.js';
import { LibsecretStore } from './store-libsecret.js';
import { EncryptedFileStore } from './store-encrypted-file.js';

export type { SecretStore };

/**
 * Returns the most capable store available on this machine.
 * Performs availability checks in order and returns the first match.
 */
export async function detectStore(): Promise<SecretStore> {
  const candidates: SecretStore[] = [
    new DpapiStore(),
    new KeychainStore(),
    new LibsecretStore(),
  ];

  for (const store of candidates) {
    try {
      if (await store.available()) {
        return store;
      }
    } catch {
      // continue to next
    }
  }

  return new EncryptedFileStore();
}

/**
 * Synchronous convenience: return a store without awaiting availability checks.
 * Useful when the caller knows the platform (e.g. tests, CLI with --store flag).
 */
export function storeForPlatform(
  platform: NodeJS.Platform = process.platform
): SecretStore {
  if (platform === 'win32') return new DpapiStore();
  if (platform === 'darwin') return new KeychainStore();
  if (platform === 'linux') return new LibsecretStore();
  return new EncryptedFileStore();
}
