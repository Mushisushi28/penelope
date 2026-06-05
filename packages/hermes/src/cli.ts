/**
 * @penelope/hermes CLI
 *
 * Commands:
 *   hermes add-connector <url> --name <name> [--api-key-env VAR] [--max N]
 *   hermes list
 *   hermes invoke <connectorId> <operationId> [--arg key=value] [--secret ENVVAR=value]
 */

import { parseArgs } from 'node:util';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { discoverFromOpenApi } from './discovery/openapi.js';
import { ConnectorRegistry } from './registry.js';
import { buildRequest, findOp } from './invoke.js';
import type { AuthStrategy, TenantCredentials } from './types.js';

const CONNECTORS_DIR = resolve('connectors');

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    strict: false,
    options: {
      name: { type: 'string' },
      'api-key-env': { type: 'string' },
      max: { type: 'string' },
      arg: { type: 'string', multiple: true },
      secret: { type: 'string', multiple: true },
      help: { type: 'boolean', short: 'h' },
    },
  });

  const command = positionals[0];

  if (values.help || !command) {
    printHelp();
    process.exit(0);
  }

  switch (command) {
    case 'add-connector':
      await cmdAddConnector(positionals, values as Record<string, unknown>);
      break;
    case 'list':
      await cmdList();
      break;
    case 'invoke':
      await cmdInvoke(positionals, values as Record<string, unknown>);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

async function cmdAddConnector(
  positionals: string[],
  values: Record<string, unknown>
): Promise<void> {
  const specUrl = positionals[1];
  if (!specUrl) {
    console.error('Error: URL required — hermes add-connector <url> --name <name>');
    process.exit(1);
  }

  const name = values['name'] as string | undefined;
  if (!name) {
    console.error('Error: --name is required');
    process.exit(1);
  }

  const connectorId = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const apiKeyEnv = values['api-key-env'] as string | undefined;
  const maxStr = values['max'] as string | undefined;
  const maxOperations = maxStr ? parseInt(maxStr, 10) : undefined;

  const authStrategy: AuthStrategy = {
    type: 'api-key',
    placement: 'header',
    headerName: 'Authorization',
    prefix: 'Bearer ',
    envVar: apiKeyEnv ?? `${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`,
  };

  console.log(`\nHermes: discovering "${name}" from ${specUrl} ...`);
  const start = Date.now();

  const result = await discoverFromOpenApi({
    specUrl,
    authStrategy,
    connectorId,
    connectorName: name,
    maxOperations,
  });

  const elapsed = Date.now() - start;
  const { connector, warnings } = result;

  console.log(`\nDiscovery complete (${elapsed}ms)`);
  console.log(`  Operations: ${connector.operations.length} (total in spec: ${result.totalOperations})`);
  console.log(`  Base URL:   ${connector.baseUrl}`);
  console.log(`  Version:    ${connector.version}`);

  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of warnings) console.log(`  ! ${w}`);
  }

  mkdirSync(CONNECTORS_DIR, { recursive: true });
  const outPath = join(CONNECTORS_DIR, `${connectorId}.connector.json`);
  writeFileSync(outPath, JSON.stringify(connector, null, 2), 'utf-8');
  console.log(`\nSaved to: ${outPath}`);
}

async function cmdList(): Promise<void> {
  const registry = new ConnectorRegistry(CONNECTORS_DIR);
  const connectors = registry.list();
  if (connectors.length === 0) {
    console.log('No connectors found. Run: hermes add-connector <url> --name <name>');
    return;
  }
  console.log(`\n${'ID'.padEnd(22)} ${'Name'.padEnd(24)} ${'Ops'.padStart(6)}  Discovered`);
  console.log('-'.repeat(70));
  for (const c of connectors) {
    console.log(
      `${c.id.padEnd(22)} ${c.name.padEnd(24)} ${String(c.operations.length).padStart(6)}  ${c.discoveredAt.slice(0, 10)}`
    );
  }
  console.log();
}

async function cmdInvoke(
  positionals: string[],
  values: Record<string, unknown>
): Promise<void> {
  const connectorId = positionals[1];
  const operationId = positionals[2];
  if (!connectorId || !operationId) {
    console.error('Error: hermes invoke <connectorId> <operationId> [--arg key=value]');
    process.exit(1);
  }

  const registry = new ConnectorRegistry(CONNECTORS_DIR);
  const connector = registry.get(connectorId);
  if (!connector) {
    const ids = registry.list().map(c => c.id).join(', ') || '(none)';
    console.error(`Connector "${connectorId}" not found. Registered: ${ids}`);
    process.exit(1);
  }

  const op = findOp(connector, operationId);

  const args: Record<string, unknown> = {};
  const argArr = (values['arg'] as string[] | undefined) ?? [];
  for (const a of argArr) {
    const idx = a.indexOf('=');
    if (idx < 0) continue;
    args[a.slice(0, idx)] = a.slice(idx + 1);
  }

  const creds: TenantCredentials = {};
  const secretArr = (values['secret'] as string[] | undefined) ?? [];
  for (const s of secretArr) {
    const idx = s.indexOf('=');
    if (idx < 0) continue;
    creds[s.slice(0, idx)] = s.slice(idx + 1);
  }

  const req = buildRequest(connector, op, args, creds);
  console.log('\nResolved request:');
  console.log(JSON.stringify(req, null, 2));
}

function printHelp(): void {
  console.log(`
@penelope/hermes CLI

Commands:
  add-connector <url>  Discover and save a connector from an OpenAPI spec URL
  list                 List registered connectors
  invoke <id> <op>     Build and print the HTTP request for an operation (dry-run)

Options for add-connector:
  --name <name>        Connector name (required)
  --api-key-env <VAR>  Env var name for API key (default: NAME_API_KEY)
  --max <N>            Cap discovered operations

Options for invoke:
  --arg key=value      Operation arguments (repeat for multiple)
  --secret ENVVAR=val  Credential values (not committed)

Examples:
  hermes add-connector https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json --name Stripe
  hermes list
  hermes invoke stripe GetCustomers --arg limit=10 --secret STRIPE_API_KEY=sk_test_...
`);
}

main().catch(err => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
