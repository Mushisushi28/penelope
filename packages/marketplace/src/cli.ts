#!/usr/bin/env node
/**
 * @penelope/marketplace — CLI subcommand
 * Usage:
 *   penelope marketplace list
 *   penelope marketplace install <id>
 *   penelope marketplace promote <id>
 */

import { loadRegistry, getItem } from "./registry.js";
import { installFromUrl, promote, readAuditLog } from "./install.js";
import { join } from "node:path";

const TENANTS_ROOT = process.env["PENELOPE_TENANTS_ROOT"] ?? join(process.cwd(), "tenants-root");
const TENANT_ID = process.env["PENELOPE_TENANT_ID"] ?? "default";

async function cmdList(): Promise<void> {
  const items = await loadRegistry();
  if (items.length === 0) {
    console.log("No items in registry (remote may be empty).");
    return;
  }
  const col = (s: string, w: number) => s.padEnd(w).slice(0, w);
  console.log(col("ID", 36) + col("Kind", 12) + col("Version", 10) + "Name");
  console.log("-".repeat(80));
  for (const item of items) {
    console.log(col(item.id, 36) + col(item.kind, 12) + col(item.version, 10) + item.name);
  }
}

async function cmdInstall(id: string): Promise<void> {
  const manifest = await getItem(id);
  if (!manifest) {
    console.error(`Item "${id}" not found in registry.`);
    process.exit(1);
  }
  const result = await installFromUrl(manifest, {
    tenantId: TENANT_ID,
    tenantsRoot: TENANTS_ROOT,
    sandbox: true,
  });
  console.log(result.message);
}

async function cmdPromote(id: string): Promise<void> {
  const manifest = await getItem(id);
  if (!manifest) {
    console.error(`Item "${id}" not found in registry.`);
    process.exit(1);
  }

  // Read TOTP from env or prompt user
  const totpCode = process.env["PENELOPE_TOTP"] ?? "";
  if (!totpCode) {
    console.error("PENELOPE_TOTP env var required for promote.");
    process.exit(1);
  }

  const result = await promote({
    tenantId: TENANT_ID,
    tenantsRoot: TENANTS_ROOT,
    manifest,
    totpCode,
  });
  console.log(result.message);
}

async function cmdAudit(): Promise<void> {
  const entries = await readAuditLog(TENANTS_ROOT);
  if (entries.length === 0) {
    console.log("No audit entries.");
    return;
  }
  for (const e of entries) {
    console.log(`${e.at} [${e.action}] ${e.itemId}@${e.version} by ${e.operator} sandbox=${e.sandbox}`);
  }
}

// ---------------------------------------------------------------------------
// entrypoint
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const [, , sub, arg] = process.argv;

  switch (sub) {
    case "list":
      await cmdList();
      break;
    case "install":
      if (!arg) { console.error("Usage: penelope marketplace install <id>"); process.exit(1); }
      await cmdInstall(arg);
      break;
    case "promote":
      if (!arg) { console.error("Usage: penelope marketplace promote <id>"); process.exit(1); }
      await cmdPromote(arg);
      break;
    case "audit":
      await cmdAudit();
      break;
    default:
      console.log("Usage: penelope marketplace <list|install <id>|promote <id>|audit>");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
