import { Command } from 'commander';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import chalk from 'chalk';

interface TenantConfig {
  name: string;
  slug: string;
  channels: string[];
  createdAt: string;
}

interface StatusRow {
  channel: string;
  status: 'running' | 'stopped' | 'unknown';
  lastInbound?: string;
  queueDepth: number;
}

function readQueueDepth(tenantDir: string, channel: string): number {
  const queueDir = join(tenantDir, 'state', 'queue', channel);
  if (!existsSync(queueDir)) return 0;
  try {
    return readdirSync(queueDir).filter((f) => f.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

function readLastInbound(tenantDir: string, channel: string): string | undefined {
  const logFile = join(tenantDir, 'state', `inbound-${channel}.log`);
  if (!existsSync(logFile)) return undefined;
  try {
    const lines = readFileSync(logFile, 'utf8').trim().split('\n');
    const last = lines[lines.length - 1];
    if (!last) return undefined;
    const parsed = JSON.parse(last) as { ts?: string; text?: string };
    return parsed.ts ? `${parsed.ts} — ${(parsed.text ?? '').slice(0, 40)}` : undefined;
  } catch {
    return undefined;
  }
}

function agentIsRunning(channel: string): boolean {
  // v0.1: heuristic — check for a PID file
  // Full implementation queries the loom bus daemon registry.
  return false; // conservative default until bus is wired
}

export function makeStatusCommand(): Command {
  const cmd = new Command('status');
  cmd
    .description('Show tenant agent status, last inbound, and queue depths')
    .argument('[slug]', 'tenant slug (default: all tenants)')
    .option('--cwd <path>', 'workspace root', process.cwd())
    .option('--json', 'output as JSON')
    .action(async (slug: string | undefined, opts: { cwd: string; json?: boolean }) => {
      const root = resolve(opts.cwd);
      const tenantsDir = join(root, 'tenants');

      if (!existsSync(tenantsDir)) {
        console.error(chalk.red('  No tenants/ directory. Run `penelope init` first.'));
        process.exit(1);
      }

      const slugs = slug
        ? [slug]
        : readdirSync(tenantsDir).filter((d) =>
            statSync(join(tenantsDir, d)).isDirectory()
          );

      if (slugs.length === 0) {
        console.log(chalk.dim('  No tenants found.'));
        return;
      }

      const allStatus: Array<{ tenant: string; rows: StatusRow[] }> = [];

      for (const s of slugs) {
        const tenantDir = join(tenantsDir, s);
        const configPath = join(tenantDir, 'tenant.json');

        if (!existsSync(configPath)) continue;

        const config: TenantConfig = JSON.parse(readFileSync(configPath, 'utf8'));

        const rows: StatusRow[] = config.channels.map((ch) => ({
          channel: ch,
          status: agentIsRunning(ch) ? 'running' : 'stopped',
          lastInbound: readLastInbound(tenantDir, ch),
          queueDepth: readQueueDepth(tenantDir, ch),
        }));

        allStatus.push({ tenant: s, rows });
      }

      if (opts.json) {
        console.log(JSON.stringify(allStatus, null, 2));
        return;
      }

      for (const { tenant, rows } of allStatus) {
        const config: TenantConfig = JSON.parse(
          readFileSync(join(tenantsDir, tenant, 'tenant.json'), 'utf8')
        );

        console.log(`\n  ${chalk.bold(config.name)} ${chalk.dim(`(${tenant})`)}`);
        console.log(chalk.dim(`  Created: ${config.createdAt}`));
        console.log();

        const colW = { ch: 20, status: 10, last: 46, queue: 6 };
        const header =
          '  ' +
          'Channel'.padEnd(colW.ch) +
          'Status'.padEnd(colW.status) +
          'Last Inbound'.padEnd(colW.last) +
          'Queue';
        console.log(chalk.dim(header));
        console.log(chalk.dim('  ' + '─'.repeat(colW.ch + colW.status + colW.last + colW.queue)));

        for (const row of rows) {
          const statusColor =
            row.status === 'running'
              ? chalk.green(row.status.padEnd(colW.status))
              : chalk.yellow(row.status.padEnd(colW.status));

          console.log(
            '  ' +
              row.channel.padEnd(colW.ch) +
              statusColor +
              (row.lastInbound ?? chalk.dim('—')).padEnd(colW.last) +
              String(row.queueDepth)
          );
        }
      }

      console.log();
    });

  return cmd;
}
