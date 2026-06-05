/**
 * recipe-builder.ts — Tier-4 discovery: open the service's web UI via the
 * open-claude-in-chrome MCP server, observe the DOM, and record a replayable
 * YAML recipe.
 *
 * The MCP server is assumed to be running.  Connection mode is determined by:
 *   OPEN_CLAUDE_MCP_URL env var   → HTTP/SSE mode  (e.g. http://localhost:3100)
 *   (absent)                       → stdio mode    (spawns `open-claude-mcp`)
 *
 * The agent (Claude) is asked to identify CSS selectors for the requested
 * capabilities (login, list-items, create-item, send-message, …) and returns
 * a structured Recipe.
 *
 * During unit tests the MCP client is replaced by an injected mock via the
 * `BrowserClient` interface.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  DiscoveryRequest,
  DiscoveryResult,
  Recipe,
  RecipeConnectorSpec,
  RecipeStep,
  Evidence,
  CapabilityKind,
} from "./types.js";

// ── Browser client interface (dependency injection point) ─────────────────────

export interface DomElement {
  selector: string;
  tagName: string;
  text: string;
  role?: string;
  placeholder?: string;
}

export interface BrowserClient {
  navigate(url: string): Promise<void>;
  /** Snapshot of interactive elements on the current page */
  snapshot(): Promise<DomElement[]>;
  /** Take a screenshot and return a base64 data URL */
  screenshot(): Promise<string>;
  close(): Promise<void>;
}

// ── Real MCP browser client (lazily loaded) ───────────────────────────────────

async function buildRealClient(): Promise<BrowserClient> {
  const mcpUrl = process.env["OPEN_CLAUDE_MCP_URL"];

  if (mcpUrl) {
    // HTTP/SSE transport — connect to running MCP server
    const { OpenClaudeHttpClient } = await import("./browser/http-client.js").catch(() => {
      throw new Error(
        `open-claude-in-chrome HTTP client not found.  ` +
          `Ensure OPEN_CLAUDE_MCP_URL points to a running MCP server, ` +
          `or unset it to use stdio mode.`
      );
    });
    return new OpenClaudeHttpClient(mcpUrl);
  }

  // stdio mode — spawn the MCP binary
  const { OpenClaudeStdioClient } = await import("./browser/stdio-client.js").catch(() => {
    throw new Error(
      `open-claude-in-chrome stdio client not found.  ` +
        `Install the open-claude-mcp binary or set OPEN_CLAUDE_MCP_URL.`
    );
  });
  return new OpenClaudeStdioClient();
}

// ── Selector inference ────────────────────────────────────────────────────────

const CAPABILITY_HINTS: Record<CapabilityKind, string[]> = {
  login:         ["input[type=email]", "input[type=password]", "button[type=submit]", 'button:contains("Login")', 'button:contains("Sign in")'],
  "list-items":  ["table", "ul.items", '[data-testid*="list"]', '.results', '.items-list'],
  "create-item": ['button:contains("New")', 'button:contains("Create")', 'button:contains("Add")', 'a[href*="new"]'],
  "send-message": ["textarea", 'button:contains("Send")', '[data-testid*="message"]', ".compose"],
  "read-messages": ['.messages', '.inbox', '[data-testid*="message-list"]', '.thread'],
  search:        ['input[type=search]', '[role=searchbox]', '[placeholder*="Search"]'],
  "update-item": ['button:contains("Edit")', 'button:contains("Update")', '[data-testid*="edit"]'],
  "delete-item": ['button:contains("Delete")', 'button:contains("Remove")', '[data-testid*="delete"]'],
  "webhook-listen": [],
  custom:        [],
};

function inferSelector(elements: DomElement[], hints: string[]): string | null {
  for (const hint of hints) {
    // Strip pseudo-selectors like :contains() for simple matching
    const simplifiedHint = hint.replace(/:contains\([^)]+\)/g, "").trim();
    for (const el of elements) {
      if (
        el.selector.startsWith(simplifiedHint) ||
        (simplifiedHint.includes("[type=") && el.tagName.toLowerCase() === simplifiedHint.split("[")[0]) ||
        (el.role && hint.includes(el.role)) ||
        (el.text && hint.toLowerCase().includes(el.text.toLowerCase().slice(0, 8)))
      ) {
        return el.selector;
      }
    }
  }
  return hints[0] ?? null;
}

// ── Recipe assembly ───────────────────────────────────────────────────────────

