/**
 * @penelope/hermes — MCP stdio transport
 *
 * Line-delimited JSON (NDJSON) over a child process stdin/stdout.
 * Each message is a JSON-RPC 2.0 object terminated by \n.
 */

import { type ChildProcess, spawn } from 'node:child_process';
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

export class StdioTransport extends EventEmitter {
  private proc: ChildProcess;
  private buffer = '';
  private nextId = 1;
  private pending = new Map<number, { resolve: (r: JsonRpcResponse) => void; reject: (e: Error) => void }>();

  constructor(command: string, args: string[], env?: Record<string, string>) {
    super();
    this.proc = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    const stdout = this.proc.stdout;
    if (!stdout) throw new Error('StdioTransport: child process has no stdout');

    stdout.setEncoding('utf8');
    stdout.on('data', (chunk: string) => {
      this.buffer += chunk;
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as JsonRpcResponse;
          const handler = this.pending.get(msg.id);
          if (handler) {
            this.pending.delete(msg.id);
            handler.resolve(msg);
          }
        } catch {
          // malformed line — ignore
        }
      }
    });

    this.proc.on('close', (code) => {
      this.emit('close', code);
      for (const [, handler] of this.pending) {
        handler.reject(new Error(`StdioTransport: process exited with code ${code}`));
      }
      this.pending.clear();
    });
  }

  send(method: string, params?: unknown): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
      this.pending.set(id, { resolve, reject });

      const stdin = this.proc.stdin;
      if (!stdin) {
        this.pending.delete(id);
        reject(new Error('StdioTransport: child process has no stdin'));
        return;
      }
      stdin.write(JSON.stringify(req) + '\n');
    });
  }

  close(): void {
    this.proc.stdin?.end();
    this.proc.kill();
  }

  get pid(): number | undefined {
    return this.proc.pid;
  }
}
