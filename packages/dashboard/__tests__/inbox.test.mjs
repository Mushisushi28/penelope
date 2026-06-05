// __tests__/inbox.test.mjs — integration tests for v2 inbox API routes
// Runs against a real in-process server on port 19901 (no DB, stub data only).

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const TEST_PORT = 19901;
const BASE = `http://localhost:${TEST_PORT}`;

// ── Inline minimal server bootstrap (imports serve.mjs handler via child process) ──
// We spawn a child server process to avoid module-singleton state collisions.
import { spawn } from 'node:child_process';

let serverProc;

async function waitReady(port, ms = 5000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://localhost:${port}/api/health`);
      if (r.ok) return;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Server did not start on port ${port} within ${ms}ms`);
}

before(async () => {
  serverProc = spawn(
    process.execPath,
    [join(__dir, '..', 'serve.mjs')],
    {
      env: { ...process.env, PENELOPE_DASHBOARD_PORT: String(TEST_PORT) },
      stdio: 'pipe',
    }
  );
  serverProc.stderr.on('data', d => { /* suppress */ });
  serverProc.stdout.on('data', d => { /* suppress */ });
  await waitReady(TEST_PORT);
});

after(() => {
  serverProc?.kill();
});

// ── helpers ──────────────────────────────────────────────────────────────────
async function get(path) {
  const r = await fetch(`${BASE}${path}`);
  return { status: r.status, body: await r.json() };
}

async function post(path, data = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  return { status: r.status, body: await r.json() };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/inbox/threads', () => {
  it('returns all 3 stub threads', async () => {
    const { status, body } = await get('/api/inbox/threads');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.threads));
    assert.equal(body.threads.length, 3);
  });

  it('each thread has paused_at and ai_status fields', async () => {
    const { body } = await get('/api/inbox/threads');
    for (const t of body.threads) {
      assert.ok('paused_at' in t, `thread ${t.id} missing paused_at`);
      assert.ok('ai_status' in t, `thread ${t.id} missing ai_status`);
    }
  });

  it('paused_at starts as null for all threads', async () => {
    const { body } = await get('/api/inbox/threads');
    for (const t of body.threads) {
      assert.equal(t.paused_at, null);
    }
  });

  it('filters by channel=sms', async () => {
    const { body } = await get('/api/inbox/threads?channel=sms');
    assert.ok(body.threads.every(t => t.channel === 'sms'));
    assert.ok(body.threads.length >= 1);
  });

  it('filters by channel=fb-messenger', async () => {
    const { body } = await get('/api/inbox/threads?channel=fb-messenger');
    assert.ok(body.threads.every(t => t.channel === 'fb-messenger'));
    assert.equal(body.threads.length, 1);
  });
});

describe('GET /api/inbox/:id/thread', () => {
  it('returns messages for thread-1', async () => {
    const { status, body } = await get('/api/inbox/thread-1/thread');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.messages));
    assert.ok(body.messages.length >= 1);
  });

  it('includes pending_draft field', async () => {
    const { body } = await get('/api/inbox/thread-1/thread');
    assert.ok('pending_draft' in body);
  });

  it('returns empty messages for unknown thread', async () => {
    const { status, body } = await get('/api/inbox/nonexistent-xxx/thread');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.messages));
    assert.equal(body.messages.length, 0);
  });
});

describe('POST /api/inbox/:id/takeover', () => {
  it('returns ok with a paused_at timestamp', async () => {
    const { status, body } = await post('/api/inbox/thread-2/takeover');
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.ok(typeof body.paused_at === 'string');
    assert.ok(!isNaN(Date.parse(body.paused_at)));
  });

  it('thread shows paused_at in threads list after takeover', async () => {
    await post('/api/inbox/thread-2/takeover');
    const { body } = await get('/api/inbox/threads');
    const t = body.threads.find(x => x.id === 'thread-2');
    assert.ok(t.paused_at !== null);
  });
});

describe('POST /api/inbox/:id/resume', () => {
  it('clears paused_at back to null', async () => {
    // First take over, then resume
    await post('/api/inbox/thread-3/takeover');
    const { body: afterTakeover } = await get('/api/inbox/threads');
    const t1 = afterTakeover.threads.find(x => x.id === 'thread-3');
    assert.ok(t1.paused_at !== null, 'paused_at should be set after takeover');

    const { status, body } = await post('/api/inbox/thread-3/resume');
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.paused_at, null);

    const { body: afterResume } = await get('/api/inbox/threads');
    const t2 = afterResume.threads.find(x => x.id === 'thread-3');
    assert.equal(t2.paused_at, null);
  });
});

describe('POST /api/inbox/:id/reply', () => {
  it('appends a manual outbound message', async () => {
    const { body: before } = await get('/api/inbox/thread-1/thread');
    const countBefore = before.messages.length;

    const { status, body } = await post('/api/inbox/thread-1/reply', { text: 'Test reply from owner' });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.message.direction, 'outbound');
    assert.equal(body.message.text, 'Test reply from owner');

    const { body: after } = await get('/api/inbox/thread-1/thread');
    assert.equal(after.messages.length, countBefore + 1);
    assert.equal(after.messages.at(-1).text, 'Test reply from owner');
  });

  it('400s on body parse error (wrong content-type)', async () => {
    const r = await fetch(`${BASE}/api/inbox/thread-1/reply`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'not json {{{',
    });
    assert.equal(r.status, 400);
  });
});

describe('legacy /api/inbox compat', () => {
  it('still returns threads list', async () => {
    const { status, body } = await get('/api/inbox');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.threads));
    assert.ok(body.threads.length >= 1);
  });
});
