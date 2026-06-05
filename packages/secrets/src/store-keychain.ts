/**
 * macOS Keychain secret store.
 *
 * Uses the `security` CLI:
 *   security add-generic-password -a <account> -s <service> -w <password>
 *   security find-generic-password -a <account> -s <service> -w
 *   security delete-generic-password -a <account> -s <service>
 *
 * Account = ref.key, Service = "penelope/<tenantId>"
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SecretRef, SecretStore, StoreCapabilities } from './types.js';

const execFileAsync = promisify(execFile);

function serviceForTenant(tenantId: string): string {
  return `penelope/${tenantId}`;
}

export class KeychainStore implements SecretStore {
  capabilities(): StoreCapabilities {
    return {
      persistent: true,
      encryptedAtRest: true,
      backend: 'keychain',
    };
  }

  async available(): Promise<boolean> {
    if (process.platform !== 'darwin') return false;
    try {
      await execFileAsync('security', ['list-keychains'], { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async set(ref: SecretRef, value: string): Promise<void> {
    const service = serviceForTenant(ref.tenantId);
    // Delete first to avoid "duplicate item" error
    try {
      await execFileAsync('security', [
        'delete-generic-password',
        '-a', ref.key,
        '-s', service,
      ]);
    } catch {
      // Fine if it didn't exist
    }
    await execFileAsync('security', [
      'add-generic-password',
      '-a', ref.key,
      '-s', service,
      '-w', value,
    ]);
  }

  async get(ref: SecretRef): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync('security', [
        'find-generic-password',
        '-a', ref.key,
        '-s', serviceForTenant(ref.tenantId),
        '-w',
      ], { timeout: 5000 });
      const val = stdout.trim();
      return val === '' ? undefined : val;
    } catch {
      return undefined;
    }
  }

  async delete(ref: SecretRef): Promise<void> {
    try {
      await execFileAsync('security', [
        'delete-generic-password',
        '-a', ref.key,
        '-s', serviceForTenant(ref.tenantId),
      ]);
    } catch {
      // Not found — ignore
    }
  }

  async list(tenantId: string): Promise<SecretRef[]> {
    try {
      const service = serviceForTenant(tenantId);
      const { stdout } = await execFileAsync('security', [
        'dump-keychain',
      ], { timeout: 10000 });

      const refs: SecretRef[] = [];
      // Parse dump output: look for blocks with our service
      const blocks = stdout.split(/(?=keychain:)/);
      let currentAccount: string | undefined;
      let currentService: string | undefined;

      for (const block of blocks) {
        const svcMatch = block.match(/"svce"<blob>="([^"]+)"/);
        const accMatch = block.match(/"acct"<blob>="([^"]+)"/);
        if (svcMatch) currentService = svcMatch[1];
        if (accMatch) currentAccount = accMatch[1];
        if (currentService === service && currentAccount) {
          refs.push({ tenantId, key: currentAccount });
          currentAccount = undefined;
          currentService = undefined;
        }
      }
      return refs;
    } catch {
      return [];
    }
  }
}
