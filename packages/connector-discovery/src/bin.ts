#!/usr/bin/env node
/**
 * Standalone CLI entry point.
 * Wired via package.json bin.penelope-discover → dist/bin.js
 */

import { main } from "./cli.js";

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
