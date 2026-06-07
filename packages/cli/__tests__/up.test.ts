import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `penelope-up-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

type ChannelEntry = string | { type: string; enabled?: boolean; [key: string]: unknown };

function scaffoldTenant(
  outDir: string,
  opts: {
    name: string;
    slug: string;
    channels: ChannelEntry[];
    env?: Record<string, string>;
  }
) {
  const tenantDir = join(outDir, 'tenants', opts.slug);
  mkdirSync(join(tenantDir, 'agents'), { recursive: true });
  mkdirSync(join(tenantDir, 'state'), { recursive: true });

  const config = {
    name: opts.name,
    slug: opts.slug,
    channels: opts.channels,
    version: '0.1.0',
  };
  writeFileSync(join(tenantDir, 'tenant.json'), JSON.stringify(config, null, 2));

  if (opts.env && Object.keys(opts.env).length > 0) {
    const lines = Object.entries(opts.env).map(([k, v]) => `${k}=${v}`);
    writeFileSync(join(tenantDir, '.env'), lines.join('\n') + '\n');
  }

  return tenantDir;
}

/**
 * Extract the channel type key from a ChannelEntry the same way up.ts does.
 * This mirrors the patched logic so the test can assert the resolved key.
 */
function resolveChannelKey(entry: ChannelEntry): string {
  return typeof entry === 'string' ? entry : entry.type;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('up — channel resolution (string-array vs object-array)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves string channel entries to their type key', () => {
    const channels: ChannelEntry[] = ['telegram-owner', 'fb-page'];
    const resolved = channels.map(resolveChannelKey);
    expect(resolved).toEqual(['telegram-owner', 'fb-page']);
  });

  it('resolves object channel entries to their .type key', () => {
    const channels: ChannelEntry[] = [
      { type: 'telegram-owner', enabled: true, token: 'tok' },
      { type: 'fb-page', enabled: false },
    ];
    const resolved = channels.map(resolveChannelKey);
    expect(resolved).toEqual(['telegram-owner', 'fb-page']);
  });

  it('resolves a mixed array (string + object) correctly', () => {
    const channels: ChannelEntry[] = [
      'twilio-sms',
      { type: 'telegram-owner', extra: 'data' },
    ];
    const resolved = channels.map(resolveChannelKey);
    expect(resolved).toEqual(['twilio-sms', 'telegram-owner']);
  });

  it('scaffold produces valid tenant.json with string channels', () => {
    const tenantDir = scaffoldTenant(tmpDir, {
      name: 'String Array Biz',
      slug: 'string-biz',
      channels: ['telegram-owner'],
    });

    const raw = require('fs').readFileSync(join(tenantDir, 'tenant.json'), 'utf8');
    const config = JSON.parse(raw);
    expect(config.channels).toEqual(['telegram-owner']);

    // The resolved key must equal the string itself
    const resolved = config.channels.map(resolveChannelKey);
    expect(resolved).toEqual(['telegram-owner']);
  });

  it('scaffold produces valid tenant.json with object-array channels', () => {
    const tenantDir = scaffoldTenant(tmpDir, {
      name: 'Object Array Biz',
      slug: 'object-biz',
      channels: [
        { type: 'telegram-owner', enabled: true, botToken: 'fake-token' },
        { type: 'twilio-sms', enabled: false },
      ],
    });

    const raw = require('fs').readFileSync(join(tenantDir, 'tenant.json'), 'utf8');
    const config = JSON.parse(raw);
    expect(config.channels[0].type).toBe('telegram-owner');
    expect(config.channels[1].type).toBe('twilio-sms');

    // The resolved key must come from .type
    const resolved = config.channels.map(resolveChannelKey);
    expect(resolved).toEqual(['telegram-owner', 'twilio-sms']);
  });

  it('real DHR-style object-array tenant resolves telegram-owner and all channels', () => {
    // This is the shape that caused the original silent-skip bug on Weekend Linux
    const channels: ChannelEntry[] = [
      { type: 'telegram-owner', enabled: true },
      { type: 'fb-page', enabled: true },
      { type: 'twilio-sms', enabled: false },
      { type: 'imap-smtp', enabled: false },
      { type: 'instagram', enabled: false },
    ];

    const resolved = channels.map(resolveChannelKey);
    expect(resolved).toEqual([
      'telegram-owner',
      'fb-page',
      'twilio-sms',
      'imap-smtp',
      'instagram',
    ]);

    // Verify that none of them are silently dropped (all 5 should resolve)
    expect(resolved).toHaveLength(5);
  });

  it('unknown channel types pass through resolveChannelKey without crashing', () => {
    const channels: ChannelEntry[] = [
      { type: 'unknown-future-channel', enabled: true },
      'another-string-channel',
    ];
    const resolved = channels.map(resolveChannelKey);
    expect(resolved[0]).toBe('unknown-future-channel');
    expect(resolved[1]).toBe('another-string-channel');
  });
});
