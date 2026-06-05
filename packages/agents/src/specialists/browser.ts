/**
 * BrowserSpecialist — Stagehand-powered no-API site automation.
 *
 * Org-chart position:
 *   USER ←─── telegram-owner ───→ PENELOPE
 *                                      │
 *                              BrowserSpecialist (bus only)
 *
 * This specialist NEVER touches telegram-owner. All step traces and results
 * are published to the loom-a2a internal bus and relayed to the owner by Penelope.
 *
 * Browser engine: @browserbasehq/stagehand (MIT)
 * Sandbox: per-tenant Chrome profile at tenants/<id>/state/chrome-profile/
 */

import { join } from "node:path";
import { SpecialistAgent, type SpecialistConfig } from "./base.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StepAction = "navigate" | "click" | "type" | "extract" | "scroll" | "wait";

export interface StepTrace {
  step_n: number;
  action: StepAction;
  target: string;
  result: string;
  screenshot?: string;
}

export interface BrowserResult {
  ok: boolean;
  goal: string;
  steps: StepTrace[];
  extracted?: Record<string, unknown>;
  escalation?: EscalationPayload;
  error?: string;
}

export interface EscalationPayload {
  reason: "confirm-needed" | "max-steps-exceeded" | "error";
  message: string;
  step_n: number;
  screenshot?: string;
}

export interface ExecuteOptions {
  goal: string;
  startUrl?: string;
  maxSteps?: number;
  screenshots?: boolean;
}

export interface BrowserSpecialistConfig extends SpecialistConfig {
  /** Absolute path to the tenants root (e.g. /repo/tenants). */
  tenants_root: string;
  /** Override the Stagehand factory for testing. */
  stagehandFactory?: StagehandFactory;
}

// ─── Stagehand interface (thin wrapper so tests can mock it) ──────────────────

export interface StagehandPage {
  goto(url: string): Promise<void>;
  act(instruction: string): Promise<{ action: string; target?: string; result?: string }>;
  extract<T = Record<string, unknown>>(instruction: string): Promise<T>;
  screenshot(): Promise<string | Buffer>;
  close(): Promise<void>;
}

export interface StagehandInstance {
  page: StagehandPage;
  close(): Promise<void>;
}

export type StagehandFactory = (userDataDir: string) => Promise<StagehandInstance>;

// ─── Default Stagehand factory ────────────────────────────────────────────────

/**
 * Lazily loads @browserbasehq/stagehand so the package can be installed
 * without making every import fail when stagehand isn't present.
 */
async function defaultStagehandFactory(userDataDir: string): Promise<StagehandInstance> {
  // Dynamic import — keeps the module loadable in test environments without stagehand.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { Stagehand } = (await import("@browserbasehq/stagehand" as any)) as any;
  const instance = new Stagehand({
    env: "LOCAL",
    localBrowserOptions: {
      userDataDir,
      headless: true,
    },
  });
  await instance.init();
  return instance as StagehandInstance;
}

// ─── Confirm-needed detection ─────────────────────────────────────────────────

const CONFIRM_NEEDED_PATTERNS = [
  /buy\s*now/i,
  /purchase/i,
  /\bpay\b/i,
  /submit\s*order/i,
  /place\s*order/i,
  /checkout/i,
  /\bdelete\b/i,
  /remove\s*account/i,
  /unsubscribe/i,
  /cancel\s*subscription/i,
];

export function requiresConfirmation(actionDescription: string): boolean {
  return CONFIRM_NEEDED_PATTERNS.some((pattern) => pattern.test(actionDescription));
}

// ─── Recipe registry ──────────────────────────────────────────────────────────

export type RecipeHandler = (
  page: StagehandPage,
  startUrl: string,
  options: ExecuteOptions,
  emitStep: (trace: Omit<StepTrace, "step_n">) => void,
) => Promise<Record<string, unknown>>;

const RECIPES = new Map<string, RecipeHandler>();

export function registerRecipe(name: string, handler: RecipeHandler): void {
  RECIPES.set(name, handler);
}

export function getRecipe(name: string): RecipeHandler | undefined {
  return RECIPES.get(name);
}

// ─── BrowserSpecialist ────────────────────────────────────────────────────────

export class BrowserSpecialist extends SpecialistAgent {
  private readonly config: BrowserSpecialistConfig;
  private readonly stagehandFactory: StagehandFactory;

  constructor(config: BrowserSpecialistConfig) {
    if (!config.tenant_id || config.tenant_id.trim() === "") {
      throw new Error("[BrowserSpecialist] tenant_id is required and must be non-empty.");
    }
    super({ role: "browser", tenant_id: config.tenant_id });
    this.config = config;
    this.stagehandFactory = config.stagehandFactory ?? defaultStagehandFactory;
  }

