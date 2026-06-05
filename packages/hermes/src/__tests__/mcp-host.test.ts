/**
 * @penelope/hermes — McpHost + transport unit tests
 *
 * Tests cover: config loading/validation, stdio transport (mocked child_process),
 * http transport (mocked fetch), reconnect scheduling, schema discovery,
 * tool invocation, arg forwarding, and error envelope mapping.
 *
 * Architecture note: we mock node:child_process at the top level so
 * StdioTransport never spawns a real process. McpHost integration tests
 * use a FakeTransport injected via vi.mock on the stdio-transport module.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';

// ── fixtures ──────────────────────────────────────────────────────────────────

const MOCK_TOOLS_LIST = {
  tools: [
    {
      name: 'list_repos',
      description: 'List GitHub repositories',
      inputSchema: {
        type: 'object',
        properties: { owner: { type: 'string' } },
        required: ['owner'],
      },
    },
    {
      name: 'create_issue',
      description: 'Create a GitHub issue',
      inputSchema: {
        type: 'object',
        properties: { repo: { type: 'string' }, title: { type: 'string' } },
        required: ['repo', 'title'],
      },
    },
  ],
};

function rpcLine(id: number, result: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n';
}

// ── mock proc factory ─────────────────────────────────────────────────────────

interface MockProc extends EventEmitter {
  stdin: Writable & { written: string[] };
  stdout: Readable;
  pid: number;
  kill: () => void;
  _push: (data: string) => void;
  _end: () => void;
}

function makeMockProc(): MockProc {
  const proc = new EventEmitter() as MockProc;
  proc.pid = 99999;

  const written: string[] = [];
  const stdin = new Writable({
    write(chunk, _enc, cb) {
      written.push(chunk.toString());
      cb();
    },
  }) as Writable & { written: string[] };
  stdin.written = written;
  proc.stdin = stdin;

  const stdout = new Readable({ read() {} });
  proc.stdout = stdout;
  proc.kill = vi.fn(() => {
    proc.emit('close', 0);
  });
  proc._push = (data: string) => stdout.push(data);
  proc._end = () => proc.emit('close', 0);

  return proc;
}

function tick(): Promise<void> {
  return new Promise((r) => setImmediate(r));
}

// ── StdioTransport tests ──────────────────────────────────────────────────────
// These tests import StdioTransport directly and inject a mock child_process.
// We use vi.doMock + dynamic import per-test for isolation.

describe('StdioTransport — NDJSON framing', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('encodes requests as NDJSON and resolves on matching response', async () => {
    const proc = makeMockProc();
    vi.doMock('node:child_process', () => ({ spawn: vi.fn().mockReturnValue(proc) }));
    const { StdioTransport } = await import('../mcp/stdio-transport.js');

    const t = new StdioTransport('node', []);
    const p = t.send('ping', { x: 1 });
    await tick();
    proc._push(rpcLine(1, { pong: true }));

    const resp = await p;
    expect(resp.result).toEqual({ pong: true });
    const sent = JSON.parse(proc.stdin.written[0]!);
    expect(sent).toMatchObject({ jsonrpc: '2.0', method: 'ping', params: { x: 1 }, id: 1 });
    t.close();
  });

  it('rejects pending requests when process exits', async () => {
    const proc = makeMockProc();
    vi.doMock('node:child_process', () => ({ spawn: vi.fn().mockReturnValue(proc) }));
    const { StdioTransport } = await import('../mcp/stdio-transport.js');

    const t = new StdioTransport('node', []);
    const p = t.send('slow', {});
    await tick();
    proc._end();

    await expect(p).rejects.toThrow('exited');
  });

  it('handles split-chunk NDJSON', async () => {
    const proc = makeMockProc();
    vi.doMock('node:child_process', () => ({ spawn: vi.fn().mockReturnValue(proc) }));
    const { StdioTransport } = await import('../mcp/stdio-transport.js');

    const t = new StdioTransport('node', []);
    const p = t.send('chunk_test', {});
    const full = rpcLine(1, { ok: true });
    await tick();
    proc._push(full.slice(0, 12));
    proc._push(full.slice(12));

    const resp = await p;
    expect(resp.result).toEqual({ ok: true });
    t.close();
  });

  it('increments request ids for concurrent calls', async () => {
    const proc = makeMockProc();
    vi.doMock('node:child_process', () => ({ spawn: vi.fn().mockReturnValue(proc) }));
    const { StdioTransport } = await import('../mcp/stdio-transport.js');

    const t = new StdioTransport('node', []);
    const p1 = t.send('a', {});
    const p2 = t.send('b', {});
    await tick();
    proc._push(rpcLine(1, 'first'));
    proc._push(rpcLine(2, 'second'));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.result).toBe('first');
    expect(r2.result).toBe('second');
    t.close();
  });
});

// ── HttpTransport tests ───────────────────────────────────────────────────────

describe('HttpTransport — HTTP+SSE', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('POST /messages resolves from JSON response body', async () => {
    const mockResp = { jsonrpc: '2.0', id: 1, result: { hello: 'world' } };
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/events')) {
        return Promise.resolve({
          ok: true,
          body: { getReader: () => ({ read: () => new Promise(() => {}) }) },
          headers: { get: () => null },
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : null) },
        json: async () => mockResp,
      });
    }));

    const { HttpTransport } = await import('../mcp/http-transport.js');
    const t = new HttpTransport('http://localhost:9000');
    await t.connect();
    const resp = await t.send('ping', {});
    expect(resp.result).toEqual({ hello: 'world' });
    t.close();
  });

  it('rejects when POST /messages returns non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/events')) {
        return Promise.resolve({
          ok: true,
          body: { getReader: () => ({ read: () => new Promise(() => {}) }) },
        });
      }
      return Promise.resolve({ ok: false, status: 503, headers: { get: () => null } });
    }));

    const { HttpTransport } = await import('../mcp/http-transport.js');
    const t = new HttpTransport('http://localhost:9000');
    await t.connect();
    await expect(t.send('fail', {})).rejects.toThrow('503');
    t.close();
  });

  it('close rejects all pending requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})));

    const { HttpTransport } = await import('../mcp/http-transport.js');
    const t = new HttpTransport('http://localhost:9000');
    const p = t.send('pending', {}).catch((e: Error) => e.message);
    t.close();
    const msg = await p;
    expect(msg).toMatch(/closed|failed/i);
  });
});

// ── McpHost tests — direct API (no I/O) ──────────────────────────────────────

describe('McpHost — direct API (no I/O)', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('listTools returns empty array before any load', async () => {
    const { McpHost } = await import('../mcp/host.js');
    const host = new McpHost();
    expect(host.listTools()).toEqual([]);
  });

  it('invoke throws for unknown server', async () => {
    const { McpHost } = await import('../mcp/host.js');
    const host = new McpHost();
    await expect(host.invoke('nope', 'tool', {})).rejects.toThrow('"nope" not found');
  });

  it('disconnect on empty host is a no-op', async () => {
    const { McpHost } = await import('../mcp/host.js');
    const host = new McpHost();
    expect(() => host.disconnect()).not.toThrow();
  });
});

// ── McpHost — config validation ───────────────────────────────────────────────

describe('McpHost — config validation', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('throws when config file contains a non-array', async () => {
    vi.doMock('node:fs/promises', () => ({
      readFile: vi.fn().mockResolvedValue(JSON.stringify({ oops: true })),
    }));
    vi.doMock('node:child_process', () => ({ spawn: vi.fn() }));
    const { McpHost } = await import('../mcp/host.js');
    const host = new McpHost();
    await expect(host.load('/fake/mcp.json')).rejects.toThrow('expected JSON array');
  });

  it('skips server with missing name (no throw)', async () => {
    vi.doMock('node:fs/promises', () => ({
      readFile: vi.fn().mockResolvedValue(JSON.stringify([{ transport: 'stdio', command: 'node' }])),
    }));
    vi.doMock('node:child_process', () => ({ spawn: vi.fn() }));
    const { McpHost } = await import('../mcp/host.js');
    const host = new McpHost();
    await expect(host.load('/fake/mcp.json')).resolves.toBeUndefined();
    expect(host.listTools()).toHaveLength(0);
  });

  it('skips stdio server with no command (no throw)', async () => {
    vi.doMock('node:fs/promises', () => ({
      readFile: vi.fn().mockResolvedValue(JSON.stringify([{ name: 'test', transport: 'stdio' }])),
    }));
    vi.doMock('node:child_process', () => ({ spawn: vi.fn() }));
    const { McpHost } = await import('../mcp/host.js');
    const host = new McpHost();
    await expect(host.load('/fake/mcp.json')).resolves.toBeUndefined();
  });

  it('skips http server with no url (no throw)', async () => {
    vi.doMock('node:fs/promises', () => ({
      readFile: vi.fn().mockResolvedValue(JSON.stringify([{ name: 'test', transport: 'http' }])),
    }));
    vi.doMock('node:child_process', () => ({ spawn: vi.fn() }));
    const { McpHost } = await import('../mcp/host.js');
    const host = new McpHost();
    await expect(host.load('/fake/mcp.json')).resolves.toBeUndefined();
  });
});

// ── McpHost integration via FakeTransport ─────────────────────────────────────
//
// We substitute a FakeTransport so no real processes or network calls happen.
// vi.resetModules() + vi.doMock per test gives a fresh McpHost class that
// picks up the mocked stdio-transport on each dynamic import.

type RpcResponse = { jsonrpc: '2.0'; id: number; result?: unknown; error?: { code: number; message: string } };

class FakeTransport extends EventEmitter {
  nextId = 1;
  responses: RpcResponse[] = [];
  calls: Array<{ method: string; params: unknown }> = [];

  send(method: string, params?: unknown): Promise<RpcResponse> {
    const id = this.nextId++;
    this.calls.push({ method, params });
    const canned = this.responses.shift();
    if (canned) {
      return Promise.resolve({ ...canned, id });
    }
    return Promise.resolve({ jsonrpc: '2.0', id, result: {} });
  }

  close() { this.emit('close', 0); }
}

describe('McpHost — integration (FakeTransport)', () => {
  let fake: FakeTransport;

  function setupFakeResponses() {
    fake.responses = [
      { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05', capabilities: {} } },
      { jsonrpc: '2.0', id: 2, result: {} },              // notifications/initialized (ignored)
      { jsonrpc: '2.0', id: 3, result: MOCK_TOOLS_LIST }, // tools/list
    ];
  }

  beforeEach(() => {
    fake = new FakeTransport();
    setupFakeResponses();
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  async function makeLoadedHost() {
    vi.doMock('../mcp/stdio-transport.js', () => ({
      StdioTransport: vi.fn().mockImplementation(() => fake),
    }));
    vi.doMock('node:fs/promises', () => ({
      readFile: vi.fn().mockResolvedValue(JSON.stringify([
        { name: 'github', transport: 'stdio', command: 'npx', args: [] },
      ])),
    }));
    const { McpHost } = await import('../mcp/host.js');
    const host = new McpHost();
    await host.load('/fake/mcp.json');
    return host;
  }

  it('loads config and discovers 2 tools', async () => {
    const host = await makeLoadedHost();
    const tools = host.listTools();
    expect(tools).toHaveLength(2);
    expect(tools[0]).toMatchObject({ server: 'github', name: 'list_repos' });
    expect(tools[1]).toMatchObject({ server: 'github', name: 'create_issue' });
    host.disconnect();
  });

  it('preserves inputSchema structure', async () => {
    const host = await makeLoadedHost();
    const tool = host.listTools().find((t) => t.name === 'create_issue');
    expect(tool?.input_schema).toMatchObject({
      type: 'object',
      properties: { repo: { type: 'string' }, title: { type: 'string' } },
      required: ['repo', 'title'],
    });
    host.disconnect();
  });

  it('throws for unknown tool on known server', async () => {
    const host = await makeLoadedHost();
    await expect(host.invoke('github', 'ghost_tool', {})).rejects.toThrow('"ghost_tool" not found');
    host.disconnect();
  });

  it('forwards args correctly to tools/call', async () => {
    const host = await makeLoadedHost();
    fake.responses.push({ jsonrpc: '2.0', id: 99, result: { content: [{ type: 'text', text: 'repo1' }] } });
    const result = await host.invoke('github', 'list_repos', { owner: 'octocat' });
    expect(result).toMatchObject({ content: [{ type: 'text', text: 'repo1' }] });
    const callMsg = fake.calls.find((c) => c.method === 'tools/call');
    expect((callMsg?.params as { arguments: unknown })?.arguments).toEqual({ owner: 'octocat' });
    host.disconnect();
  });

  it('invokeWith accepts McpInvocation struct', async () => {
    const host = await makeLoadedHost();
    fake.responses.push({ jsonrpc: '2.0', id: 99, result: { content: [{ type: 'text', text: 'ok' }] } });
    const result = await host.invokeWith({ server: 'github', tool: 'list_repos', args: { owner: 'x' } });
    expect(result).toBeDefined();
    host.disconnect();
  });

  it('maps JSON-RPC error envelope to JS Error', async () => {
    const host = await makeLoadedHost();
    fake.responses.push({ jsonrpc: '2.0', id: 99, error: { code: -32000, message: 'rate limited' } });
    await expect(host.invoke('github', 'list_repos', {})).rejects.toThrow('rate limited');
    host.disconnect();
  });

  it('maps isError content to JS Error', async () => {
    const host = await makeLoadedHost();
    fake.responses.push({
      jsonrpc: '2.0', id: 99,
      result: { content: [{ type: 'text', text: 'permission denied' }], isError: true },
    });
    await expect(host.invoke('github', 'list_repos', {})).rejects.toThrow('permission denied');
    host.disconnect();
  });

  it('disconnect clears all servers', async () => {
    const host = await makeLoadedHost();
    expect(host.listTools()).toHaveLength(2);
    host.disconnect();
    expect(host.listTools()).toHaveLength(0);
  });

  it('servers map cleared when transport fires close event', async () => {
    const host = await makeLoadedHost();
    expect(host.listTools()).toHaveLength(2);
    fake.emit('close', 0);
    await tick(); // let close handler run
    expect(host.listTools()).toHaveLength(0);
    expect(() => host.disconnect()).not.toThrow();
  });
});
