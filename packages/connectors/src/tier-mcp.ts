/**
 * @penelope/connectors — Tier 1: MCP adapter base class
 *
 * Wraps an MCP server (stdio or SSE) and exposes invoke(toolName, args)
 * as a MCP tools/call request.  Per-tenant config supplies the command,
 * args, and env (for stdio) or the SSE URL (for SSE transport).
 *
 * Transport is kept deliberately thin: we manage the child process
 * ourselves over stdio using the JSON-RPC subset required by MCP.
 */

import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type {
  Capability,
  Category,
  Connector,
  Tier,
  TenantConfig,
} from "./types.js";
import type { SecretRef } from "@penelope/secrets";

// ─── MCP transport types ───────────────────────────────────────────────────────

export type McpTransport = "stdio" | "sse";

export interface McpStdioConfig {
  transport: "stdio";
  /** Executable path, e.g. "npx" or "/usr/local/bin/mcp-server-stripe". */
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpSseConfig {
  transport: "sse";
  /** Full SSE endpoint URL, e.g. "http://localhost:3000/sse". */
  url: string;
  headers?: Record<string, string>;
}

export type McpConfig = McpStdioConfig | McpSseConfig;

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ─── Base class ───────────────────────────────────────────────────────────────

export abstract class McpConnector implements Connector {
  abstract readonly id: string;
  abstract readonly displayName: string;
  abstract readonly description: string;
  abstract readonly category: Category;
  abstract readonly capabilities: ReadonlyArray<Capability>;

  readonly tier: Tier = "mcp";

  protected mcpConfig: McpConfig | null = null;
  private _proc: ChildProcessWithoutNullStreams | null = null;
  private _pendingRequests = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private _idCounter = 1;
  private _buffer = "";
  private _initialized = false;

  /**
   * Subclasses may override to derive McpConfig from secrets.
   * Default: require `tenant.settings.mcpConfig` to be set.
   */
  protected resolveMcpConfig(
    tenant: TenantConfig,
    _secrets: SecretRef
  ): McpConfig {
    const cfg = tenant.settings?.["mcpConfig"];
    if (!cfg || typeof cfg !== "object") {
      throw new Error(
        `[McpConnector:${this.id}] tenant.settings.mcpConfig must be provided`
      );
    }
    return cfg as McpConfig;
  }

  async init(tenant: TenantConfig, secrets: SecretRef): Promise<void> {
    this.mcpConfig = this.resolveMcpConfig(tenant, secrets);
    await this._connect();
    this._initialized = true;
  }

  async invoke(op: string, args: unknown): Promise<unknown> {
    if (!this._initialized) {
      throw new Error(`[McpConnector:${this.id}] not initialised — call init() first`);
    }
    return this._callTool(op, args);
  }

  async healthCheck(): Promise<{ ok: boolean; details?: string }> {
    try {
      if (!this._initialized) return { ok: false, details: "not initialised" };
      // Ping with a tools/list request — all MCP servers must support it.
      await this._rpc("tools/list", {});
      return { ok: true };
    } catch (err) {
      return { ok: false, details: String(err) };
    }
  }

  // ─── Private: stdio transport ────────────────────────────────────────────────

  private async _connect(): Promise<void> {
    const cfg = this.mcpConfig!;
    if (cfg.transport === "sse") {
      // SSE: validate URL is reachable (light HEAD check), no persistent proc.
      const res = await fetch(cfg.url, {
        method: "HEAD",
        signal: AbortSignal.timeout(5_000),
        headers: cfg.headers ?? {},
      }).catch((e: unknown) => {
        throw new Error(`[McpConnector:${this.id}] SSE endpoint unreachable: ${e}`);
      });
      if (!res.ok) {
        throw new Error(
          `[McpConnector:${this.id}] SSE endpoint returned ${res.status}`
        );
      }
      return;
    }

    // stdio transport
    this._proc = spawn(cfg.command, cfg.args ?? [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...cfg.env },
    });

    this._proc.stdout.setEncoding("utf8");
    this._proc.stdout.on("data", (chunk: string) => this._onData(chunk));
    this._proc.stderr.on("data", (chunk: Buffer | string) => {
      // Forward stderr to process stderr for visibility.
      process.stderr.write(`[mcp:${this.id}] ${String(chunk)}`);
    });
    this._proc.on("exit", (code) => {
      const err = new Error(
        `[McpConnector:${this.id}] process exited with code ${code}`
      );
      for (const p of this._pendingRequests.values()) p.reject(err);
      this._pendingRequests.clear();
    });

    // MCP initialise handshake
    await this._rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "penelope-connectors", version: "0.2.0" },
    });
    await this._notify("notifications/initialized");
  }

  private _onData(chunk: string): void {
    this._buffer += chunk;
    const lines = this._buffer.split("\n");
    this._buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let msg: JsonRpcResponse;
      try {
        msg = JSON.parse(trimmed) as JsonRpcResponse;
      } catch {
        continue;
      }
      const pending = this._pendingRequests.get(msg.id);
      if (!pending) continue;
      this._pendingRequests.delete(msg.id);
      if (msg.error) {
        pending.reject(
          new Error(`MCP error ${msg.error.code}: ${msg.error.message}`)
        );
      } else {
        pending.resolve(msg.result);
      }
    }
  }

  private _rpc(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this._idCounter++;
      const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
      this._pendingRequests.set(id, { resolve, reject });
      const line = JSON.stringify(req) + "\n";

      if (this.mcpConfig?.transport === "sse") {
        const cfg = this.mcpConfig as McpSseConfig;
        // For SSE transport, send requests via HTTP POST to the same base URL.
        const postUrl = cfg.url.replace(/\/sse$/, "/message");
        fetch(postUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(cfg.headers ?? {}),
          },
          body: JSON.stringify(req),
          signal: AbortSignal.timeout(30_000),
        })
          .then((r) => r.json())
          .then((data) => {
            const pend = this._pendingRequests.get(id);
            if (!pend) return;
            this._pendingRequests.delete(id);
            const resp = data as JsonRpcResponse;
            if (resp.error) {
              pend.reject(
                new Error(`MCP error ${resp.error.code}: ${resp.error.message}`)
              );
            } else {
              pend.resolve(resp.result);
            }
          })
          .catch((e: unknown) => {
            const pend = this._pendingRequests.get(id);
            if (pend) {
              this._pendingRequests.delete(id);
              pend.reject(e instanceof Error ? e : new Error(String(e)));
            }
          });
        return;
      }

      if (!this._proc?.stdin.writable) {
        this._pendingRequests.delete(id);
        reject(new Error(`[McpConnector:${this.id}] stdin not writable`));
        return;
      }
      this._proc.stdin.write(line);
    });
  }

  private async _notify(method: string): Promise<void> {
    if (this.mcpConfig?.transport === "stdio" && this._proc?.stdin.writable) {
      const msg = JSON.stringify({ jsonrpc: "2.0", method }) + "\n";
      this._proc.stdin.write(msg);
    }
  }

  private async _callTool(name: string, args: unknown): Promise<unknown> {
    return this._rpc("tools/call", { name, arguments: args });
  }
}