  /** Absolute path to this tenant's Chrome profile directory. */
  get chromeProfilePath(): string {
    return join(this.config.tenants_root, this.tenantId, "state", "chrome-profile");
  }

  /**
   * Execute a browser goal.
   *
   * If a matching recipe is registered under `options.goal`, the recipe
   * drives the page and returns structured extracted data. Otherwise, a
   * free-form Stagehand `act()` loop is used.
   *
   * Returns a BrowserResult with step traces. On confirm-needed or max-steps,
   * the result carries an `escalation` payload for Penelope to relay.
   */
  async execute(options: ExecuteOptions): Promise<BrowserResult> {
    const { goal, startUrl = "", maxSteps = 25, screenshots = false } = options;
    const steps: StepTrace[] = [];
    let stepCounter = 0;

    const emitStep = (trace: Omit<StepTrace, "step_n">): void => {
      steps.push({ step_n: ++stepCounter, ...trace });
    };

    let stagehand: StagehandInstance | undefined;

    try {
      stagehand = await this.stagehandFactory(this.chromeProfilePath);
      const { page } = stagehand;

      // Navigate to start URL if provided
      if (startUrl) {
        await page.goto(startUrl);
        emitStep({ action: "navigate", target: startUrl, result: "navigated" });
      }

      // Check for a registered recipe
      const recipe = getRecipe(goal);
      if (recipe) {
        const extracted = await recipe(page, startUrl, options, emitStep);

        // Attach screenshots if requested
        if (screenshots && steps.length > 0) {
          const screenshotData = await page.screenshot();
          const screenshotStr =
            typeof screenshotData === "string"
              ? screenshotData
              : Buffer.isBuffer(screenshotData)
              ? screenshotData.toString("base64")
              : String(screenshotData);
          steps[steps.length - 1]!.screenshot = screenshotStr;
        }

        return { ok: true, goal, steps, extracted };
      }

      // Free-form execution loop — hard cap checked before each act() call
      while (true) {
        if (stepCounter >= maxSteps) {
          const escalation: EscalationPayload = {
            reason: "max-steps-exceeded",
            message: `Reached hard cap of ${maxSteps} steps without completing goal: "${goal}"`,
            step_n: stepCounter,
          };
          return { ok: false, goal, steps, escalation };
        }

        const actResult = await page.act(goal);
        const target = actResult.target ?? goal;
        const result = actResult.result ?? actResult.action ?? "completed";

        // Check if the action requires user confirmation
        if (requiresConfirmation(target) || requiresConfirmation(result)) {
          let screenshotStr: string | undefined;
          if (screenshots) {
            const screenshotData = await page.screenshot();
            screenshotStr =
              typeof screenshotData === "string"
                ? screenshotData
                : Buffer.isBuffer(screenshotData)
                ? screenshotData.toString("base64")
                : String(screenshotData);
          }
          const escalation: EscalationPayload = {
            reason: "confirm-needed",
            message: `Action requires confirmation before proceeding: "${target}" — ${result}`,
            step_n: stepCounter + 1,
            screenshot: screenshotStr,
          };
          emitStep({
            action: "click",
            target,
            result: "paused — confirm-needed escalation",
            screenshot: screenshotStr,
          });
          return { ok: false, goal, steps, escalation };
        }

        const action = actResult.action as StepAction ?? "click";
        emitStep({ action, target, result });

        // If stagehand signals completion
        if (result === "completed" || result === "done" || result === "success") {
          break;
        }
      }

      // Final extraction
      const extracted = await page.extract<Record<string, unknown>>(
        `Extract any relevant data for the goal: "${goal}"`,
      );

      if (screenshots && steps.length > 0) {
        const screenshotData = await page.screenshot();
        const screenshotStr =
          typeof screenshotData === "string"
            ? screenshotData
            : Buffer.isBuffer(screenshotData)
            ? screenshotData.toString("base64")
            : String(screenshotData);
        steps[steps.length - 1]!.screenshot = screenshotStr;
      }

      return { ok: true, goal, steps, extracted };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        goal,
        steps,
        error: message,
        escalation: {
          reason: "error",
          message: `BrowserSpecialist error: ${message}`,
          step_n: stepCounter,
        },
      };
    } finally {
      try {
        await stagehand?.close();
      } catch {
        // best-effort cleanup
      }
    }
  }

  // ── SpecialistAgent.run (bus entry point) ───────────────────────────────

  async run(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const goal = payload["goal"] as string | undefined;
    if (!goal) {
      throw new Error("[BrowserSpecialist] Missing required field: goal");
    }

    const result = await this.execute({
      goal,
      startUrl: payload["startUrl"] as string | undefined,
      maxSteps: payload["maxSteps"] as number | undefined,
      screenshots: payload["screenshots"] as boolean | undefined,
    });

    return result as unknown as Record<string, unknown>;
  }
}
