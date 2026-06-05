/**
 * One-shot migration: v0.1 plain .secrets/*.json → v0.2 OS vault.
 *
 * Plain file format (v0.1):
 *   tenants/<tenantId>/.secrets/<key>.json   →   { "value": "<secret>" }
 *
 * Usage (programmatic):
 *   await migrateFromPlain({ tenantsDir, store, dryRun: false });
 *
 * Usage (CLI):
 *   node migrate-from-plain.js [--dry-run] [--cwd <path>]
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join, basename, extname } from 'node:path';
import { SecretRef, SecretStore } from './types.js';

export interface MigrationOptions {
  /** Absolute path to the tenants/ directory. */
  tenantsDir: string;
  /** Target store to write secrets into. */
  store: SecretStore;
  /**
   * When true, only log actions — do not write to the store or delete files.
   * @default false
   */
  dryRun?: boolean;
  /** Called for each action (info, warn, error). Default: console.log. */
  log?: (level: 'info' | 'warn' | 'error', message: string) => void;
}

export interface MigrationResult {
  migrated: SecretRef[];
  skipped: string[];
  errors: Array<{ path: string; error: string }>;
}

/**
 * Migrate all v0.1 plain-file secrets in `tenantsDir` to the given store.
 */
export async function migrateFromPlain(opts: MigrationOptions): Promise<MigrationResult> {
  const { tenantsDir, store, dryRun = false } = opts;
  const log = opts.log ?? ((level, msg) => console[level === 'info' ? 'log' : level](msg));

  const result: MigrationResult = { migrated: [], skipped: [], errors: [] };

  if (!existsSync(tenantsDir)) {
    log('warn', `Tenants directory not found: ${tenantsDir}`);
    return result;
  }

  const tenantDirs = readdirSync(tenantsDir).filter((d) => {
    const p = join(tenantsDir, d);
    return statSync(p).isDirectory() && existsSync(join(p, 'tenant.json'));
  });

  for (const tenantId of tenantDirs) {
    const secretsDir = join(tenantsDir, tenantId, '.secrets');
    if (!existsSync(secretsDir)) continue;

    const files = readdirSync(secretsDir).filter(
      (f) => extname(f) === '.json' && statSync(join(secretsDir, f)).isFile()
    );

    for (const file of files) {
      const filePath = join(secretsDir, file);
      const key = basename(file, '.json');
      const ref: SecretRef = { tenantId, key };

      try {
        const raw = readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw) as { value?: string } | string;
        const value =
          typeof parsed === 'string'
            ? parsed
            : (parsed as { value?: string }).value ?? '';

        if (!value) {
          log('warn', `[skip] ${tenantId}/${key} — empty value`);
          result.skipped.push(filePath);
          continue;
        }

        log('info', `[${dryRun ? 'dry-run' : 'migrate'}] ${tenantId}/${key}`);

        if (!dryRun) {
          await store.set(ref, value);
          // Remove the plain file after successful store write
          rmSync(filePath);
          // Remove .secrets dir if now empty
          const remaining = readdirSync(secretsDir);
          if (remaining.length === 0) {
            rmSync(secretsDir, { recursive: true, force: true });
          }
        }

        result.migrated.push(ref);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log('error', `[error] ${tenantId}/${key}: ${message}`);
        result.errors.push({ path: filePath, error: message });
      }
    }
  }

  return result;
}

// ── CLI entry point ───────────────────────────────────────────────────────────

if (
  process.argv[1] != null &&
  (process.argv[1].endsWith('migrate-from-plain.ts') ||
    process.argv[1].endsWith('migrate-from-plain.js'))
) {
  const { detectStore } = await import('./detect.js');
  const { resolve } = await import('node:path');

  const dryRun = process.argv.includes('--dry-run');
  const cwdIdx = process.argv.indexOf('--cwd');
  const cwd = cwdIdx !== -1 ? process.argv[cwdIdx + 1] : process.cwd();
  const tenantsDir = resolve(cwd, 'tenants');

  const store = await detectStore();
  console.log(`Using store: ${store.capabilities().backend}`);
  console.log(`Tenants dir: ${tenantsDir}`);
  if (dryRun) console.log('DRY RUN — no changes will be made');

  const result = await migrateFromPlain({ tenantsDir, store, dryRun });
  console.log(`\nMigrated: ${result.migrated.length}`);
  console.log(`Skipped:  ${result.skipped.length}`);
  console.log(`Errors:   ${result.errors.length}`);
  if (result.errors.length > 0) process.exit(1);
}