function assembleRecipe(
  service: string,
  baseUrl: string,
  capabilities: CapabilityKind[],
  elements: DomElement[]
): Recipe {
  const steps: RecipeStep[] = [];
  const selectors: string[] = [];
  const waits: string[] = [];
  const requiredEnv: string[] = [];

  // Always start with navigation
  steps.push({ description: `Navigate to ${service}`, action: { type: "navigate", url: baseUrl } });

  for (const cap of capabilities) {
    const hints = CAPABILITY_HINTS[cap] ?? [];
    const sel = inferSelector(elements, hints);

    switch (cap) {
      case "login": {
        const emailSel = inferSelector(elements, ["input[type=email]", "input[type=text]"]) ?? "input[type=email]";
        const pwSel = inferSelector(elements, ["input[type=password]"]) ?? "input[type=password]";
        const submitSel = inferSelector(elements, ['button[type=submit]', 'button']) ?? "button[type=submit]";

        steps.push({ description: "Fill login email", action: { type: "fill", selector: emailSel, value: "${SERVICE_EMAIL}" } });
        steps.push({ description: "Fill login password", action: { type: "fill", selector: pwSel, value: "${SERVICE_PASSWORD}" } });
        steps.push({ description: "Submit login", action: { type: "submit", selector: submitSel } });
        steps.push({ description: "Wait for dashboard", action: { type: "wait-for", selector: "[data-page='dashboard'], .dashboard, main", timeout: 10000 } });

        selectors.push(emailSel, pwSel, submitSel);
        waits.push("[data-page='dashboard'], .dashboard, main");
        requiredEnv.push("SERVICE_EMAIL", "SERVICE_PASSWORD");
        break;
      }
      case "list-items": {
        const listSel = sel ?? "table";
        steps.push({ description: "Navigate to items list", action: { type: "wait-for", selector: listSel, timeout: 8000 } });
        steps.push({ description: "Extract items", action: { type: "extract", selector: listSel, as: "items" } });
        selectors.push(listSel);
        waits.push(listSel);
        break;
      }
      case "create-item": {
        const btnSel = sel ?? "button";
        steps.push({ description: "Click create button", action: { type: "click", selector: btnSel } });
        steps.push({ description: "Wait for form", action: { type: "wait-for", selector: "form, dialog, [role=dialog]", timeout: 5000 } });
        selectors.push(btnSel, "form");
        waits.push("form, dialog");
        break;
      }
      case "send-message": {
        const textSel = sel ?? "textarea";
        const sendSel = inferSelector(elements, ['button:contains("Send")']) ?? 'button[type=submit]';
        steps.push({ description: "Focus message composer", action: { type: "click", selector: textSel } });
        steps.push({ description: "Type message", action: { type: "fill", selector: textSel, value: "${MESSAGE_BODY}" } });
        steps.push({ description: "Send message", action: { type: "click", selector: sendSel } });
        selectors.push(textSel, sendSel);
        requiredEnv.push("MESSAGE_BODY");
        break;
      }
      default: {
        if (sel) {
          steps.push({ description: `Action: ${cap}`, action: { type: "click", selector: sel } });
          selectors.push(sel);
        }
      }
    }

    // Take screenshot after each capability block
    steps.push({ description: `Screenshot after ${cap}`, action: { type: "screenshot", label: cap } });
  }

  const uniqueSelectors = [...new Set(selectors)];
  const uniqueWaits = [...new Set(waits)];
  const uniqueEnv = [...new Set(requiredEnv)];

  return {
    name: `${service.toLowerCase().replace(/\s+/g, "-")}-recipe`,
    service,
    version: "0.1.0",
    createdAt: new Date().toISOString(),
    steps,
    selectors: uniqueSelectors,
    waits: uniqueWaits,
    requiredEnv: uniqueEnv,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface RecipeBuilderOptions {
  /** Injected browser client (used in tests) */
  client?: BrowserClient;
  /** Directory to save the YAML recipe file.  Defaults to process.cwd(). */
  outputDir?: string;
}

function now(): string {
  return new Date().toISOString();
}

function baseUrlFor(service: string, override?: string): string {
  if (override) return override.replace(/\/$/, "");
  const slug = service.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `https://${slug}.com`;
}

export async function buildRecipe(
  req: DiscoveryRequest,
  opts: RecipeBuilderOptions = {}
): Promise<DiscoveryResult> {
  const evidence: Evidence[] = [];
  const base = baseUrlFor(req.service, req.baseUrl);

  const client: BrowserClient = opts.client ?? (await buildRealClient());

  try {
    // Navigate to service
    await client.navigate(base);
    evidence.push({
      tier: 4,
      source: "open-claude-in-chrome",
      query: base,
      outcome: "hit",
      detail: `Navigated to ${base}`,
      at: now(),
    });

    const elements = await client.snapshot();
    evidence.push({
      tier: 4,
      source: "dom-snapshot",
      query: base,
      outcome: elements.length > 0 ? "hit" : "miss",
      detail: `Captured ${elements.length} interactive elements`,
      at: now(),
    });

    const recipe = assembleRecipe(req.service, base, req.capabilities, elements);

    // Persist YAML to outputDir if provided
    if (opts.outputDir) {
      try {
        const { dump } = await import("js-yaml");
        const yaml = dump(recipe, { lineWidth: 120 });
        const filename = `${recipe.name}.yaml`;
        writeFileSync(join(opts.outputDir, filename), yaml, "utf-8");
        evidence.push({
          tier: 4,
          source: "recipe-file",
          query: filename,
          outcome: "hit",
          detail: `Recipe written to ${join(opts.outputDir, filename)}`,
          at: now(),
        });
      } catch {
        // js-yaml may not be installed; skip file write
      }
    }

    const spec: RecipeConnectorSpec = { kind: "recipe", recipe };
    return { tier: 4, connector_spec: spec, confidence: 0.65, evidence };
  } finally {
    await client.close();
  }
}
