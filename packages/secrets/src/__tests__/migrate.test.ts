import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { migrateFromPlain } from '../migrate-from-plain.js';
import { EncryptedFileStore } from '../store-encrypted-file.js';

function makeTmpDir(): string {
  const dir = join(tmpdir(), `penelope-migrate-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function scaffoldPlainSecrets(
  tenantsDir: string,
  tenantId: string,
  secrets: Record<string, string>
) {
  const secretsDir = join(tenantsDir, tenantId, '.secrets');
  mkdirSync(secretsDir, { recursive: true });
  // Tenant config required by tenantsDir scan
  writeFileSync(join(tenantsDir, tenantId, 'tenant.json'), JSON.stringify({ name: tenantId }));
  for (const [key, value] of Object.entries(secrets)) {
    writeFileSync(join(secretsDir, `${key}.json`), JSON.stringify({ value }));
  }
}

describe('migrateFromPlain — dry-run', () => {
  let tmpDir: string;
  let store: EncryptedFileStore;
  let storeDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    storeDir = join(tmpDir, 'vault');
    store = new EncryptedFileStore(storeDir);
    process.env['PENELOPE_VAULT_PASSWORD'] = 'migrate-test-pw';
  });

  afterEach(() => {
    delete process.env['PENELOPE_VAULT_PASSWORD'];
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('dry-run: reports what would be migrated without touching files or store', async () => {
    const tenantsDir = join(tmpDir, 'tenants');
    scaffoldPlainSecrets(tenantsDir, 'dhr', {
      'telegram.botToken': 'bot123',
      'fb.pageToken': 'page456',
    });

    const result = await migrateFromPlain({
      tenantsDir,
      store,
      dryRun: true,
    });

    expect(result.migrated.length).toBe(2);
    expect(result.errors.length).toBe(0);

    // Plain files must still exist (dry-run does NOT delete)
    expect(existsSync(join(tenantsDir, 'dhr', '.secrets', 'telegram.botToken.json'))).toBe(true);

    // Nothing should be stored in the vault
    const vaultRefs = await store.list('dhr');
    expect(vaultRefs.length).toBe(0);
  });

  it('dry-run: returns empty result when tenantsDir is missing', async () => {
    const result = await migrateFromPlain({
      tenantsDir: join(tmpDir, 'does-not-exist'),
      store,
      dryRun: true,
    });
    expect(result.migrated).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('dry-run: skips tenant with no .secrets dir', async () => {
    const tenantsDir = join(tmpDir, 'tenants');
    mkdirSync(join(tenantsDir, 'no-secrets'), { recursive: true });
    writeFileSync(join(tenantsDir, 'no-secrets', 'tenant.json'), '{}');

    const result = await migrateFromPlain({ tenantsDir, store, dryRun: true });
    expect(result.migrated).toHaveLength(0);
  });

  it('live migration: writes to store and deletes plain files', async () => {
    const tenantsDir = join(tmpDir, 'tenants');
    scaffoldPlainSecrets(tenantsDir, 'acme', {
      'telegram.botToken': 'acme-bot',
    });

    const logs: string[] = [];
    const result = await migrateFromPlain({
      tenantsDir,
      store,
      dryRun: false,
      log: (_level, msg) => logs.push(msg),
    });

    expect(result.migrated.length).toBe(1);
    expect(result.errors.length).toBe(0);

    // Value is now in the vault
    const stored = await store.get({ tenantId: 'acme', key: 'telegram.botToken' });
    expect(stored).toBe('acme-bot');

    // Plain file removed
    expect(existsSync(join(tenantsDir, 'acme', '.secrets', 'telegram.botToken.json'))).toBe(false);
  });

  it('live migration: removes .secrets dir when emptied', async () => {
    const tenantsDir = join(tmpDir, 'tenants');
    scaffoldPlainSecrets(tenantsDir, 'acme2', { 'k': 'v' });

    await migrateFromPlain({ tenantsDir, store, dryRun: false });

    // .secrets dir should be gone
    expect(existsSync(join(tenantsDir, 'acme2', '.secrets'))).toBe(false);
  });

  it('handles multiple tenants independently', async () => {
    const tenantsDir = join(tmpDir, 'tenants');
    scaffoldPlainSecrets(tenantsDir, 'alpha', { 'key1': 'v1' });
    scaffoldPlainSecrets(tenantsDir, 'beta', { 'key2': 'v2' });

    const result = await migrateFromPlain({ tenantsDir, store, dryRun: false });
    expect(result.migrated.length).toBe(2);

    expect(await store.get({ tenantId: 'alpha', key: 'key1' })).toBe('v1');
    expect(await store.get({ tenantId: 'beta', key: 'key2' })).toBe('v2');
  });
});
