/**
 * stdio-client.ts — stdio transport for the open-claude-in-chrome MCP server.
 *
 * Loaded lazily by recipe-builder when OPEN_CLAUDE_MCP_URL is NOT set.
 * Spawns the `open-claude-mcp` binary and communicates via NDJSON on stdio.
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { BrowserClient, DomElement } from "../recipe-builder.js";

export class OpenClaudeStdioClient implements BrowserClient {
  private proc: ChildProcess | null = null;
  private msgId = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private buf = "";

  private async ensureStarted(): Promise<void> {
    if (this.proc) return;

    this.proc = spawn("open-claude-mcp", [], { stdio: ["pipe", "pipe", "pipe"] });

    this.proc.stdout?.setEncoding("utf8");
    this.proc.stdout?.on("data", (chunk: string) => {
      this.buf += chunk;
      const lines = this.buf.split("\n");
      this.buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as { id: number; result?: unknown; error?: { message: string } };
          const handler = this.pending.get(msg.id);
          if (!handler) continue;
          this.pending.delete(msg.id);
          if (msg.error) {
            handler.reject(new Error(msg.error.message));
          } else {
            handler.resolve(msg.result);
          }
        } catch {
          // ignore malformed lines
        }
      }
    });

    this.proc.on("error", (err) => {
      for (const h of this.pending.values()) h.reject(err);
      this.pending.clear();
    });
  }

  private call(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.ensureStarted().then(() => {
        const id = ++this.msgId;
        this.pending.set(id, { resolve, reject });
        const msg = JSON.stringify({ id, method, params }) + "\n";
        this.proc!.stdin!.write(msg, (err) => {
          if (err) {
            this.pending.delete(id);
            reject(err);
          }
        });
      }).catch(reject);
    });
  }

  async navigate(url: string): Promise<void> {
    await this.call("navigate", { url });
  }

  async snapshot(): Promise<DomElement[]> {
    return (await this.call("snapshot", {})) as DomElement[];
  }

  async screenshot(): Promise<string> {
    return (await this.call("screenshot", {})) as string;
  }

  async close(): Promise<void> {
    if (this.proc) {
      this.proc.stdin?.end();
      this.proc = null;
    }
  }
}
