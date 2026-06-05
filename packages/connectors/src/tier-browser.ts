/**
 * @penelope/connectors — Tier 4: Browser automation connector
 *
 * Uses the open-claude-in-chrome MCP extension to drive a Chrome profile
 * via the browser extension's MCP server.  Suitable for services with a
 * web UI but no public API (e.g. Acuity Scheduling, Yelp, Google Business
 * Profile review requests).
 *
 * Each tenant supplies:
 *   - A Chrome profile name (matches a profile in the CCEMOD registry).
 *   - A "recipe" describing the sequence of steps: navigate, find element,
 *     fill, click, wait.
 *
 * The connector forwards the recipe to the extension MCP server which
 * controls the actual browser window.
 */

import type {
  Capability,
  Category,
  Connector,
  Tier,
  TenantConfig,
} from "./types.js";
import type { SecretRef } from "@penelope/secrets";

// ─── Recipe types ──────────────────────────────────────────────────────────────

export type RecipeStep =
  | { action: "navigate"; url: string }
  | { action: "find"; query: string }
  | { action: "fill"; uid: string; value: string }
  | { action: "click"; uid: string }
  | { action: "wait"; text: string; timeoutMs?: number }
  | { action: "screenshot" }
  | { action: "evaluate"; script: string };

export interface BrowserRecipe {
  /** Human label for logging. */
  name: string;
  /** Ordered list of browser actions to execute. */
  steps: RecipeStep[];
}

export interface BrowserTenantConfig {
  /** CCEMOD Chrome profile name, e.g. "dhr", "personal". */
  chromeProfile: string;
  /**
   * Base URL for the CCEMOD MCP server.
   * Defaults to http://localhost:4918 (CCEMOD default port).
   */
  mcpBaseUrl?: string;
  /**
   * Map from operation name → BrowserRecipe.
   * Populated at tenant setup time.
   */
  recipes: Record<string, BrowserRecipe>;
}

// ─── Base class ───────────────────────────────────────────────────────────────

export abstract class BrowserConnector implements Connector {
  abstract readonly id: string;
  abstract readonly displayName: string;
  abstract readonly description: string;
  abstract readonly category: Category;
  abstract readonly capabilities: ReadonlyArray<Capability>;

  readonly tier: Tier = "browser";

  protected chromeProfile = "default";
  protected mcpBaseUrl = "http://localhost:4918";
  protected recipes: Record<string, BrowserRecipe> = {};
  private _ready = false;

  async init(tenant: TenantConfig, _secrets: SecretRef): Promise<void> {
    const cfg = (tenant.settings?.["browser"] ?? {}) as Partial<BrowserTenantConfig>;
    this.chromeProfile = cfg.chromeProfile ?? "default";
    this.mcpBaseUrl = cfg.mcpBaseUrl ?? "http://localhost:4918";
    this.recipes = cfg.recipes ?? this.defaultRecipes();
    this._ready = true;
  }

  /**
   * Subclasses may return built-in recipes that apply without per-tenant config.
   */
  protected defaultRecipes(): Record<string, BrowserRecipe> {
    return {};
  }

  async invoke(op: string, args: unknown): Promise<unknown> {
    if (!this._ready) {
      throw new Error(`[BrowserConnector:${this.id}] not initialised`);
    }
    const recipe = this.recipes[op];
    if (!recipe) {
      throw new Error(`[BrowserConnector:${this.id}] no recipe for op: ${op}`);
    }
    return this._executeRecipe(recipe, args);
  }

  async healthCheck(): Promise<{ ok: boolean; details?: string }> {
    if (!this._ready) return { ok: false, details: "not initialised" };
    try {
      const res = await fetch(`${this.mcpBaseUrl}/health`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (res.ok) return { ok: true };
      return { ok: false, details: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, details: `CCEMOD MCP unreachable: ${err}` };
    }
  }

  // ─── Private: recipe execution ────────────────────────────────────────────────

  private async _executeRecipe(
    recipe: BrowserRecipe,
    args: unknown
  ): Promise<unknown> {
    const argsObj =
      args !== null && typeof args === "object"
        ? (args as Record<string, unknown>)
        : {};

    const results: unknown[] = [];

    for (const step of recipe.steps) {
      const result = await this._executeStep(step, argsObj);
      results.push(result);
    }

    return results;
  }

  private async _executeStep(
    step: RecipeStep,
    args: Record<string, unknown>
  ): Promise<unknown> {
    // Template-substitute {{key}} placeholders in string fields.
    const interpolate = (s: string): string =>
      s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(args[k] ?? ""));

    const body: Record<string, unknown> = {
      profile: this.chromeProfile,
      ...this._stepToMcpParams(step, interpolate),
    };

    const res = await fetch(`${this.mcpBaseUrl}/tool/${step.action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `[BrowserConnector:${this.id}] step "${step.action}" failed: HTTP ${res.status} — ${text.slice(0, 200)}`
      );
    }

    return res.json();
  }

  private _stepToMcpParams(
    step: RecipeStep,
    interpolate: (s: string) => string
  ): Record<string, unknown> {
    switch (step.action) {
      case "navigate":
        return { url: interpolate(step.url) };
      case "find":
        return { query: interpolate(step.query) };
      case "fill":
        return { uid: step.uid, value: interpolate(step.value) };
      case "click":
        return { uid: step.uid };
      case "wait":
        return {
          text: interpolate(step.text),
          timeout: step.timeoutMs ?? 10_000,
        };
      case "screenshot":
        return {};
      case "evaluate":
        return { function: interpolate(step.script) };
    }
  }
}
