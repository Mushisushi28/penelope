/**
 * @penelope/hermes — OpenAPI Discovery
 *
 * Fetches an OpenAPI 3.x or 2.x (Swagger) spec and builds a Connector definition.
 * Supports both JSON and YAML specs.
 * Vendored + simplified from loom/src/hermes/discovery/openapi.ts.
 */

import { createHash } from 'node:crypto';
import yaml from 'js-yaml';
import type { AuthStrategy, Connector, ConnectorMeta, HttpMethod, Operation, Param, SchemaDef } from '../types.js';

// ---------------------------------------------------------------------------
// Raw OAS types (intentionally loose)
// ---------------------------------------------------------------------------

interface OasDoc {
  openapi?: string;
  swagger?: string;
  info?: { title?: string; version?: string };
  host?: string;
  basePath?: string;
  schemes?: string[];
  servers?: Array<{ url: string }>;
  paths?: Record<string, OasPathItem>;
  components?: { schemas?: Record<string, unknown> };
  definitions?: Record<string, unknown>;
}

interface OasPathItem {
  get?: OasOperation;
  post?: OasOperation;
  put?: OasOperation;
  patch?: OasOperation;
  delete?: OasOperation;
  parameters?: OasParameter[];
}

interface OasOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OasParameter[];
  requestBody?: {
    content?: Record<string, { schema?: unknown }>;
    required?: boolean;
  };
  responses?: Record<string, { description?: string; content?: Record<string, { schema?: unknown }> }>;
}

interface OasParameter {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: unknown;
  type?: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface OpenApiDiscoveryOptions {
  specUrl: string;
  authStrategy: AuthStrategy;
  connectorId: string;
  connectorName: string;
  maxOperations?: number;
}

export interface OpenApiDiscoveryResult {
  connector: Connector;
  specChecksum: string;
  totalOperations: number;
  warnings: string[];
}

export async function discoverFromOpenApi(options: OpenApiDiscoveryOptions): Promise<OpenApiDiscoveryResult> {
  const { specUrl, authStrategy, connectorId, connectorName, maxOperations } = options;
  const warnings: string[] = [];

  const rawBytes = await fetchSpec(specUrl);
  const specChecksum = createHash('sha256').update(rawBytes).digest('hex');
  const specText = rawBytes.toString('utf-8');

  let doc: OasDoc;
  try {
    doc = JSON.parse(specText) as OasDoc;
  } catch {
    try {
      doc = yaml.load(specText) as OasDoc;
    } catch {
      throw new Error(`Failed to parse OpenAPI spec from ${specUrl}: not valid JSON or YAML`);
    }
  }

  const baseUrl = extractBaseUrl(doc, warnings);
  const version = doc.info?.version ?? doc.openapi ?? doc.swagger ?? 'unknown';

  const paths = doc.paths ?? {};
  const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  const methodKeys: (keyof OasPathItem)[] = ['get', 'post', 'put', 'patch', 'delete'];

  const allOperations: Operation[] = [];
  let opIndex = 0;

  for (const [pathStr, pathItem] of Object.entries(paths)) {
    if (!pathItem) continue;
    const pathLevelParams = pathItem.parameters ?? [];

    for (let mi = 0; mi < methodKeys.length; mi++) {
      const key = methodKeys[mi];
      if (!key) continue;
      const operation = pathItem[key] as OasOperation | undefined;
      if (!operation) continue;

      opIndex++;
      if (maxOperations !== undefined && allOperations.length >= maxOperations) continue;

      const operationId = normalizeOperationId(operation.operationId, methods[mi]!, pathStr, opIndex);
      const mergedParams = mergeParameters(pathLevelParams, operation.parameters ?? []);
      const parameters = mergedParams.map(parseParameter).filter((p): p is Param => p !== null);

      const requestBody = operation.requestBody
        ? extractRequestBodySchema(operation.requestBody)
        : undefined;
      const responses = extractResponses(operation.responses ?? {});

      allOperations.push({
        operationId,
        method: methods[mi]!,
        path: pathStr,
        summary: operation.summary,
        description: operation.description,
        tags: operation.tags,
        parameters,
        requestBody,
        responses,
      });
    }
  }

  const totalOperations = opIndex;
  const operations = maxOperations !== undefined ? allOperations.slice(0, maxOperations) : allOperations;

  const meta: ConnectorMeta = { specUrl, specChecksum, totalOperations };

  const connector: Connector = {
    id: connectorId,
    name: connectorName,
    version,
    discoveredAt: new Date().toISOString(),
    discoveryStrategy: 'openapi',
    baseUrl,
    authStrategy,
    operations,
    meta,
  };

  return { connector, specChecksum, totalOperations, warnings };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchSpec(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenAPI spec from ${url}: HTTP ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function extractBaseUrl(doc: OasDoc, warnings: string[]): string {
  if (doc.servers && doc.servers.length > 0) {
    const url = doc.servers[0]?.url;
    if (url) return url.replace(/\/$/, '');
  }
  if (doc.host) {
    const scheme = doc.schemes?.[0] ?? 'https';
    const base = doc.basePath ?? '';
    return `${scheme}://${doc.host}${base}`.replace(/\/$/, '');
  }
  warnings.push('Could not extract baseUrl from spec — using empty string');
  return '';
}

function normalizeOperationId(raw: string | undefined, method: HttpMethod, path: string, index: number): string {
  if (raw && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(raw)) return raw;

  const segments = path
    .split('/')
    .filter(Boolean)
    .map(s =>
      s.startsWith('{')
        ? 'By' + s.slice(1, -1).replace(/^\w/, c => c.toUpperCase())
        : s.replace(/^\w/, c => c.toUpperCase())
    )
    .join('');

  const synthesized = `${method.toLowerCase()}${segments}`;
  return synthesized || `operation_${index}`;
}

function mergeParameters(pathParams: OasParameter[], opParams: OasParameter[]): OasParameter[] {
  const merged = [...pathParams];
  for (const op of opParams) {
    const idx = merged.findIndex(p => p.name === op.name && p.in === op.in);
    if (idx >= 0) {
      merged[idx] = op;
    } else {
      merged.push(op);
    }
  }
  return merged;
}

function parseParameter(raw: OasParameter): Param | null {
  const validIn = ['query', 'path', 'header', 'cookie'];
  if (!validIn.includes(raw.in)) return null;
  return {
    name: raw.name,
    in: raw.in as Param['in'],
    required: raw.required ?? raw.in === 'path',
    description: raw.description,
    schema: (raw.schema ?? (raw.type ? { type: raw.type } : undefined)) as SchemaDef | undefined,
  };
}

function extractRequestBodySchema(
  requestBody: NonNullable<OasOperation['requestBody']>
): SchemaDef | undefined {
  const content = requestBody.content;
  if (!content) return undefined;
  const jsonContent = content['application/json'] ?? Object.values(content)[0];
  if (!jsonContent?.schema) return undefined;
  return jsonContent.schema as SchemaDef;
}

function extractResponses(
  responses: Record<string, { description?: string; content?: Record<string, { schema?: unknown }> }>
): Record<string, SchemaDef> {
  const result: Record<string, SchemaDef> = {};
  for (const [code, response] of Object.entries(responses)) {
    if (!response) continue;
    const content = response.content;
    if (content) {
      const jsonContent = content['application/json'] ?? Object.values(content)[0];
      if (jsonContent?.schema) {
        result[code] = jsonContent.schema as SchemaDef;
        continue;
      }
    }
    if (response.description) {
      result[code] = { description: response.description };
    }
  }
  return result;
}
