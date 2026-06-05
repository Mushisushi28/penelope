/**
 * @penelope/connectors — Tier 5: Computer-use connector
 *
 * Last-resort tier for legacy desktop apps, ancient ERPs, or any service
 * that has no web layer and no API.  Dispatches an Anthropic claude-opus-4
 * agent with the computer-use beta tools (screenshot, mouse, keyboard).
 *
 * THIS IS THE MOST EXPENSIVE AND LEAST RELIABLE TIER.
 * Use only when tiers 1–4 genuinely cannot serve the operation.
 *
 * Per-tenant config: a natural-language goal template.
 * The connector fills {{placeholders}} from invoke args, then sends the
 * goal to the Opus agent via the Anthropic Messages API with the
 * computer-use beta tool set.
 */

import type {
  Capability,
  Category,
  Connector,
  Tier,
  TenantConfig,
} from "./types.js";
import type { SecretRef } from "@penelope/secrets";

// ─── Computer-use goal config ─────────────────────────────────────────────────

export interface ComputerUseGoal {
  /**
   * Natural-language goal template.
   * May include {{key}} placeholders replaced from invoke args.
   * Example: "Open QuickBooks and create an invoice for {{customerName}}
   *           totalling {{amount}} USD. Screenshot the result."
   */
  goalTemplate: string;
  /**
   * Maximum number of agentic turns before the task is aborted.
   * Defaults to 20.
   */
  maxTurns?: number;
}

// ─── Anthropic computer-use API types (minimal subset) ────────────────────────

interface CuTextContent {
  type: "text";
  text: string;
}

interface CuToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

interface CuToolResultContent {
  type: "tool_result";
  tool_use_id: string;
  content: unknown;
}

type MessageContent = CuTextContent | CuToolUseContent | CuToolResultContent;

interface CuMessage {
  role: "user" | "assistant";
  content: MessageContent[] | string;
}

interface CuResponse {
  stop_reason: "end_turn" | "tool_use" | string;
  content: MessageContent[];
}

// ─── Base class ───────────────────────────────────────────────────────────────

export abstract class ComputerUseConnector implements Connector {
  abstract readonly id: string;
  abstract readonly displayName: string;
  abstract readonly description: string;
  abstract readonly category: Category;
  abstract readonly capabilities: ReadonlyArray<Capability>;

  readonly tier: Tier = "computer-use";

  protected apiKey = "";
  protected goals: Record<string, ComputerUseGoal> = {};
  private _ready = false;

  async init(tenant: TenantConfig, _secrets: SecretRef): Promise<void> {
    // API key is expected in tenant.settings.anthropicApiKey or ANTHROPIC_API_KEY env.
    this.apiKey =
      (tenant.settings?.["anthropicApiKey"] as string | undefined) ??
      process.env["ANTHROPIC_API_KEY"] ??
      "";

    if (!this.apiKey) {
      throw new Error(
        `[ComputerUseConnector:${this.id}] anthropicApiKey must be set`
      );
    }

    this.goals = {
      ...this.defaultGoals(),
      ...((tenant.settings?.["goals"] as Record<string, ComputerUseGoal> | undefined) ?? {}),
    };

    this._ready = true;
  }

  /**
   * Override to provide built-in goal templates for known operations.
   */
  protected defaultGoals(): Record<string, ComputerUseGoal> {
    return {};
  }

  async invoke(op: string, args: unknown): Promise<unknown> {
    if (!this._ready) {
      throw new Error(`[ComputerUseConnector:${this.id}] not initialised`);
    }
    const goal = this.goals[op];
    if (!goal) {
      throw new Error(`[ComputerUseConnector:${this.id}] no goal for op: ${op}`);
    }
    return this._runAgent(goal, args);
  }

  async healthCheck(): Promise<{ ok: boolean; details?: string }> {
    if (!this._ready) return { ok: false, details: "not initialised" };
    if (!this.apiKey) return { ok: false, details: "no API key" };
    // Lightweight token check — models/list endpoint.
    try {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) return { ok: true };
      return { ok: false, details: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, details: String(err) };
    }
  }

  // ─── Private: agent loop ──────────────────────────────────────────────────────

  private async _runAgent(
    goal: ComputerUseGoal,
    args: unknown
  ): Promise<unknown> {
    const argsObj =
      args !== null && typeof args === "object"
        ? (args as Record<string, unknown>)
        : {};

    const goalText = goal.goalTemplate.replace(
      /\{\{(\w+)\}\}/g,
      (_, k: string) => String(argsObj[k] ?? "")
    );

    const maxTurns = goal.maxTurns ?? 20;
    const messages: CuMessage[] = [
      { role: "user", content: goalText },
    ];

    let turns = 0;
    let lastAssistantText = "";

    while (turns < maxTurns) {
      const response = await this._callAnthropic(messages);
      turns++;

      // Collect assistant text.
      const textParts = response.content
        .filter((c): c is CuTextContent => c.type === "text")
        .map((c) => c.text);
      lastAssistantText = textParts.join("\n");

      if (response.stop_reason === "end_turn") {
        break;
      }

      if (response.stop_reason !== "tool_use") {
        break;
      }

      // Add assistant message and simulate tool results.
      messages.push({ role: "assistant", content: response.content });

      const toolResults: CuToolResultContent[] = response.content
        .filter((c): c is CuToolUseContent => c.type === "tool_use")
        .map((tu) => ({
          type: "tool_result" as const,
          tool_use_id: tu.id,
          content: {
            type: "text",
            text: `[tool ${tu.name} executed — result not available in headless mode]`,
          },
        }));

      messages.push({ role: "user", content: toolResults });
    }

    return { turns, result: lastAssistantText };
  }

  private async _callAnthropic(messages: CuMessage[]): Promise<CuResponse> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "computer-use-2025-01-24",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 4096,
        tools: [
          {
            type: "computer_20250124",
            name: "computer",
            display_width_px: 1920,
            display_height_px: 1080,
          },
        ],
        messages,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `[ComputerUseConnector:${this.id}] Anthropic API error ${res.status}: ${text.slice(0, 300)}`
      );
    }

    return res.json() as Promise<CuResponse>;
  }
}
