import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EncryptedFileStore } from '../store-encrypted-file.js';

// Set master password so no TTY prompt fires
const TEST_PASSWORD = 'penelope-test-pw-123';

function makeTmpDir(): string {
  const dir = join(tmpdir(), `penelope-secrets-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('EncryptedFileStore — round-trip', () => {
  let dir: string;
  let store: EncryptedFileStore;

  beforeEach(() => {
    dir = makeTmpDir();
    store = new EncryptedFileStore(dir);
    process.env['PENELOPE_VAULT_PASSWORD'] = TEST_PASSWORD;
  });

  afterEach(() => {
    delete process.env['PENELOPE_VAULT_PASSWORD'];
    rmSync(dir, { recursive: true, force: true });
  });

  it('set and get returns the original value', async () => {
    const ref = { tenantId: 'sample-tenant', key: 'telegram.botToken' };
    await store.set(ref, 'bot123:AAAA');
    const result = await store.get(ref);
    expect(result).toBe('bot123:AAAA');
  });

  it('get on missing key returns undefined', async () => {
    const result = await store.get({ tenantId: 'sample-tenant', key: 'does.not.exist' });
    expect(result).toBeUndefined();
  });

  it('list returns all stored keys for a tenant', async () => {
    await store.set({ tenantId: 'sample-tenant', key: 'a' }, 'va');
    await store.set({ tenantId: 'sample-tenant', key: 'b' }, 'vb');
    await store.set({ tenantId: 'other', key: 'c' }, 'vc');

    const refs = await store.list('sample-tenant');
    const keys = refs.map((r) => r.key).sort();
    expect(keys).toEqual(['a', 'b']);
  });

  it('delete removes the key', async () => {
    const ref = { tenantId: 'sample-tenant', key: 'fb.pageToken' };
    await store.set(ref, 'token_abc');
    await store.delete(ref);
    const result = await store.get(ref);
    expect(result).toBeUndefined();
  });

  it('delete on non-existent key is silent', async () => {
    await expect(
      store.delete({ tenantId: 'sample-tenant', key: 'never.set' })
    ).resolves.not.toThrow();
  });

  it('overwrite replaces the value', async () => {
    const ref = { tenantId: 'sample-tenant', key: 'telegram.botToken' };
    await store.set(ref, 'first');
    await store.set(ref, 'second');
    const result = await store.get(ref);
    expect(result).toBe('second');
  });

  it('different tenants are isolated', async () => {
    await store.set({ tenantId: 'tenant-a', key: 'k' }, 'value-a');
    await store.set({ tenantId: 'tenant-b', key: 'k' }, 'value-b');

    expect(await store.get({ tenantId: 'tenant-a', key: 'k' })).toBe('value-a');
    expect(await store.get({ tenantId: 'tenant-b', key: 'k' })).toBe('value-b');
  });

  it('capabilities() reports correct backend', () => {
    const caps = store.capabilities();
    expect(caps.backend).toBe('encrypted-file');
    expect(caps.encryptedAtRest).toBe(true);
    expect(caps.persistent).toBe(true);
  });

  it('available() returns true', async () => {
    expect(await store.available()).toBe(true);
  });

  it('wrong password fails to decrypt', async () => {
    const ref = { tenantId: 'sample-tenant', key: 'secret' };
    await store.set(ref, 'my-secret');

    // Temporarily switch password
    process.env['PENELOPE_VAULT_PASSWORD'] = 'wrong-password';
    await expect(store.get(ref)).rejects.toThrow();
  });

  it('stores and retrieves special characters', async () => {
    const ref = { tenantId: 'sample-tenant', key: 'misc' };
    const special = 'p@ssw0rd!#$%^&*()=+[]{}|;:,.<>?/`~\'"\\';
    await store.set(ref, special);
    expect(await store.get(ref)).toBe(special);
  });
});
