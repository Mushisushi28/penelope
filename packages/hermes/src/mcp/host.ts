/**
 * @penelope/hermes — McpHost
 *
 * Manages MCP servers declared in tenants/<id>/mcp.json.
 * Reconnect-on-error: exponential backoff, max 3 retries.
 */

import { readFile } from 'node:fs/promises';
import type { McpServerConfig, McpTool, McpInvocation } from './types.js';
import { StdioTransport } from './stdio-transport.js';
import { HttpTransport } from './http-transport.js';

interface ToolsListResult {
  tools: Array<{
    name: string;
    description?: string;
    inputSchema: Record<string, unknown>;
  }>;
}

interface CallToolResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}

type Transport = StdioTransport | HttpTransport;

interface ServerState {
  config: McpServerConfig;
  transport: Transport;
  tools: McpTool[];
}

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 500;

export class McpHost {
  private servers = new Map<string, ServerState>();

  async load(tenantConfigPath: string): Promise<void> {
    const raw = await readFile(tenantConfigPath, 'utf-8');
    const configs = JSON.parse(raw) as McpServerConfig[];

    if (!Array.isArray(configs)) {
      throw new Error(`McpHost.load: expected JSON array in ${tenantConfigPath}`);
    }

    await Promise.all(
      configs.map((cfg) => this.connectServer(cfg).catch((err: unknown) => {
        console.warn(`McpHost: skipping server "${cfg.name}" — ${(err as Error).message}`);
      }))
    );
  }

  listTools(): McpTool[] {
    const out: McpTool[] = [];
    for (const state of this.servers.values()) {
      out.push(...state.tools);
    }
    return out;
  }

  async invoke(serverName: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const state = this.servers.get(serverName);
    if (!state) {
      throw new Error(`McpHost.invoke: server "${serverName}" not found`);
    }

    const tool = state.tools.find((t) => t.name === toolName);
    if (!tool) {
      throw new Error(`McpHost.invoke: tool "${toolName}" not found on server "${serverName}"`);
    }

    const resp = await state.transport.send('tools/call', {
      name: toolName,
      arguments: args,
    });

    if (resp.error) {
      throw new Error(`McpHost: tools/call error — [${resp.error.code}] ${resp.error.message}`);
    }

    const result = resp.result as CallToolResult | undefined;
    if (result?.isError) {
      const msg = result.content.map((c) => c.text ?? JSON.stringify(c)).join(' ');
      throw new Error(`McpHost: tool "${toolName}" returned error: ${msg}`);
    }

    return result;
  }

  async invokeWith(invocation: McpInvocation): Promise<unknown> {
    return this.invoke(invocation.server, invocation.tool, invocation.args);
  }

  disconnect(): void {
    for (const state of this.servers.values()) {
      state.transport.close();
    }
    this.servers.clear();
  }

  private async connectServer(cfg: McpServerConfig, attempt = 0): Promise<void> {
    validateConfig(cfg);

    let transport: Transport;

    if (cfg.transport === 'stdio') {
      transport = new StdioTransport(cfg.command!, cfg.args ?? [], cfg.env);
    } else {
      const http = new HttpTransport(cfg.url!);
      await http.connect();
      transport = http;
    }

    try {
      const initResp = await transport.send('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        clientInfo: { name: '@penelope/hermes', version: '0.1.0' },
      });

      if (initResp.error) {
        throw new Error(`initialize failed: [${initResp.error.code}] ${initResp.error.message}`);
      }

      // Fire-and-forget per MCP spec
      void transport.send('notifications/initialized', {}).catch(() => undefined);

      const listResp = await transport.send('tools/list', {});
      if (listResp.error) {
        throw new Error(`tools/list failed: [${listResp.error.code}] ${listResp.error.message}`);
      }

      const { tools } = listResp.result as ToolsListResult;
      const mcpTools: McpTool[] = tools.map((t) => ({
        server: cfg.name,
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }));

      transport.on('close', () => {
        this.servers.delete(cfg.name);
        this.scheduleReconnect(cfg, 0);
      });

      this.servers.set(cfg.name, { config: cfg, transport, tools: mcpTools });
    } catch (err) {
      transport.close();
      if (attempt < MAX_RETRIES) {
        const delay = BACKOFF_BASE_MS * 2 ** attempt;
        await new Promise<void>((res) => setTimeout(res, delay));
        return this.connectServer(cfg, attempt + 1);
      }
      throw err;
    }
  }

  private scheduleReconnect(cfg: McpServerConfig, attempt: number): void {
    if (attempt >= MAX_RETRIES) {
      console.warn(`McpHost: server "${cfg.name}" disconnected — max retries reached`);
      return;
    }
    const delay = BACKOFF_BASE_MS * 2 ** attempt;
    setTimeout(() => {
      this.connectServer(cfg, attempt).catch((err: unknown) => {
        console.warn(`McpHost: reconnect attempt ${attempt + 1} for "${cfg.name}" failed — ${(err as Error).message}`);
      });
    }, delay);
  }
}

function validateConfig(cfg: McpServerConfig): void {
  if (!cfg.name || typeof cfg.name !== 'string') {
    throw new Error('McpServerConfig: "name" is required and must be a string');
  }
  if (cfg.transport !== 'stdio' && cfg.transport !== 'http') {
    throw new Error(`McpServerConfig "${cfg.name}": transport must be "stdio" or "http"`);
  }
  if (cfg.transport === 'stdio' && !cfg.command) {
    throw new Error(`McpServerConfig "${cfg.name}": "command" is required for stdio transport`);
  }
  if (cfg.transport === 'http' && !cfg.url) {
    throw new Error(`McpServerConfig "${cfg.name}": "url" is required for http transport`);
  }
}
