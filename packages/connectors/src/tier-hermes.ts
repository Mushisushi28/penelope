/**
 * @penelope/connectors — Tier 3: Hermes OpenAPI bridge
 *
 * Bridges @penelope/hermes OpenAPI-generated connectors into the unified
 * Connector interface.  Any service with an OpenAPI spec can be registered
 * here and all operations become available via invoke(operationId, args).
 *
 * The HermesConnector wraps a spec-defined operation catalogue; the actual
 * HTTP dispatch is delegated to the hermes adapter (when available at
 * runtime) or performed directly via fetch for standalone usage.
 */

import type {
  Capability,
  Category,
  Connector,
  Tier,
  TenantConfig,
} from "./types.js";
import type { SecretRef } from "@penelope/secrets";

// ─── OpenAPI operation descriptor ─────────────────────────────────────────────

export interface HermesOperation {
  /** OpenAPI operationId */
  operationId: string;
  /** HTTP method */
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Path template, e.g. "/v1/customers/{customerId}" */
  path: string;
  /** Brief description from OpenAPI spec */
  summary?: string;
}

// ─── Hermes spec config ────────────────────────────────────────────────────────

export interface HermesSpecConfig {
  /** Public URL or local path to the OpenAPI spec JSON/YAML */
  specUrl: string;
  /** Base URL for actual API calls (overrides servers[] in spec if set) */
  baseUrl?: string;
  /**
   * Security scheme name as it appears in the OpenAPI spec's securitySchemes.
   * The value is resolved from secrets at init-time.
   */
  securityScheme?: "bearerAuth" | "apiKey" | "basicAuth" | string;
}

// ─── Base class ───────────────────────────────────────────────────────────────

export abstract class HermesConnector implements Connector {
  abstract readonly id: string;
  abstract readonly displayName: string;
  abstract readonly description: string;
  abstract readonly category: Category;
  abstract readonly capabilities: ReadonlyArray<Capability>;

  /** Provide the spec config.  Usually a static property on subclasses. */
  abstract readonly specConfig: HermesSpecConfig;

  readonly tier: Tier = "hermes-openapi";

  protected baseUrl = "";
  protected authHeader: Record<string, string> = {};
  private _ready = false;

  async init(tenant: TenantConfig, secrets: SecretRef): Promise<void> {
    this.baseUrl =
      this.specConfig.baseUrl ??
      (tenant.settings?.["baseUrl"] as string | undefined) ??
      "";

    // Resolve auth token from tenant settings (subclasses may override).
    const token =
      (tenant.settings?.["apiKey"] as string | undefined) ??
      (tenant.settings?.["bearerToken"] as string | undefined) ??
      "";

    const scheme = this.specConfig.securityScheme ?? "bearerAuth";
    if (scheme === "bearerAuth" || scheme === "apiKey") {
      this.authHeader = token ? { Authorization: `Bearer ${token}` } : {};
    } else if (scheme === "basicAuth") {
      const encoded = Buffer.from(token).toString("base64");
      this.authHeader = { Authorization: `Basic ${encoded}` };
    }

    await this.onInit(tenant, secrets);
    this._ready = true;
  }

  /** Override for additional init logic. */
  protected async onInit(
    _tenant: TenantConfig,
    _secrets: SecretRef
  ): Promise<void> {}

  /**
   * Invoke an OpenAPI operationId.
   * `args` should be an object matching the operation's request body / params.
   *
   * Subclasses may override for caching, retry, rate-limiting, etc.
   */
  async invoke(op: string, args: unknown): Promise<unknown> {
    if (!this._ready) {
      throw new Error(`[HermesConnector:${this.id}] not initialised`);
    }
    const operation = this.getOperation(op);
    if (!operation) {
      throw new Error(`[HermesConnector:${this.id}] unknown operation: ${op}`);
    }
    return this._dispatch(operation, args);
  }

  async healthCheck(): Promise<{ ok: boolean; details?: string }> {
    if (!this._ready) return { ok: false, details: "not initialised" };
    if (!this.baseUrl) return { ok: false, details: "baseUrl not configured" };
    try {
      const res = await fetch(this.baseUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(5_000),
        headers: this.authHeader,
      });
      if (res.ok) return { ok: true };
      return { ok: false, details: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, details: String(err) };
    }
  }

  /**
   * Return the operation descriptor for a given operationId.
   * Subclasses provide the catalogue; default returns undefined.
   */
  protected getOperation(_operationId: string): HermesOperation | undefined {
    return undefined;
  }

  // ─── Private: HTTP dispatch ──────────────────────────────────────────────────

  private async _dispatch(
    op: HermesOperation,
    args: unknown
  ): Promise<unknown> {
    // Interpolate path parameters from args object.
    const argsObj =
      args !== null && typeof args === "object" ? (args as Record<string, unknown>) : {};

    let path = op.path;
    const usedKeys = new Set<string>();
    path = path.replace(/\{(\w+)\}/g, (_, key: string) => {
      usedKeys.add(key);
      return String(argsObj[key] ?? "");
    });

    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.authHeader,
    };

    // Remaining args go in body (for POST/PUT/PATCH) or query string (GET/DELETE).
    const remaining: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(argsObj)) {
      if (!usedKeys.has(k)) remaining[k] = v;
    }

    let fetchUrl = url;

    if (op.method === "GET" || op.method === "DELETE") {
      const qsPairs: [string, string][] = Object.entries(remaining).map(
        ([k, v]) => [k, String(v)]
      );
      const qs = new URLSearchParams(qsPairs).toString();
      if (qs) fetchUrl = `${url}?${qs}`;

      const res = await fetch(fetchUrl, {
        method: op.method,
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      return this._handleResponse(op, res);
    }

    const bodyRes = await fetch(fetchUrl, {
      method: op.method,
      headers,
      body: JSON.stringify(remaining),
      signal: AbortSignal.timeout(30_000),
    });
    return this._handleResponse(op, bodyRes);
  }

  private async _handleResponse(op: HermesOperation, res: Response): Promise<unknown> {
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      throw new Error(
        `[HermesConnector:${this.id}] ${op.operationId} failed: HTTP ${res.status} — ${text.slice(0, 200)}`
      );
    }

    return parsed;
  }
}
