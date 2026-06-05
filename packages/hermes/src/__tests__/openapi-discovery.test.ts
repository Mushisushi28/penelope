/**
 * @penelope/hermes — OpenAPI discovery unit tests
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { discoverFromOpenApi } from '../discovery/openapi.js';
import type { OpenApiDiscoveryOptions } from '../discovery/openapi.js';

// Minimal OAS 3.0 spec fixture
const MINIMAL_SPEC = {
  openapi: '3.0.0',
  info: { title: 'Test API', version: '1.2.3' },
  servers: [{ url: 'https://api.example.com/v1' }],
  paths: {
    '/users': {
      get: {
        operationId: 'listUsers',
        summary: 'List users',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'Success',
            content: { 'application/json': { schema: { type: 'array' } } },
          },
        },
      },
      post: {
        operationId: 'createUser',
        summary: 'Create user',
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', properties: { name: { type: 'string' } } },
            },
          },
        },
        responses: { '201': { description: 'Created' } },
      },
    },
    '/users/{userId}': {
      parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        operationId: 'getUser',
        summary: 'Get user by id',
        responses: { '200': { description: 'User' } },
      },
      delete: {
        summary: 'Delete user',
        responses: { '204': { description: 'Deleted' } },
      },
    },
  },
};

const AUTH: OpenApiDiscoveryOptions['authStrategy'] = {
  type: 'api-key',
  placement: 'header',
  headerName: 'Authorization',
  prefix: 'Bearer ',
  envVar: 'TEST_API_KEY',
};

function mockFetch(body: unknown, contentType = 'application/json'): void {
  const responseBody = contentType === 'application/json'
    ? JSON.stringify(body)
    : String(body);

  const encoded = new TextEncoder().encode(responseBody);
  const ab = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);

  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    arrayBuffer: async () => ab,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('discoverFromOpenApi', () => {
  it('extracts connector metadata', async () => {
    mockFetch(MINIMAL_SPEC);
    const { connector } = await discoverFromOpenApi({
      specUrl: 'https://example.com/spec.json',
      authStrategy: AUTH,
      connectorId: 'test',
      connectorName: 'Test',
    });
    expect(connector.id).toBe('test');
    expect(connector.name).toBe('Test');
    expect(connector.version).toBe('1.2.3');
    expect(connector.baseUrl).toBe('https://api.example.com/v1');
    expect(connector.discoveryStrategy).toBe('openapi');
  });

  it('counts operations correctly', async () => {
    mockFetch(MINIMAL_SPEC);
    const { connector, totalOperations } = await discoverFromOpenApi({
      specUrl: 'https://example.com/spec.json',
      authStrategy: AUTH,
      connectorId: 'test',
      connectorName: 'Test',
    });
    expect(connector.operations.length).toBe(4); // GET /users, POST /users, GET /users/{userId}, DELETE /users/{userId}
    expect(totalOperations).toBe(4);
  });

  it('preserves explicit operationId', async () => {
    mockFetch(MINIMAL_SPEC);
    const { connector } = await discoverFromOpenApi({
      specUrl: 'https://example.com/spec.json',
      authStrategy: AUTH,
      connectorId: 'test',
      connectorName: 'Test',
    });
    const ops = connector.operations.map(o => o.operationId);
    expect(ops).toContain('listUsers');
    expect(ops).toContain('createUser');
    expect(ops).toContain('getUser');
  });

  it('synthesizes operationId when missing', async () => {
    mockFetch(MINIMAL_SPEC);
    const { connector } = await discoverFromOpenApi({
      specUrl: 'https://example.com/spec.json',
      authStrategy: AUTH,
      connectorId: 'test',
      connectorName: 'Test',
    });
    const deleteOp = connector.operations.find(o => o.method === 'DELETE');
    expect(deleteOp).toBeDefined();
    expect(deleteOp!.operationId).toMatch(/^delete/i);
  });

  it('parses query parameters', async () => {
    mockFetch(MINIMAL_SPEC);
    const { connector } = await discoverFromOpenApi({
      specUrl: 'https://example.com/spec.json',
      authStrategy: AUTH,
      connectorId: 'test',
      connectorName: 'Test',
    });
    const listOp = connector.operations.find(o => o.operationId === 'listUsers');
    expect(listOp?.parameters).toHaveLength(1);
    expect(listOp?.parameters?.[0]?.name).toBe('limit');
    expect(listOp?.parameters?.[0]?.in).toBe('query');
    expect(listOp?.parameters?.[0]?.required).toBe(false);
  });

  it('inherits path-level parameters', async () => {
    mockFetch(MINIMAL_SPEC);
    const { connector } = await discoverFromOpenApi({
      specUrl: 'https://example.com/spec.json',
      authStrategy: AUTH,
      connectorId: 'test',
      connectorName: 'Test',
    });
    const getUser = connector.operations.find(o => o.operationId === 'getUser');
    const userIdParam = getUser?.parameters?.find(p => p.name === 'userId');
    expect(userIdParam).toBeDefined();
    expect(userIdParam!.in).toBe('path');
    expect(userIdParam!.required).toBe(true);
  });

  it('extracts requestBody schema', async () => {
    mockFetch(MINIMAL_SPEC);
    const { connector } = await discoverFromOpenApi({
      specUrl: 'https://example.com/spec.json',
      authStrategy: AUTH,
      connectorId: 'test',
      connectorName: 'Test',
    });
    const createOp = connector.operations.find(o => o.operationId === 'createUser');
    expect(createOp?.requestBody).toBeDefined();
    expect((createOp?.requestBody as Record<string, unknown>)?.type).toBe('object');
  });

  it('respects maxOperations cap', async () => {
    mockFetch(MINIMAL_SPEC);
    const { connector, totalOperations } = await discoverFromOpenApi({
      specUrl: 'https://example.com/spec.json',
      authStrategy: AUTH,
      connectorId: 'test',
      connectorName: 'Test',
      maxOperations: 2,
    });
    expect(connector.operations.length).toBe(2);
    expect(totalOperations).toBe(4); // full count still reported
  });

  it('stores authStrategy on connector', async () => {
    mockFetch(MINIMAL_SPEC);
    const { connector } = await discoverFromOpenApi({
      specUrl: 'https://example.com/spec.json',
      authStrategy: AUTH,
      connectorId: 'test',
      connectorName: 'Test',
    });
    expect(connector.authStrategy).toEqual(AUTH);
  });

  it('computes specChecksum', async () => {
    mockFetch(MINIMAL_SPEC);
    const { specChecksum } = await discoverFromOpenApi({
      specUrl: 'https://example.com/spec.json',
      authStrategy: AUTH,
      connectorId: 'test',
      connectorName: 'Test',
    });
    expect(specChecksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    }));
    await expect(discoverFromOpenApi({
      specUrl: 'https://example.com/spec.json',
      authStrategy: AUTH,
      connectorId: 'test',
      connectorName: 'Test',
    })).rejects.toThrow('HTTP 404');
  });

  it('parses YAML specs', async () => {
    const yamlSpec = `
openapi: 3.0.0
info:
  title: YAML API
  version: 0.1.0
servers:
  - url: https://yaml.example.com
paths:
  /ping:
    get:
      operationId: ping
      summary: Ping
      responses:
        '200':
          description: Pong
`;
    const enc = new TextEncoder().encode(yamlSpec);
    const ab = enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.byteLength);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => ab,
    }));
    const { connector } = await discoverFromOpenApi({
      specUrl: 'https://example.com/spec.yaml',
      authStrategy: AUTH,
      connectorId: 'yaml-test',
      connectorName: 'YAML Test',
    });
    expect(connector.operations).toHaveLength(1);
    expect(connector.operations[0]!.operationId).toBe('ping');
    expect(connector.baseUrl).toBe('https://yaml.example.com');
  });
});
