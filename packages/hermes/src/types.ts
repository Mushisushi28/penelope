/**
 * @penelope/hermes — Core types
 *
 * Connector, Operation, and Param types for the Hermes connector system.
 * Vendored + simplified from loom/src/hermes/connector.ts.
 */

export interface ApiKeyAuth {
  type: 'api-key';
  placement: 'header' | 'query';
  headerName?: string;
  queryParam?: string;
  prefix?: string;
  envVar: string;
}

export interface OAuth2Auth {
  type: 'oauth2';
  flow: 'client_credentials' | 'authorization_code' | 'device_code';
  tokenUrl: string;
  scopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
}

export interface BasicAuth {
  type: 'basic';
  usernameEnv: string;
  passwordEnv: string;
}

export type AuthStrategy = ApiKeyAuth | OAuth2Auth | BasicAuth;

export interface SchemaDef {
  type?: string;
  format?: string;
  description?: string;
  properties?: Record<string, SchemaDef>;
  items?: SchemaDef;
  required?: string[];
  enum?: unknown[];
  $ref?: string;
  [key: string]: unknown;
}

export interface Param {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required: boolean;
  description?: string;
  schema?: SchemaDef;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface Operation {
  operationId: string;
  method: HttpMethod;
  path: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Param[];
  requestBody?: SchemaDef;
  responses?: Record<string, SchemaDef>;
}

export type DiscoveryStrategy = 'openapi' | 'manual';

export interface ConnectorMeta {
  specUrl?: string;
  specChecksum?: string;
  totalOperations?: number;
}

export interface Connector {
  id: string;
  name: string;
  version: string;
  discoveredAt: string;
  discoveryStrategy: DiscoveryStrategy;
  baseUrl: string;
  authStrategy: AuthStrategy;
  operations: Operation[];
  meta?: ConnectorMeta;
}

export interface TenantCredentials {
  [envVar: string]: string;
}

export interface InvokeRequest {
  connectorId: string;
  operationId: string;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  body?: unknown;
}

export interface InvokeResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
  headers: Record<string, string>;
  requestId?: string;
}
