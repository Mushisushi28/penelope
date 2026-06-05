/**
 * http-client.ts — HTTP/SSE transport for the open-claude-in-chrome MCP server.
 *
 * Loaded lazily by recipe-builder when OPEN_CLAUDE_MCP_URL is set.
 */

import type { BrowserClient, DomElement } from "../recipe-builder.js";

export class OpenClaudeHttpClient implements BrowserClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async navigate(url: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/navigate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      throw new Error(`MCP navigate failed: ${res.status} ${res.statusText}`);
    }
  }

  async snapshot(): Promise<DomElement[]> {
    const res = await fetch(`${this.baseUrl}/snapshot`);
    if (!res.ok) {
      throw new Error(`MCP snapshot failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as DomElement[];
  }

  async screenshot(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/screenshot`);
    if (!res.ok) {
      throw new Error(`MCP screenshot failed: ${res.status} ${res.statusText}`);
    }
    const { data } = (await res.json()) as { data: string };
    return data;
  }

  async close(): Promise<void> {
    // HTTP mode — no persistent connection to close; no-op.
  }
}
