import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import chalk from 'chalk';

function listTenants(tenantsDir: string): string[] {
  if (!existsSync(tenantsDir)) return [];
  return readdirSync(tenantsDir).filter((d) => {
    const p = join(tenantsDir, d);
    return statSync(p).isDirectory() && existsSync(join(p, 'tenant.json'));
  });
}

function readConfig(tenantsDir: string, slug: string): Record<string, unknown> {
  const p = join(tenantsDir, slug, 'tenant.json');
  if (!existsSync(p)) {
    console.error(chalk.red(`  Tenant "${slug}" not found.`));
    process.exit(1);
  }
  return JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
}

export function makeTenantCommand(): Command {
  const cmd = new Command('tenant');
  cmd.description('Manage tenants (list, add, remove, info)');

  // list
  cmd
    .command('list')
    .description('List all tenants')
    .option('--cwd <path>', 'workspace root', process.cwd())
    .option('--tenants-dir <path>', 'path to tenants directory (overrides <cwd>/tenants)')
    .option('--json', 'output as JSON')
    .action((opts: { cwd: string; tenantsDir?: string; json?: boolean }) => {
      const tenantsDir = opts.tenantsDir ? resolve(opts.tenantsDir) : join(resolve(opts.cwd), 'tenants');
      const slugs = listTenants(tenantsDir);

      if (opts.json) {
        const configs = slugs.map((s) => readConfig(tenantsDir, s));
        console.log(JSON.stringify(configs, null, 2));
        return;
      }

      if (slugs.length === 0) {
        console.log(chalk.dim('  No tenants found. Run `penelope init` to create one.'));
        return;
      }

      console.log(chalk.dim('\n  Slug'.padEnd(24) + 'Name'.padEnd(32) + 'Vertical'.padEnd(20) + 'Channels'));
      console.log(chalk.dim('  ' + '─'.repeat(80)));

      for (const s of slugs) {
        const cfg = readConfig(tenantsDir, s) as {
          name: string;
          vertical: string;
          channels: string[];
        };
        console.log(
          '  ' +
            s.padEnd(24) +
            (cfg.name ?? '').padEnd(32) +
            (cfg.vertical ?? '').padEnd(20) +
            (cfg.channels ?? []).join(', ')
        );
      }
      console.log();
    });

  // add — alias for `penelope init`
  cmd
    .command('add')
    .description('Add a new tenant (alias for `penelope init`)')
    .action(() => {
      console.log(chalk.dim('  Run `penelope init` to scaffold a new tenant interactively.'));
    });

  // remove
  cmd
    .command('remove <slug>')
    .description('Remove a tenant (deletes tenants/<slug>/ directory)')
    .option('--cwd <path>', 'workspace root', process.cwd())
    .option('--tenants-dir <path>', 'path to tenants directory (overrides <cwd>/tenants)')
    .option('--force', 'skip confirmation prompt')
    .action(async (slug: string, opts: { cwd: string; tenantsDir?: string; force?: boolean }) => {
      const resolvedTenantsDir = opts.tenantsDir ? resolve(opts.tenantsDir) : join(resolve(opts.cwd), 'tenants');
      const tenantDir = join(resolvedTenantsDir, slug);

      if (!existsSync(join(tenantDir, 'tenant.json'))) {
        console.error(chalk.red(`  Tenant "${slug}" not found.`));
        process.exit(1);
      }

      if (!opts.force) {
        const { confirm } = await import('@inquirer/prompts');
        const ok = await confirm({
          message: `Delete tenant "${slug}" and all its data?`,
          default: false,
        });
        if (!ok) {
          console.log(chalk.dim('  Aborted.'));
          return;
        }
      }

      rmSync(tenantDir, { recursive: true, force: true });
      console.log(chalk.green(`  ✓ Tenant "${slug}" removed.`));
    });

  // info
  cmd
    .command('info <slug>')
    .description('Show full config for a tenant')
    .option('--cwd <path>', 'workspace root', process.cwd())
    .option('--tenants-dir <path>', 'path to tenants directory (overrides <cwd>/tenants)')
    .action((slug: string, opts: { cwd: string; tenantsDir?: string }) => {
      const tenantsDir = opts.tenantsDir ? resolve(opts.tenantsDir) : join(resolve(opts.cwd), 'tenants');
      const cfg = readConfig(tenantsDir, slug);

      console.log(`\n  ${chalk.bold(String(cfg['name'] ?? slug))} ${chalk.dim(`(${slug})`)}`);
      console.log();

      for (const [key, val] of Object.entries(cfg)) {
        if (key === 'telegramBotToken') {
          console.log(`  ${chalk.dim(key.padEnd(20))} ${'[redacted]'}`);
          continue;
        }
        const display = Array.isArray(val) ? val.join(', ') : String(val);
        console.log(`  ${chalk.dim(key.padEnd(20))} ${display}`);
      }
      console.log();
    });

  return cmd;
}
