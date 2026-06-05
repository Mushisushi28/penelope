/**
 * @penelope/hermes — MCP types
 *
 * Types for the McpHost: server configs, tool descriptors, and invocation requests.
 */

/** Configuration for a single MCP server entry in mcp.json. */
export interface McpServerConfig {
  /** Unique human-readable name for this server (e.g. "github", "filesystem"). */
  name: string;
  /** Transport mechanism: 'stdio' spawns a child process; 'http' connects to a remote endpoint. */
  transport: 'stdio' | 'http';

  // stdio-only fields
  /** Executable to spawn (required when transport='stdio'). */
  command?: string;
  /** CLI arguments passed to the spawned process. */
  args?: string[];
  /** Additional environment variables merged into the child process env. */
  env?: Record<string, string>;

  // http-only fields
  /** Base URL of the remote MCP server (required when transport='http'). */
  url?: string;
}

/** A single tool exposed by an MCP server after capability discovery. */
export interface McpTool {
  /** Name of the MCP server that owns this tool. */
  server: string;
  /** Tool name as returned by the server's tools/list response. */
  name: string;
  /** JSON Schema object describing the tool's input parameters. */
  input_schema: Record<string, unknown>;
  /** Human-readable description from the server. */
  description?: string;
}

/** A request to invoke a specific tool on a specific MCP server. */
export interface McpInvocation {
  /** Name of the MCP server to call. */
  server: string;
  /** Tool name to invoke. */
  tool: string;
  /** Arguments to pass, must satisfy the tool's input_schema. */
  args: Record<string, unknown>;
}
