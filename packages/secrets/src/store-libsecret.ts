/**
 * Linux libsecret secret store.
 *
 * Uses the `secret-tool` CLI:
 *   secret-tool store --label=<label> service penelope/<tenantId> account <key>
 *   secret-tool lookup service penelope/<tenantId> account <key>
 *   secret-tool clear service penelope/<tenantId> account <key>
 *   secret-tool search service penelope/<tenantId>
 */

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { SecretRef, SecretStore, StoreCapabilities } from './types.js';

const execFileAsync = promisify(execFile);

function serviceAttr(tenantId: string): string {
  return `penelope/${tenantId}`;
}

export class LibsecretStore implements SecretStore {
  capabilities(): StoreCapabilities {
    return {
      persistent: true,
      encryptedAtRest: true,
      backend: 'libsecret',
    };
  }

  async available(): Promise<boolean> {
    if (process.platform !== 'linux') return false;
    try {
      await execFileAsync('secret-tool', ['--version'], { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async set(ref: SecretRef, value: string): Promise<void> {
    // secret-tool store reads the value from stdin
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('secret-tool', [
        'store',
        `--label=penelope:${ref.tenantId}:${ref.key}`,
        'service', serviceAttr(ref.tenantId),
        'account', ref.key,
      ]);
      proc.stdin.write(value);
      proc.stdin.end();
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`secret-tool store exited ${code}`));
      });
      proc.on('error', reject);
    });
  }

  async get(ref: SecretRef): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync('secret-tool', [
        'lookup',
        'service', serviceAttr(ref.tenantId),
        'account', ref.key,
      ], { timeout: 5000 });
      const val = stdout.trim();
      return val === '' ? undefined : val;
    } catch {
      return undefined;
    }
  }

  async delete(ref: SecretRef): Promise<void> {
    try {
      await execFileAsync('secret-tool', [
        'clear',
        'service', serviceAttr(ref.tenantId),
        'account', ref.key,
      ], { timeout: 5000 });
    } catch {
      // Not found — ignore
    }
  }

  async list(tenantId: string): Promise<SecretRef[]> {
    try {
      const { stdout } = await execFileAsync('secret-tool', [
        'search',
        'service', serviceAttr(tenantId),
      ], { timeout: 10000 });

      const refs: SecretRef[] = [];
      // secret-tool search outputs blocks like:
      //   [/org/freedesktop/secrets/...]
      //   attribute.account = <key>
      const accountMatches = stdout.matchAll(/attribute\.account\s*=\s*(.+)/g);
      for (const m of accountMatches) {
        refs.push({ tenantId, key: m[1].trim() });
      }
      return refs;
    } catch {
      return [];
    }
  }
}
