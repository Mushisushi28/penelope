import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { spawn } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';

type ChannelEntry = string | { type: string; [key: string]: unknown };

interface TenantConfig {
  name: string;
  slug: string;
  channels: ChannelEntry[];
  telegramBotToken?: string;
}

const CHANNEL_AGENTS: Record<string, { label: string; envVars: string[] }> = {
  'telegram-owner': {
    label: 'Telegram owner bot',
    envVars: ['TELEGRAM_BOT_TOKEN'],
  },
  'fb-page': {
    label: 'Facebook Page watcher',
    envVars: ['FB_PAGE_TOKEN', 'FB_PAGE_ID'],
  },
  'twilio-sms': {
    label: 'Twilio SMS listener',
    envVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
  },
  'imap-smtp': {
    label: 'Email (IMAP) poller',
    envVars: ['IMAP_HOST', 'IMAP_USER'],
  },
  'instagram': {
    label: 'Instagram DM watcher',
    envVars: ['IG_ACCESS_TOKEN'],
  },
};

function loadTenantEnv(tenantDir: string): Record<string, string> {
  const envPath = join(tenantDir, '.env');
  if (!existsSync(envPath)) return {};

  const env: Record<string, string> = {};
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    env[key] = val;
  }
  return env;
}

export function makeUpCommand(): Command {
  const cmd = new Command('up');
  cmd
    .description('Start a tenant\'s agents (telegram bot, channel watchers, etc.)')
    .argument('[slug]', 'tenant slug (default: first tenant found)')
    .option('--cwd <path>', 'workspace root', process.cwd())
    .option('--tenants-dir <path>', 'path to tenants directory (overrides <cwd>/tenants)')
    .option('--dry-run', 'print what would start without starting it')
    .action(async (slug: string | undefined, opts: { cwd: string; tenantsDir?: string; dryRun?: boolean }) => {
      const root = resolve(opts.cwd);

      // Resolve slug
      if (!slug) {
        // Try to find a single tenant
        const tenantsDir = opts.tenantsDir ? resolve(opts.tenantsDir) : join(root, 'tenants');
        if (!existsSync(tenantsDir)) {
          console.error(chalk.red('  No tenants/ directory found. Run `penelope init` first.'));
          process.exit(1);
        }
        const { readdirSync } = await import('fs');
        const dirs = readdirSync(tenantsDir);
        if (dirs.length === 0) {
          console.error(chalk.red('  No tenants found. Run `penelope init` first.'));
          process.exit(1);
        }
        slug = dirs[0];
      }

      const resolvedTenantsDir = opts.tenantsDir ? resolve(opts.tenantsDir) : join(root, 'tenants');
      const tenantDir = join(resolvedTenantsDir, slug);
      const configPath = join(tenantDir, 'tenant.json');

      if (!existsSync(configPath)) {
        console.error(chalk.red(`  tenant.json not found at ${tenantDir}`));
        process.exit(1);
      }

      const config: TenantConfig = JSON.parse(readFileSync(configPath, 'utf8'));
      const env = loadTenantEnv(tenantDir);

      console.log(chalk.cyan(`\n  Starting Penelope for ${chalk.bold(config.name)} (${slug})\n`));

      for (const rawChannel of config.channels) {
        // Support both string arrays ("telegram-owner") and object arrays ({type: "telegram-owner", ...})
        const channel = typeof rawChannel === 'string' ? rawChannel : rawChannel.type;
        const agent = CHANNEL_AGENTS[channel];
        if (!agent) continue;

        const missingVars = agent.envVars.filter((v) => !env[v] && !process.env[v]);

        if (missingVars.length > 0) {
          console.log(
            chalk.yellow(`  [skip] ${agent.label}`) +
              chalk.dim(` — missing env: ${missingVars.join(', ')}`)
          );
          continue;
        }

        if (opts.dryRun) {
          console.log(chalk.dim(`  [dry-run] would start: ${agent.label}`));
          continue;
        }

        const spinner = ora(`Starting ${agent.label}…`).start();

        // v0.1: lightweight no-op supervisor — spawns the agent's index file if present
        // In a full implementation this wires into the loom bus daemon.
        const agentIndex = join(tenantDir, 'agents', `${channel}.mjs`);

        if (existsSync(agentIndex)) {
          const proc = spawn(process.execPath, [agentIndex], {
            detached: true,
            stdio: 'ignore',
            env: { ...process.env, ...env },
          });
          proc.unref();
          spinner.succeed(`${agent.label} started (pid ${proc.pid})`);
        } else {
          spinner.info(
            `${agent.label} — no agent file at agents/${channel}.mjs (wired in v0.2)`
          );
        }
      }

      console.log(
        chalk.green('\n  ✓ Done.') +
          chalk.dim('  Run `penelope status` to check agent health.\n')
      );
    });

  return cmd;
}
