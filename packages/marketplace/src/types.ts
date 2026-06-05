/**
 * @penelope/marketplace — type definitions
 * Community connector + procedure template registry
 */

export type ItemKind = "connector" | "procedure" | "specialist";

export interface MarketplaceManifest {
  id: string;
  name: string;
  kind: ItemKind;
  version: string;
  author: string;
  license: string;
  /** SHA-256 hex of the payload file */
  sha256: string;
  description: string;
  tags: string[];
  /** URL or relative path to the payload */
  payloadUrl: string;
  createdAt: string; // ISO-8601
}

export interface ConnectorItem extends MarketplaceManifest {
  kind: "connector";
  /** Which channel this connector wires (e.g. "facebook", "sms", "email") */
  channel: string;
  requiredEnv: string[];
}

export interface ProcedureItem extends MarketplaceManifest {
  kind: "procedure";
  /** Vertical this procedure targets (e.g. "detailing", "barbershop") */
  vertical: string;
  /** Estimated conversation turns */
  avgTurns: number;
}

export interface SpecialistItem extends MarketplaceManifest {
  kind: "specialist";
  /** Role label (e.g. "booking-agent", "review-agent") */
  role: string;
  /** Required @penelope packages */
  peerDependencies: Record<string, string>;
}

export type MarketplaceItem = ConnectorItem | ProcedureItem | SpecialistItem;

export interface RemoteIndex {
  updatedAt: string;
  items: MarketplaceManifest[];
}

export interface AuditEntry {
  at: string; // ISO-8601
  action: "install" | "promote" | "remove";
  itemId: string;
  version: string;
  operator: string;
  sandbox: boolean;
}
