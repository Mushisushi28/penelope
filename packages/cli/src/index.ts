#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { printBanner } from './banner.js';
import { makeInitCommand } from './commands/init.js';
import { makeUpCommand } from './commands/up.js';
import { makeStatusCommand } from './commands/status.js';
import { makeTenantCommand } from './commands/tenant.js';
import { makeSendCommand } from './commands/send.js';
import { makeDoctorCommand } from './commands/doctor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read version from package.json
const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

// ── Program ───────────────────────────────────────────────────────────────────
const program = new Command();

program
  .name('penelope')
  .description('She runs the home while Odysseus is away — Penelope CLI')
  .version(pkg.version, '-v, --version', 'print version')
  .addHelpText(
    'before',
    `
  Penelope — self-hosted small business OS
  One Telegram chat replaces every digital tool.
`
  );

// Print banner when no command or --help is given
program.hook('preAction', (_thisCommand, actionCommand) => {
  if (actionCommand.name() === 'init') {
    printBanner(pkg.version);
  }
});

// ── Commands ──────────────────────────────────────────────────────────────────
program.addCommand(makeInitCommand());
program.addCommand(makeUpCommand());
program.addCommand(makeStatusCommand());
program.addCommand(makeTenantCommand());
program.addCommand(makeSendCommand());
program.addCommand(makeDoctorCommand());

// ── Default: show help ────────────────────────────────────────────────────────
if (process.argv.length <= 2) {
  printBanner(pkg.version);
  program.help();
}

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
