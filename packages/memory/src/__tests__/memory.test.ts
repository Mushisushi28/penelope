import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMemoryStore } from '../store-sqlite.js';

function makeTmpStore() {
  const dir = mkdtempSync(join(tmpdir(), 'penelope-memory-test-'));
  const store = new SqliteMemoryStore({ tenantsDir: dir, tenantId: 'test' });
  return { store, dir };
}

describe('SqliteMemoryStore — user scope', () => {
  let store;
  let tmpDir;

  beforeEach(() => {
    const t = makeTmpStore();
    store = t.store;
    tmpDir = t.dir;
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores and recalls a value', async () => {
    await store.remember('user', 'u1', 'color', 'blue');
    const entry = await store.recall('user', 'u1', 'color');
    expect(entry).toBeDefined();
    expect(entry.value).toBe('blue');
  });

  it('upserts an existing key', async () => {
    await store.remember('user', 'u1', 'color', 'blue');
    await store.remember('user', 'u1', 'color', 'red');
    const entry = await store.recall('user', 'u1', 'color');
    expect(entry.value).toBe('red');
  });

  it('forgets a key', async () => {
    await store.remember('user', 'u1', 'color', 'blue');
    await store.forget('user', 'u1', 'color');
    const entry = await store.recall('user', 'u1', 'color');
    expect(entry).toBeUndefined();
  });

  it('returns undefined for unknown key', async () => {
    const entry = await store.recall('user', 'u1', 'nonexistent');
    expect(entry).toBeUndefined();
  });

  it('stores tags and retrieves them', async () => {
    await store.remember('user', 'u1', 'pref', 'dark-mode', { tags: ['ui', 'display'] });
    const entry = await store.recall('user', 'u1', 'pref');
    expect(entry.tags).toContain('ui');
    expect(entry.tags).toContain('display');
  });
});

describe('SqliteMemoryStore — scope isolation', () => {
  let store;
  let tmpDir;

  beforeEach(() => {
    const t = makeTmpStore();
    store = t.store;
    tmpDir = t.dir;
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('user and session scopes are isolated', async () => {
    await store.remember('user', 'u1', 'x', 'user-value');
    await store.remember('session', 'u1', 'x', 'session-value');
    const userEntry = await store.recall('user', 'u1', 'x');
    const sessionEntry = await store.recall('session', 'u1', 'x');
    expect(userEntry.value).toBe('user-value');
    expect(sessionEntry.value).toBe('session-value');
  });

  it('different scope_ids are isolated within same scope', async () => {
    await store.remember('user', 'u1', 'x', 'v1');
    await store.remember('user', 'u2', 'x', 'v2');
    const e1 = await store.recall('user', 'u1', 'x');
    const e2 = await store.recall('user', 'u2', 'x');
    expect(e1.value).toBe('v1');
    expect(e2.value).toBe('v2');
  });

  it('agent scope is independent from user scope', async () => {
    await store.remember('agent', 'specialist-1', 'state', 'working');
    const agentEntry = await store.recall('agent', 'specialist-1', 'state');
    const userEntry = await store.recall('user', 'specialist-1', 'state');
    expect(agentEntry.value).toBe('working');
    expect(userEntry).toBeUndefined();
  });
});

describe('SqliteMemoryStore — TTL', () => {
  let store;
  let tmpDir;

  beforeEach(() => {
    const t = makeTmpStore();
    store = t.store;
    tmpDir = t.dir;
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns entry before TTL expires', async () => {
    await store.remember('session', 's1', 'tmp', 'hello', { ttl_ms: 60000 });
    const entry = await store.recall('session', 's1', 'tmp');
    expect(entry).toBeDefined();
    expect(entry.value).toBe('hello');
  });

  it('expires entry after TTL', async () => {
    await store.remember('session', 's1', 'tmp', 'hello', { ttl_ms: 1 });
    await new Promise(r => setTimeout(r, 10));
    const entry = await store.recall('session', 's1', 'tmp');
    expect(entry).toBeUndefined();
  });

  it('no TTL means entry persists', async () => {
    await store.remember('user', 'u1', 'perm', 'stays');
    const entry = await store.recall('user', 'u1', 'perm');
    expect(entry).toBeDefined();
  });
});

describe('SqliteMemoryStore — search', () => {
  let store;
  let tmpDir;

  beforeEach(async () => {
    const t = makeTmpStore();
    store = t.store;
    tmpDir = t.dir;
    // Seed some entries
    await store.remember('user', 'u1', 'city', 'Calgary');
    await store.remember('user', 'u1', 'hobby', 'photography');
    await store.remember('user', 'u1', 'sport', 'hockey');
    await store.remember('user', 'u1', 'food', 'pizza');
    await store.remember('user', 'u1', 'vehicle', 'Tesla Model 3');
    await store.remember('user', 'u1', 'note1', 'car needs wash');
    await store.remember('user', 'u1', 'note2', 'car needs oil change');
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('finds entries matching value', async () => {
    const results = await store.search('user', 'u1', 'Calgary');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].value).toBe('Calgary');
  });

  it('finds entries matching key', async () => {
    const results = await store.search('user', 'u1', 'hobby');
    expect(results.some(e => e.key === 'hobby')).toBe(true);
  });

  it('returns at most 5 results by default', async () => {
    const results = await store.search('user', 'u1', 'car');
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('returns empty array for no matches', async () => {
    const results = await store.search('user', 'u1', 'xyzzy-not-found');
    expect(results).toHaveLength(0);
  });
});

describe('SqliteMemoryStore — list', () => {
  let store;
  let tmpDir;

  beforeEach(async () => {
    const t = makeTmpStore();
    store = t.store;
    tmpDir = t.dir;
    await store.remember('user', 'u1', 'a', 'val-a', { tags: ['alpha'] });
    await store.remember('user', 'u1', 'b', 'val-b', { tags: ['beta'] });
    await store.remember('user', 'u1', 'c', 'val-c', { tags: ['alpha', 'beta'] });
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists all entries for a scope/scope_id', async () => {
    const all = await store.list('user', 'u1');
    expect(all.length).toBe(3);
  });

  it('filters by tag', async () => {
    const alphaEntries = await store.list('user', 'u1', ['alpha']);
    expect(alphaEntries.every(e => e.tags.includes('alpha'))).toBe(true);
    expect(alphaEntries.length).toBe(2);
  });

  it('returns empty for unknown scope_id', async () => {
    const entries = await store.list('user', 'nobody');
    expect(entries).toHaveLength(0);
  });
});

describe('SqliteMemoryStore — multiple tenants', () => {
  it('two stores with different tenantIds share no data', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'penelope-multi-'));
    const s1 = new SqliteMemoryStore({ tenantsDir: dir, tenantId: 'tenant-a' });
    const s2 = new SqliteMemoryStore({ tenantsDir: dir, tenantId: 'tenant-b' });
    await s1.remember('user', 'u1', 'secret', 'alpha-data');
    const fromS2 = await s2.recall('user', 'u1', 'secret');
    expect(fromS2).toBeUndefined();
    s1.close();
    s2.close();
    rmSync(dir, { recursive: true, force: true });
  });
});