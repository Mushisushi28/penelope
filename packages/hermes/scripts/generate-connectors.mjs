/**
 * Generate bundled connector JSONs for stripe, calendly, twilio-messaging.
 * Run: node scripts/generate-connectors.mjs
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = join(__dirname, '..', 'connectors');
mkdirSync(OUT_DIR, { recursive: true });

const SPECS = [
  {
    id: 'stripe',
    name: 'Stripe',
    url: 'https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json',
    authStrategy: {
      type: 'api-key',
      placement: 'header',
      headerName: 'Authorization',
      prefix: 'Bearer ',
      envVar: 'STRIPE_API_KEY',
    },
  },
  {
    id: 'calendly',
    name: 'Calendly',
    url: 'https://calendly.stoplight.io/api/v1/projects/calendly/api-docs/nodes/reference/calendly-api/openapi.yaml?fromExportButton=true',
    authStrategy: {
      type: 'api-key',
      placement: 'header',
      headerName: 'Authorization',
      prefix: 'Bearer ',
      envVar: 'CALENDLY_API_KEY',
    },
  },
  {
    id: 'twilio-messaging',
    name: 'Twilio Messaging',
    url: 'https://raw.githubusercontent.com/twilio/twilio-oai/main/spec/json/twilio_messaging_v1.json',
    authStrategy: {
      type: 'basic',
      usernameEnv: 'TWILIO_ACCOUNT_SID',
      passwordEnv: 'TWILIO_AUTH_TOKEN',
    },
  },
];

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const METHOD_MAP = { get: 'GET', post: 'POST', put: 'PUT', patch: 'PATCH', delete: 'DELETE' };

function normalizeOperationId(raw, method, path, index) {
  if (raw && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(raw)) return raw;
  const segments = path.split('/').filter(Boolean).map(s =>
    s.startsWith('{')
      ? 'By' + s.slice(1, -1).replace(/^\w/, c => c.toUpperCase())
      : s.replace(/^\w/, c => c.toUpperCase())
  ).join('');
  return `${method.toLowerCase()}${segments}` || `operation_${index}`;
}

function mergeParameters(pathParams, opParams) {
  const merged = [...pathParams];
  for (const op of opParams) {
    const idx = merged.findIndex(p => p.name === op.name && p.in === op.in);
    if (idx >= 0) merged[idx] = op;
    else merged.push(op);
  }
  return merged;
}

function parseParameter(raw) {
  const validIn = ['query', 'path', 'header', 'cookie'];
  if (!validIn.includes(raw.in)) return null;
  return {
    name: raw.name,
    in: raw.in,
    required: raw.required ?? raw.in === 'path',
    description: raw.description,
    schema: raw.schema ?? (raw.type ? { type: raw.type } : undefined),
  };
}

function extractBaseUrl(doc) {
  if (doc.servers?.length > 0 && doc.servers[0].url) return doc.servers[0].url.replace(/\/$/, '');
  if (doc.host) {
    const scheme = doc.schemes?.[0] ?? 'https';
    const base = doc.basePath ?? '';
    return `${scheme}://${doc.host}${base}`.replace(/\/$/, '');
  }
  return '';
}

async function generateConnector(spec) {
  console.log(`  Fetching ${spec.url} ...`);
  const res = await fetch(spec.url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${spec.url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString('utf-8');
  const checksum = createHash('sha256').update(buf).digest('hex');

  let doc;
  try { doc = JSON.parse(text); }
  catch { doc = yaml.load(text); }

  const baseUrl = extractBaseUrl(doc);
  const version = doc.info?.version ?? doc.openapi ?? doc.swagger ?? 'unknown';
  const paths = doc.paths ?? {};
  const operations = [];
  let opIndex = 0;

  for (const [pathStr, pathItem] of Object.entries(paths)) {
    if (!pathItem) continue;
    const pathLevelParams = pathItem.parameters ?? [];
    for (const method of METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      opIndex++;
      const operationId = normalizeOperationId(operation.operationId, METHOD_MAP[method], pathStr, opIndex);
      const merged = mergeParameters(pathLevelParams, operation.parameters ?? []);
      const parameters = merged.map(parseParameter).filter(Boolean);
      const requestBody = operation.requestBody?.content
        ? (() => {
          const c = operation.requestBody.content['application/json'] ?? Object.values(operation.requestBody.content)[0];
          return c?.schema;
        })()
        : undefined;
      const responses = {};
      for (const [code, resp] of Object.entries(operation.responses ?? {})) {
        if (!resp) continue;
        const c = resp.content?.['application/json'] ?? (resp.content ? Object.values(resp.content)[0] : null);
        if (c?.schema) responses[code] = c.schema;
        else if (resp.description) responses[code] = { description: resp.description };
      }
      operations.push({
        operationId,
        method: METHOD_MAP[method],
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

  const connector = {
    id: spec.id,
    name: spec.name,
    version,
    discoveredAt: new Date().toISOString(),
    discoveryStrategy: 'openapi',
    baseUrl,
    authStrategy: spec.authStrategy,
    operations,
    meta: { specUrl: spec.url, specChecksum: checksum, totalOperations: opIndex },
  };

  const outPath = join(OUT_DIR, `${spec.id}.connector.json`);
  writeFileSync(outPath, JSON.stringify(connector, null, 2), 'utf-8');
  console.log(`  -> ${outPath} (${operations.length} ops)`);
  return connector;
}

(async () => {
  console.log('Generating connectors...\n');
  for (const spec of SPECS) {
    console.log(`[${spec.id}]`);
    try {
      await generateConnector(spec);
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
    }
  }
  console.log('\nDone.');
})();
