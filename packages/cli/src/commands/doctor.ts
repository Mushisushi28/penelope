import { Command } from 'commander';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';

interface CheckResult {
  label: string;
  pass: boolean;
  detail?: string;
}

function checkNode(): CheckResult {
  const [major] = process.versions.node.split('.').map(Number);
  return {
    label: 'Node.js version >= 20',
    pass: major >= 20,
    detail: `Found Node ${process.version}`,
  };
}

function checkTenantDir(root: string): CheckResult {
  const tenantsDir = join(root, 'tenants');
  if (!existsSync(tenantsDir)) {
    return { label: 'tenants/ directory', pass: false, detail: 'Run `penelope init`' };
  }
  const dirs = readdirSync(tenantsDir).filter((d) =>
    statSync(join(tenantsDir, d)).isDirectory()
  );
  return {
    label: 'tenants/ directory',
    pass: dirs.length > 0,
    detail: dirs.length > 0 ? `${dirs.length} tenant(s): ${dirs.join(', ')}` : 'No tenants',
  };
}

function checkTenantConfig(tenantDir: string, slug: string): CheckResult[] {
  const configPath = join(tenantDir, 'tenant.json');
  if (!existsSync(configPath)) {
    return [{ label: `${slug}/tenant.json`, pass: false, detail: 'Missing config file' }];
  }

  try {
    const cfg = JSON.parse(readFileSync(configPath, 'utf8')) as {
      name?: string;
      slug?: string;
      vertical?: string;
      channels?: string[];
    };

    const checks: CheckResult[] = [];

    checks.push({
      label: `${slug}/tenant.json`,
      pass: !!(cfg.name && cfg.slug && cfg.vertical && cfg.channels),
      detail: cfg.name ?? 'Missing required fields',
    });

    return checks;
  } catch {
    return [{ label: `${slug}/tenant.json`, pass: false, detail: 'JSON parse error' }];
  }
}

function checkEnvVars(tenantDir: string, channels: string[]): CheckResult[] {
  const envPath = join(tenantDir, '.env');
  const envExists = existsSync(envPath);

  const env: Record<string, string> = {};
  if (envExists) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 0) continue;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim();
      if (val) env[key] = val;
    }
  }

  const REQUIRED: Record<string, string[]> = {
    'telegram-owner': ['TELEGRAM_BOT_TOKEN'],
    'fb-page': ['FB_PAGE_TOKEN', 'FB_PAGE_ID', 'FB_VERIFY_TOKEN'],
    'twilio-sms': ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'],
    'imap-smtp': ['IMAP_HOST', 'IMAP_USER', 'IMAP_PASS'],
    'instagram': ['IG_ACCESS_TOKEN'],
  };

  const results: CheckResult[] = [];
  results.push({ label: '.env file', pass: envExists, detail: envExists ? envPath : 'Copy .env.example → .env' });

  for (const ch of channels) {
    const required = REQUIRED[ch] ?? [];
    const missing = required.filter((k) => !env[k] && !process.env[k]);
    results.push({
      label: `${ch} env vars`,
      pass: missing.length === 0,
      detail: missing.length > 0 ? `Missing: ${missing.join(', ')}` : 'OK',
    });
  }

  return results;
}

async function checkTelegramBotToken(token: string): Promise<CheckResult> {
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(5000) });
    const json = (await resp.json()) as { ok: boolean; result?: { username: string } };
    return {
      label: 'Telegram bot reachable',
      pass: json.ok,
      detail: json.ok ? `@${json.result?.username}` : 'Invalid token',
    };
  } catch {
    return { label: 'Telegram bot reachable', pass: false, detail: 'Network error or timeout' };
  }
}

function printCheck(check: CheckResult): void {
  const icon = check.pass ? chalk.green('✓') : chalk.red('✗');
  const label = check.pass ? chalk.white(check.label) : chalk.red(check.label);
  const detail = check.detail ? chalk.dim(` — ${check.detail}`) : '';
  console.log(`  ${icon}  ${label}${detail}`);
}

export function makeDoctorCommand(): Command {
  const cmd = new Command('doctor');
  cmd
    .description('Check environment, config, and connectivity for Penelope')
    .argument('[slug]', 'tenant slug to check (default: all tenants)')
    .option('--cwd <path>', 'workspace root', process.cwd())
    .action(async (slug: string | undefined, opts: { cwd: string }) => {
      const root = resolve(opts.cwd);
      console.log(chalk.cyan('\n  penelope doctor\n'));

      const results: CheckResult[] = [];

      // System checks
      results.push(checkNode());
      results.push(checkTenantDir(root));

      for (const r of results) printCheck(r);

      if (results.some((r) => !r.pass && r.label === 'tenants/ directory')) {
        console.log(chalk.red('\n  Fatal: no tenants found. Run `penelope init` first.\n'));
        process.exit(1);
      }

      // Per-tenant checks
      const tenantsDir = join(root, 'tenants');
      const slugs = slug
        ? [slug]
        : readdirSync(tenantsDir).filter((d) => statSync(join(tenantsDir, d)).isDirectory());

      for (const s of slugs) {
        const tenantDir = join(tenantsDir, s);
        const configPath = join(tenantDir, 'tenant.json');

        console.log(chalk.dim(`\n  Tenant: ${s}`));

        const cfgChecks = checkTenantConfig(tenantDir, s);
        for (const r of cfgChecks) printCheck(r);

        if (!existsSync(configPath)) continue;

        const cfg = JSON.parse(readFileSync(configPath, 'utf8')) as {
          channels?: string[];
          telegramBotToken?: string;
        };

        const envChecks = checkEnvVars(tenantDir, cfg.channels ?? []);
        for (const r of envChecks) printCheck(r);

        // Live connectivity check for telegram
        if (cfg.channels?.includes('telegram-owner')) {
          const envPath = join(tenantDir, '.env');
          let token = process.env['TELEGRAM_BOT_TOKEN'];

          if (existsSync(envPath)) {
            for (const line of readFileSync(envPath, 'utf8').split('\n')) {
              const t = line.trim();
              if (t.startsWith('TELEGRAM_BOT_TOKEN=')) {
                const val = t.split('=')[1]?.trim();
                if (val) token = val;
              }
            }
          }

          if (token) {
            const spinner = ora('Checking Telegram bot…').start();
            const check = await checkTelegramBotToken(token);
            spinner.stop();
            printCheck(check);
          }
        }
      }

      const failed = results.filter((r) => !r.pass);
      console.log();

      if (failed.length === 0) {
        console.log(chalk.green('  All checks passed. Run `penelope up` to start.\n'));
      } else {
        console.log(
          chalk.yellow(`  ${failed.length} check(s) need attention before going live.\n`)
        );
        process.exit(1);
      }
    });

  return cmd;
}
