/**
 * computer-use-fallback.ts — Tier-5 discovery: Anthropic computer-use beta.
 *
 * Used ONLY as a last resort when tiers 1-4 have failed and the service has no
 * publicly accessible web UI.  Most commonly needed for desktop applications or
 * services that require authentication before showing any meaningful DOM.
 *
 * The session is driven via the Anthropic SDK with:
 *   tools: [computer_20250124, bash_20250124, text_editor_20250124]
 *
 * Each action taken during the session is recorded and can be replayed as a
 * ComputerUseAction[] or collapsed into a Recipe.
 *
 * IMPORTANT: do NOT invoke real computer-use sessions in tests.  Inject a
 * mock via the `ComputerUseClient` interface.
 */

import type {
  DiscoveryRequest,
  DiscoveryResult,
  ComputerUseConnectorSpec,
  ComputerUseAction,
  Evidence,
  CapabilityKind,
} from "./types.js";
import type { Recipe } from "./types.js";

// ── Computer-use client interface (DI point) ──────────────────────────────────

export interface ComputerUseSession {
  /** Run the session against the given goal prompt and return recorded actions */
  run(goalPrompt: string): Promise<ComputerUseAction[]>;
  sessionId: string;
}

export interface ComputerUseClient {
  startSession(service: string): Promise<ComputerUseSession>;
}

// ── Real Anthropic SDK client (loaded lazily) ─────────────────────────────────

async function buildRealClient(): Promise<ComputerUseClient> {
  let Anthropic: typeof import("@anthropic-ai/sdk").default;
  try {
    const sdk = await import("@anthropic-ai/sdk");
    Anthropic = sdk.default;
  } catch {
    throw new Error(
      "@anthropic-ai/sdk is not installed.  " +
        "Run: npm install @anthropic-ai/sdk  — then retry."
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY env var is required for computer-use tier-5 discovery."
    );
  }

  const client = new Anthropic({ apiKey });

  return {
    async startSession(service: string): Promise<ComputerUseSession> {
      const sessionId = `cu-${service.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
      const actions: ComputerUseAction[] = [];

      return {
        sessionId,
        async run(goalPrompt: string): Promise<ComputerUseAction[]> {
          // Beta tool shapes are not in the stable SDK types; cast to unknown[] for dispatch.
          const tools: unknown[] = [
            { type: "computer_20250124", name: "computer", display_width_px: 1280, display_height_px: 960, display_number: 1 },
            { type: "bash_20250124", name: "bash" },
            { type: "text_editor_20250124", name: "str_replace_editor" },
          ];

          const response = await (client.messages.create as Function)({
            model: "claude-opus-4-5",
            max_tokens: 4096,
            tools,
            messages: [{ role: "user", content: goalPrompt }],
            betas: ["computer-use-2025-01-24"],
          });

          // Parse tool_use blocks into ComputerUseAction records
          for (const block of response.content ?? []) {
            if (block.type === "tool_use" && block.name === "computer") {
              const input = block.input as Record<string, unknown>;
              const action: ComputerUseAction = {
                type: (input["action"] as ComputerUseAction["type"]) ?? "screenshot",
                coordinate: input["coordinate"] as [number, number] | undefined,
                text: input["text"] as string | undefined,
                key: input["key"] as string | undefined,
                direction: input["direction"] as "up" | "down" | undefined,
                amount: input["amount"] as number | undefined,
                timestamp: new Date().toISOString(),
              };
              actions.push(action);
            }
          }

          return actions;
        },
      };
    },
  };
}

// ── Actions → Recipe conversion ───────────────────────────────────────────────

function actionsToRecipe(
  service: string,
  baseUrl: string,
  capabilities: CapabilityKind[],
  actions: ComputerUseAction[]
): Recipe {
  const steps = actions.map((a, i) => ({
    description: `Step ${i + 1}: ${a.type}`,
    action:
      a.type === "screenshot"
        ? { type: "screenshot" as const, label: `step-${i + 1}` }
        : a.type === "left_click" && a.coordinate
          ? { type: "click" as const, selector: `[data-cu-coord="${a.coordinate.join(",")}"]` }
          : a.type === "type" && a.text
            ? { type: "fill" as const, selector: "body", value: a.text }
            : { type: "screenshot" as const, label: `step-${i + 1}` },
  }));

  return {
    name: `${service.toLowerCase().replace(/\s+/g, "-")}-cu-recipe`,
    service,
    version: "0.1.0",
    createdAt: new Date().toISOString(),
    steps,
    selectors: [],
    waits: [],
    requiredEnv: ["SERVICE_EMAIL", "SERVICE_PASSWORD"],
  };
}

// ── Goal prompt builder ───────────────────────────────────────────────────────

function buildGoalPrompt(service: string, capabilities: CapabilityKind[]): string {
  const capList = capabilities.join(", ");
  return (
    `You are a Penelope connector discovery agent.\n` +
    `Your goal: demonstrate how to use the "${service}" application/website\n` +
    `to perform these operations: ${capList}.\n\n` +
    `Instructions:\n` +
    `1. Take a screenshot first to see the current state.\n` +
    `2. Navigate to the service login page if needed.\n` +
    `3. For each capability requested, navigate to the relevant screen and\n` +
    `   take a screenshot to record the state.\n` +
    `4. Record selectors or UI element descriptions for each action.\n` +
    `5. Do NOT submit real data — stop at each form without submitting.\n`
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface ComputerUseFallbackOptions {
  /** Injected mock client (used in tests) */
  client?: ComputerUseClient;
}

function now(): string {
  return new Date().toISOString();
}

function baseUrlFor(service: string, override?: string): string {
  if (override) return override.replace(/\/$/, "");
  const slug = service.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `https://${slug}.com`;
}

export async function computerUseFallback(
  req: DiscoveryRequest,
  opts: ComputerUseFallbackOptions = {}
): Promise<DiscoveryResult> {
  const evidence: Evidence[] = [];
  const base = baseUrlFor(req.service, req.baseUrl);

  const client: ComputerUseClient = opts.client ?? (await buildRealClient());

  let session: ComputerUseSession;
  try {
    session = await client.startSession(req.service);
  } catch (err) {
    evidence.push({
      tier: 5,
      source: "computer-use-beta",
      query: req.service,
      outcome: "error",
      detail: `Failed to start session: ${String(err)}`,
      at: now(),
    });
    throw err;
  }

  evidence.push({
    tier: 5,
    source: "computer-use-beta",
    query: req.service,
    outcome: "hit",
    detail: `Session started: ${session.sessionId}`,
    at: now(),
  });

  const goalPrompt = buildGoalPrompt(req.service, req.capabilities);
  const actions = await session.run(goalPrompt);

  evidence.push({
    tier: 5,
    source: "computer-use-actions",
    query: goalPrompt.slice(0, 80),
    outcome: actions.length > 0 ? "hit" : "miss",
    detail: `Recorded ${actions.length} actions`,
    at: now(),
  });

  const recipe = actionsToRecipe(req.service, base, req.capabilities, actions);

  const spec: ComputerUseConnectorSpec = {
    kind: "computer-use",
    sessionId: session.sessionId,
    actions,
    recipe,
  };

  return {
    tier: 5,
    connector_spec: spec,
    confidence: 0.50,
    evidence,
  };
}
