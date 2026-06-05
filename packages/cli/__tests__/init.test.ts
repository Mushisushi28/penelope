import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeTempDir(): string {
  const dir = join(tmpdir(), `penelope-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Inline version of the scaffold logic (mirrors init.ts internals)
// This lets us test the output tree without invoking interactive prompts.
function scaffoldTenant(
  outDir: string,
  opts: {
    name: string;
    slug: string;
    vertical: string;
    channels: string[];
    quietHours: { start: string; end: string };
    briefTime: string;
  }
) {
  const tenantDir = join(outDir, 'tenants', opts.slug);

  // Scaffold dirs
  for (const sub of ['agents', 'state', 'dashboard', 'procedures']) {
    mkdirSync(join(tenantDir, sub), { recursive: true });
  }

  // Write tenant.json
  const config = {
    name: opts.name,
    slug: opts.slug,
    vertical: opts.vertical,
    channels: opts.channels,
    quietHours: opts.quietHours,
    briefTime: opts.briefTime,
    createdAt: '2026-06-04T00:00:00.000Z',
    version: '0.1.0',
  };
  writeFileSync(join(tenantDir, 'tenant.json'), JSON.stringify(config, null, 2));

  // Write .env.example stub
  const lines: string[] = ['# Penelope tenant environment', ''];
  if (opts.channels.includes('telegram-owner')) {
    lines.push('TELEGRAM_BOT_TOKEN=');
    lines.push('TELEGRAM_OWNER_CHAT_ID=');
    lines.push('');
  }
  if (opts.channels.includes('fb-page')) {
    lines.push('FB_PAGE_TOKEN=');
    lines.push('FB_VERIFY_TOKEN=');
    lines.push('FB_PAGE_ID=');
    lines.push('');
  }
  writeFileSync(join(tenantDir, '.env.example'), lines.join('\n'));

  // Default procedure YAML
  const placeholder = [
    `# ${opts.vertical} procedures`,
    '',
    'greeting:',
    '  message: "Hi! How can I help you today?"',
  ].join('\n');
  writeFileSync(join(tenantDir, 'procedures', 'default.yaml'), placeholder);

  // Gitkeep files
  writeFileSync(join(tenantDir, 'state', '.gitkeep'), '');
  writeFileSync(join(tenantDir, 'agents', '.gitkeep'), '');
  writeFileSync(join(tenantDir, 'dashboard', '.gitkeep'), '');

  return tenantDir;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('init — tenant scaffold', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates tenant.json with correct fields', () => {
    const tenantDir = scaffoldTenant(tmpDir, {
      name: 'Dobson Headlight Restoration',
      slug: 'dobson-headlight-restoration',
      vertical: 'auto-service',
      channels: ['telegram-owner', 'fb-page'],
      quietHours: { start: '22:00', end: '07:00' },
      briefTime: '08:00',
    });

    const configPath = join(tenantDir, 'tenant.json');
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(config.name).toBe('Dobson Headlight Restoration');
    expect(config.slug).toBe('dobson-headlight-restoration');
    expect(config.vertical).toBe('auto-service');
    expect(config.channels).toEqual(['telegram-owner', 'fb-page']);
    expect(config.quietHours).toEqual({ start: '22:00', end: '07:00' });
    expect(config.briefTime).toBe('08:00');
    expect(config.version).toBe('0.1.0');
  });

  it('creates required directory structure', () => {
    const tenantDir = scaffoldTenant(tmpDir, {
      name: 'Test Biz',
      slug: 'test-biz',
      vertical: 'generic',
      channels: ['telegram-owner'],
      quietHours: { start: '22:00', end: '07:00' },
      briefTime: '08:00',
    });

    expect(existsSync(join(tenantDir, 'agents'))).toBe(true);
    expect(existsSync(join(tenantDir, 'state'))).toBe(true);
    expect(existsSync(join(tenantDir, 'dashboard'))).toBe(true);
    expect(existsSync(join(tenantDir, 'procedures'))).toBe(true);
  });

  it('writes .env.example with telegram vars', () => {
    const tenantDir = scaffoldTenant(tmpDir, {
      name: 'Salon Alpha',
      slug: 'salon-alpha',
      vertical: 'personal-services',
      channels: ['telegram-owner'],
      quietHours: { start: '21:00', end: '08:00' },
      briefTime: '09:00',
    });

    const envExample = readFileSync(join(tenantDir, '.env.example'), 'utf8');
    expect(envExample).toContain('TELEGRAM_BOT_TOKEN=');
    expect(envExample).toContain('TELEGRAM_OWNER_CHAT_ID=');
  });

  it('writes .env.example with fb-page vars when channel selected', () => {
    const tenantDir = scaffoldTenant(tmpDir, {
      name: 'Cafe Beta',
      slug: 'cafe-beta',
      vertical: 'food-service',
      channels: ['telegram-owner', 'fb-page'],
      quietHours: { start: '23:00', end: '06:00' },
      briefTime: '07:00',
    });

    const envExample = readFileSync(join(tenantDir, '.env.example'), 'utf8');
    expect(envExample).toContain('FB_PAGE_TOKEN=');
    expect(envExample).toContain('FB_VERIFY_TOKEN=');
  });

  it('writes a default procedure YAML', () => {
    const tenantDir = scaffoldTenant(tmpDir, {
      name: 'Retail Gamma',
      slug: 'retail-gamma',
      vertical: 'retail',
      channels: ['telegram-owner'],
      quietHours: { start: '22:00', end: '07:00' },
      briefTime: '08:00',
    });

    const procPath = join(tenantDir, 'procedures', 'default.yaml');
    expect(existsSync(procPath)).toBe(true);
    const content = readFileSync(procPath, 'utf8');
    expect(content).toContain('retail');
  });

  it('snapshot: tenant directory tree matches expected structure', () => {
    const tenantDir = scaffoldTenant(tmpDir, {
      name: 'Snapshot Co',
      slug: 'snapshot-co',
      vertical: 'generic',
      channels: ['telegram-owner', 'twilio-sms'],
      quietHours: { start: '22:00', end: '07:00' },
      briefTime: '08:00',
    });

    const expectedFiles = [
      'tenant.json',
      '.env.example',
      join('agents', '.gitkeep'),
      join('state', '.gitkeep'),
      join('dashboard', '.gitkeep'),
      join('procedures', 'default.yaml'),
    ];

    for (const f of expectedFiles) {
      expect(existsSync(join(tenantDir, f)), `missing: ${f}`).toBe(true);
    }
  });
});
