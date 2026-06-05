/**
 * @penelope/hermes — HTTP Invoker
 *
 * Given connector + operation + args + tenant credentials → executes HTTP call.
 * Auth secrets come from TenantCredentials — never committed.
 */

import axios from 'axios';
import type { Connector, HttpMethod, InvokeRequest, InvokeResult, Operation, TenantCredentials } from './types.js';

export function buildRequest(
  connector: Connector,
  op: Operation,
  args: Record<string, unknown>,
  creds: TenantCredentials
): InvokeRequest {
  let url = connector.baseUrl.replace(/\/$/, '') + op.path;
  const pathParams = (op.parameters ?? []).filter(p => p.in === 'path');
  const queryParamDefs = (op.parameters ?? []).filter(p => p.in === 'query');

  for (const param of pathParams) {
    const val = args[param.name];
    if (val !== undefined) {
      url = url.replace(`{${param.name}}`, encodeURIComponent(String(val)));
    }
  }

  const queryParams: Record<string, string> = {};
  for (const param of queryParamDefs) {
    const val = args[param.name];
    if (val !== undefined) {
      queryParams[param.name] = String(val);
    }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  applyAuth(connector, creds, headers, queryParams);

  const consumedKeys = new Set([
    ...pathParams.map(p => p.name),
    ...queryParamDefs.map(p => p.name),
  ]);
  const bodyKeys = Object.keys(args).filter(k => !consumedKeys.has(k));
  const body: unknown = bodyKeys.length > 0 && ['POST', 'PUT', 'PATCH'].includes(op.method)
    ? Object.fromEntries(bodyKeys.map(k => [k, args[k]]))
    : undefined;

  return {
    connectorId: connector.id,
    operationId: op.operationId,
    method: op.method,
    url,
    headers,
    queryParams,
    body,
  };
}

export async function executeRequest<T = unknown>(req: InvokeRequest): Promise<InvokeResult<T>> {
  const response = await axios.request<T>({
    method: req.method as string,
    url: req.url,
    headers: req.headers,
    params: Object.keys(req.queryParams).length > 0 ? req.queryParams : undefined,
    data: req.body,
    validateStatus: () => true,
  });

  const responseHeaders: Record<string, string> = {};
  for (const [key, val] of Object.entries(response.headers)) {
    if (typeof val === 'string') responseHeaders[key] = val;
  }

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    data: response.data,
    headers: responseHeaders,
    requestId: responseHeaders['request-id'] ?? responseHeaders['x-request-id'],
  };
}

export async function invoke<T = unknown>(
  connector: Connector,
  op: Operation,
  args: Record<string, unknown>,
  creds: TenantCredentials
): Promise<InvokeResult<T>> {
  const req = buildRequest(connector, op, args, creds);
  return executeRequest<T>(req);
}

/** Find an operation by id, throws if not found. */
export function findOp(connector: Connector, operationId: string): Operation {
  const op = connector.operations.find(o => o.operationId === operationId);
  if (!op) {
    const sample = connector.operations.slice(0, 5).map(o => o.operationId).join(', ');
    throw new Error(
      `Connector "${connector.id}" has no operation "${operationId}". Sample ops: ${sample}`
    );
  }
  return op;
}

function applyAuth(
  connector: Connector,
  creds: TenantCredentials,
  headers: Record<string, string>,
  queryParams: Record<string, string>
): void {
  const auth = connector.authStrategy;
  if (auth.type === 'api-key') {
    const keyValue = creds[auth.envVar] ?? process.env[auth.envVar] ?? '';
    const formatted = auth.prefix ? `${auth.prefix}${keyValue}` : keyValue;
    if (auth.placement === 'header') {
      headers[auth.headerName ?? 'Authorization'] = formatted;
    } else if (auth.placement === 'query' && auth.queryParam) {
      queryParams[auth.queryParam] = formatted;
    }
  } else if (auth.type === 'basic') {
    const user = creds[auth.usernameEnv] ?? process.env[auth.usernameEnv] ?? '';
    const pass = creds[auth.passwordEnv] ?? process.env[auth.passwordEnv] ?? '';
    headers['Authorization'] = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
  }
}
