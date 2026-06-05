export type {
  Connector,
  Operation,
  Param,
  AuthStrategy,
  ApiKeyAuth,
  BasicAuth,
  OAuth2Auth,
  SchemaDef,
  HttpMethod,
  InvokeRequest,
  InvokeResult,
  TenantCredentials,
  ConnectorMeta,
  DiscoveryStrategy,
} from './types.js';

export { ConnectorRegistry, getDefaultRegistry } from './registry.js';
export { discoverFromOpenApi } from './discovery/openapi.js';
export type { OpenApiDiscoveryOptions, OpenApiDiscoveryResult } from './discovery/openapi.js';
export { buildRequest, executeRequest, invoke, findOp } from './invoke.js';

// MCP host — stdio + HTTP transport
export { McpHost } from './mcp/host.js';
export type { McpServerConfig, McpTool, McpInvocation } from './mcp/types.js';
