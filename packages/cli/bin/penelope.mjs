#!/usr/bin/env node
// Penelope CLI entry point
// This file is the shebang binary. It delegates to the compiled dist/index.js.

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distEntry = join(__dirname, '..', 'dist', 'index.js');

if (!existsSync(distEntry)) {
  console.error(
    '\n  penelope: dist/index.js not found.\n' +
    '  Run `npm run build` inside packages/cli first.\n'
  );
  process.exit(1);
}

// Use pathToFileURL so Windows absolute paths are valid ESM URLs.
await import(pathToFileURL(distEntry).href);
