/**
 * @penelope/connector-discovery — core type definitions
 *
 * Discovery cascade: MCP (tier-1) → API-skill (tier-2) → OpenAPI (tier-3)
 *                    → Browser recipe (tier-4) → Computer-use (tier-5)
 *
 * "tier-4 is always guaranteed" — every service reachable on the web gets at
 * least a browser recipe.  Only tier-5 (computer-use) is used for services
 * that have no public URL at all.
 */

// ── Capability descriptors ─────────────────────────────────────────────────────

export type CapabilityKind =
  | "list-items"
  | "create-item"
  | "update-item"
  | "delete-item"
  | "send-message"
  | "read-messages"
  | "login"
  | "search"
  | "webhook-listen"
  | "custom";

// ── Discovery request ─────────────────────────────────────────────────────────

export interface DiscoveryRequest {
  /** Human-friendly service name, e.g. "Toast POS" or "Vagaro" */
  service: string;
  /** Optional canonical base URL — accelerates spec-URL probing */
  baseUrl?: string;
  /** Which operations the caller needs */
  capabilities: CapabilityKind[];
  /** Owner email — stored in evidence trail, used for promote notifications */
  owner_email: string;
  /** Skip specific tiers during discovery (useful for testing) */
  skipTiers?: DiscoveryTier[];
}

// ── Result tiers ──────────────────────────────────────────────────────────────

export type DiscoveryTier = 1 | 2 | 3 | 4 | 5;

export interface DiscoveryResult {
  /**
   * The tier that produced this result:
   *   1 = MCP server
   *   2 = hand-coded api-skill
   *   3 = OpenAPI spec → hermes registration
   *   4 = browser recipe (open-claude-in-chrome)
   *   5 = computer-use session recording
   */
  tier: DiscoveryTier;
  /** Spec/artifact describing the integration */
  connector_spec: ConnectorSpec;
  /** 0–1 confidence score from the discovery source */
  confidence: number;
  /** Audit trail of what the discoverer tried */
  evidence: Evidence[];
}

// ── Connector spec (union by tier) ────────────────────────────────────────────

export interface McpConnectorSpec {
  kind: "mcp";
  packageName: string;
  version: string;
  registryUrl: string;
  installCommand: string;
}

export interface ApiSkillConnectorSpec {
  kind: "api-skill";
  packagePath: string;
  exportedSymbol: string;
  requiredEnv: string[];
}

export interface OpenApiConnectorSpec {
  kind: "openapi";
  specUrl: string;
  hermesRegistrationId?: string;
  title: string;
  version: string;
}

export interface RecipeConnectorSpec {
  kind: "recipe";
  recipe: Recipe;
}

export interface ComputerUseConnectorSpec {
  kind: "computer-use";
  sessionId: string;
  /** Serialised action sequence recorded from the computer-use session */
  actions: ComputerUseAction[];
  recipe?: Recipe;
}

export type ConnectorSpec =
  | McpConnectorSpec
  | ApiSkillConnectorSpec
  | OpenApiConnectorSpec
  | RecipeConnectorSpec
  | ComputerUseConnectorSpec;

// ── Recipe (browser / computer-use replay) ────────────────────────────────────

export interface RecipeStep {
  /** Human description of this step */
  description: string;
  action:
    | { type: "navigate"; url: string }
    | { type: "click"; selector: string }
    | { type: "fill"; selector: string; value: string }
    | { type: "wait-for"; selector: string; timeout?: number }
    | { type: "extract"; selector: string; as: string }
    | { type: "submit"; selector?: string }
    | { type: "screenshot"; label?: string };
}

export interface Recipe {
  name: string;
  service: string;
  version: string;
  createdAt: string;
  /** Ordered steps the browser driver replays */
  steps: RecipeStep[];
  /** All CSS/XPath selectors referenced, deduplicated for quick validation */
  selectors: string[];
  /** Explicit wait targets (selector or URL fragment) */
  waits: string[];
  /** Env vars the recipe depends on (credentials, API keys) */
  requiredEnv: string[];
}

// ── Computer-use action ───────────────────────────────────────────────────────

export interface ComputerUseAction {
  type: "screenshot" | "mouse_move" | "left_click" | "type" | "key" | "scroll";
  coordinate?: [number, number];
  text?: string;
  key?: string;
  direction?: "up" | "down";
  amount?: number;
  timestamp?: string;
}

// ── Evidence trail ────────────────────────────────────────────────────────────

export interface Evidence {
  tier: DiscoveryTier;
  source: string;
  query?: string;
  outcome: "hit" | "miss" | "error";
  detail: string;
  at: string;
}

// ── Promote eligibility ───────────────────────────────────────────────────────

export interface PromoteCandidate {
  service: string;
  currentTier: DiscoveryTier;
  targetTier: DiscoveryTier;
  recipe: Recipe;
  daysReliable: number;
  proposedSpec: ConnectorSpec;
  owner_email: string;
}
