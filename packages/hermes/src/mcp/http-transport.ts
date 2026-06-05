/**
 * @penelope/hermes — MCP HTTP+SSE transport
 *
 * Implements MCP 2025 HTTP transport:
 *   POST /messages  — send JSON-RPC requests
 *   GET  /events    — Server-Sent Events stream for push responses
 */

import { EventEmitter } from 'node:events';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class HttpTransport extends EventEmitter {
  private nextId = 1;
  private pending = new Map<number, { resolve: (r: JsonRpcResponse) => void; reject: (e: Error) => void }>();
  private sseAbort: AbortController | null = null;

  constructor(private readonly baseUrl: string) {
    super();
  }

  async connect(): Promise<void> {
    this.sseAbort = new AbortController();
    const eventsUrl = this.baseUrl.replace(/\/$/, '') + '/events';
    void this.consumeSse(eventsUrl, this.sseAbort.signal);
  }

  private async consumeSse(url: string, signal: AbortSignal): Promise<void> {
    try {
      const resp = await fetch(url, {
        headers: { Accept: 'text/event-stream' },
        signal,
      });
      if (!resp.ok || !resp.body) {
        this.emit('error', new Error(`SSE connect failed: ${resp.status}`));
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              const msg = JSON.parse(payload) as JsonRpcResponse;
              const handler = this.pending.get(msg.id);
              if (handler) {
                this.pending.delete(msg.id);
                handler.resolve(msg);
              }
            } catch {
              // skip malformed SSE data
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        this.emit('error', err);
      }
    }
    this.emit('close');
  }

  async send(method: string, params?: unknown): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
      this.pending.set(id, { resolve, reject });

      const messagesUrl = this.baseUrl.replace(/\/$/, '') + '/messages';
      fetch(messagesUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      }).then(async (resp) => {
        if (!resp.ok) {
          this.pending.delete(id);
          reject(new Error(`HTTP POST /messages failed: ${resp.status}`));
          return;
        }
        const contentType = resp.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          const body = await resp.json() as JsonRpcResponse;
          this.pending.delete(id);
          resolve(body);
        }
        // else: response will arrive via SSE stream
      }).catch((err: unknown) => {
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  close(): void {
    this.sseAbort?.abort();
    this.sseAbort = null;
    for (const [, handler] of this.pending) {
      handler.reject(new Error('HttpTransport: connection closed'));
    }
    this.pending.clear();
  }
}
