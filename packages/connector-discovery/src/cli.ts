/**
 * cli.ts — `penelope connector discover <service>` command.
 *
 * Wired into @penelope/cli as a sub-command of `penelope connector`.
 * Can also be run standalone:
 *   npx @penelope/connector-discovery <service-name>
 *   PENELOPE_OWNER_EMAIL=me@example.com npx @penelope/connector-discovery "Toast POS"
 */

import { Command } from "commander";
import type { DiscoveryTier } from "./types.js";

// Lazy-load heavy deps so the CLI starts fast
async function run(service: string, opts: {
  email?: string;
  capabilities?: string;
  skipTiers?: string;
  outputDir?: string;
  verbose?: boolean;
}): Promise<void> {
  const { discoverConnector } = await import("./cascade.js");
  const { formatPromoteSuggestion } = await import("./promote.js");

  const owner_email = opts.email ?? process.env["PENELOPE_OWNER_EMAIL"] ?? "unknown@example.com";
  const capList = (opts.capabilities ?? "login,list-items")
    .split(",")
    .map((c) => c.trim()) as import("./types.js").CapabilityKind[];
  const skipTiers = (opts.skipTiers ?? "")
    .split(",")
    .map((t) => parseInt(t, 10))
    .filter((n) => n >= 1 && n <= 5) as DiscoveryTier[];

  console.log(`\nPenelope Connector Discovery`);
  console.log(`Service:      ${service}`);
  console.log(`Capabilities: ${capList.join(", ")}`);
  console.log(`Owner email:  ${owner_email}`);
  console.log("");

  const tierLabels: Record<number, string> = {
    1: "MCP registry",
    2: "API skill",
    3: "OpenAPI spec",
    4: "Browser recipe",
    5: "Computer-use",
  };

  let lastTierAttempted = 0;

  const result = await discoverConnector(
    { service, capabilities: capList, owner_email, skipTiers },
    {
      recipeOptions: opts.outputDir ? { outputDir: opts.outputDir } : undefined,
      onTierResult(tier, hit, evidence) {
        lastTierAttempted = tier;
        const label = tierLabels[tier] ?? `Tier ${tier}`;
        const icon = hit ? "✓" : "✗";
        console.log(`  [${icon}] Tier ${tier} (${label}): ${hit ? "HIT" : "miss"}`);
        if (opts.verbose && evidence.length > 0) {
          for (const ev of evidence) {
            const q = ev.query ? ` [${ev.query.slice(0, 60)}]` : "";
            console.log(`      ${ev.source}${q} → ${ev.outcome}: ${ev.detail.slice(0, 80)}`);
          }
        }
      },
    }
  );

  console.log(`\nResult:`);
  console.log(`  Tier:       ${result.tier} (${tierLabels[result.tier] ?? "unknown"})`);
  console.log(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`);

  const spec = result.connector_spec;
  switch (spec.kind) {
    case "mcp":
      console.log(`  Kind:       MCP server`);
      console.log(`  Package:    ${spec.packageName}@${spec.version}`);
      console.log(`  Install:    ${spec.installCommand}`);
      break;
    case "api-skill":
      console.log(`  Kind:       API skill`);
      console.log(`  Path:       ${spec.packagePath}`);
      console.log(`  Symbol:     ${spec.exportedSymbol}`);
      if (spec.requiredEnv.length > 0) {
        console.log(`  Env vars:   ${spec.requiredEnv.join(", ")}`);
      }
      break;
    case "openapi":
      console.log(`  Kind:       OpenAPI spec`);
      console.log(`  Spec URL:   ${spec.specUrl}`);
      console.log(`  Title:      ${spec.title} v${spec.version}`);
      if (spec.hermesRegistrationId) {
        console.log(`  Hermes ID:  ${spec.hermesRegistrationId}`);
      }
      break;
    case "recipe":
    case "computer-use": {
      const recipe = spec.kind === "recipe" ? spec.recipe : spec.recipe;
      if (recipe) {
        console.log(`  Kind:       ${spec.kind === "recipe" ? "Browser recipe" : "Computer-use recording"}`);
        console.log(`  Recipe:     ${recipe.name}`);
        console.log(`  Steps:      ${recipe.steps.length}`);
        console.log(`  Selectors:  ${recipe.selectors.join(", ").slice(0, 80) || "(none)"}`);
        if (recipe.requiredEnv.length > 0) {
          console.log(`  Env vars:   ${recipe.requiredEnv.join(", ")}`);
        }
        if (opts.outputDir) {
          console.log(`  Saved to:   ${opts.outputDir}/${recipe.name}.yaml`);
        }
      }
      break;
    }
  }

  console.log(`\nEvidence trail (${result.evidence.length} entries):`);
  for (const ev of result.evidence) {
    const q = ev.query ? ` [${ev.query.slice(0, 50)}]` : "";
    console.log(`  tier-${ev.tier} ${ev.source}${q}: ${ev.outcome}`);
  }

  void lastTierAttempted; // consumed via onTierResult above
  void formatPromoteSuggestion; // available for callers who want it

  console.log(`\nDone.\n`);
}

// ── Commander command factory ─────────────────────────────────────────────────

export function makeConnectorDiscoverCommand(): Command {
  const cmd = new Command("discover");
  cmd
    .description("Discover and auto-configure an integration for a named service")
    .argument("<service>", 'Service name, e.g. "Toast POS" or "Vagaro"')
    .option("-e, --email <email>", "Owner email for evidence trail and promote notifications")
    .option(
      "-c, --capabilities <caps>",
      'Comma-separated capabilities to probe, e.g. "login,list-items,send-message"',
      "login,list-items"
    )
    .option(
      "--skip-tiers <tiers>",
      "Comma-separated tier numbers to skip, e.g. \"1,2\" to start from OpenAPI",
      ""
    )
    .option("-o, --output-dir <dir>", "Directory to write recipe YAML files")
    .option("-v, --verbose", "Print detailed evidence for each tier attempt")
    .action(async (service: string, options: {
      email?: string;
      capabilities?: string;
      skipTiers?: string;
      outputDir?: string;
      verbose?: boolean;
    }) => {
      try {
        await run(service, options);
      } catch (err) {
        console.error(`\nDiscovery failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  return cmd;
}

/** Standalone entry point when this package is invoked directly */
export async function main(): Promise<void> {
  const program = new Command();
  program
    .name("penelope-discover")
    .description("Penelope connector discovery — find the best integration for any service")
    .version("0.2.0");

  const connector = new Command("connector");
  connector.addCommand(makeConnectorDiscoverCommand());
  program.addCommand(connector);

  // Allow `penelope-discover <service>` without the `connector discover` prefix
  program
    .argument("[service]", "Service to discover (shorthand)")
    .option("-e, --email <email>", "Owner email")
    .option("-c, --capabilities <caps>", "Capabilities", "login,list-items")
    .option("--skip-tiers <tiers>", "Skip tiers", "")
    .option("-o, --output-dir <dir>", "Output directory")
    .option("-v, --verbose", "Verbose output")
    .action(async (service: string | undefined, opts) => {
      if (!service) {
        program.help();
        return;
      }
      try {
        await run(service, opts as Parameters<typeof run>[1]);
      } catch (err) {
        console.error(`Discovery failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}
