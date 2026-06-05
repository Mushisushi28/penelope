/**
 * @penelope/connectors — Tier 2: API Skill base class
 *
 * Base for hand-coded, per-service TypeScript wrappers.
 * Subclasses implement `invoke(op, args)` with service-specific logic.
 * Used today for: FB Page, Telegram, Twilio, Square, and more.
 *
 * Pattern mirrors @penelope/adapters conventions: each subclass owns
 * its HTTP client initialisation inside `onInit()`.
 */

import type {
  Capability,
  Category,
  Connector,
  Tier,
  TenantConfig,
} from "./types.js";
import type { SecretRef } from "@penelope/secrets";

// ─── Base class ───────────────────────────────────────────────────────────────

export abstract class ApiSkillConnector implements Connector {
  abstract readonly id: string;
  abstract readonly displayName: string;
  abstract readonly description: string;
  abstract readonly category: Category;
  abstract readonly capabilities: ReadonlyArray<Capability>;

  readonly tier: Tier = "api-skill";

  protected tenant: TenantConfig | null = null;
  protected secretRef: SecretRef | null = null;
  private _ready = false;

  /**
   * Framework hook — called during `init()`.
   * Subclasses should set up HTTP clients, validate credentials, etc.
   * Receives the resolved secret VALUE (string) so subclasses don't need
   * to interact with the secrets store directly.
   */
  protected abstract onInit(
    tenant: TenantConfig,
    secretRef: SecretRef
  ): Promise<void>;

  async init(tenant: TenantConfig, secrets: SecretRef): Promise<void> {
    this.tenant = tenant;
    this.secretRef = secrets;
    await this.onInit(tenant, secrets);
    this._ready = true;
  }

  /**
   * Subclasses implement this with `switch (op)` on supported operations.
   * Unknown ops should throw: `throw new Error(\`unsupported op: \${op}\`)`.
   */
  abstract invoke(op: string, args: unknown): Promise<unknown>;

  async healthCheck(): Promise<{ ok: boolean; details?: string }> {
    if (!this._ready) return { ok: false, details: "not initialised" };
    try {
      return await this.onHealthCheck();
    } catch (err) {
      return { ok: false, details: String(err) };
    }
  }

  /**
   * Override in subclasses for a real liveness check.
   * Default: return ok if init succeeded.
   */
  protected async onHealthCheck(): Promise<{ ok: boolean; details?: string }> {
    return { ok: true };
  }
}
