/**
 * @penelope/marketplace — type definitions
 */

export type ItemKind = "connector" | "procedure" | "specialist";

export interface MarketplaceManifest {
  id: string;
  name: string;
  kind: ItemKind;
  version: string;
  author: string;
  license: string;
  sha256: string;
  description: string;
  tags: string[];
  payloadUrl: string;
  createdAt: string;
}

export interface ConnectorItem extends MarketplaceManifest {
  kind: "connector";
  channel: string;
  requiredEnv: string[];
}

export interface ProcedureItem extends MarketplaceManifest {
  kind: "procedure";
  vertical: string;
  avgTurns: number;
}

export interface SpecialistItem extends MarketplaceManifest {
  kind: "specialist";
  role: string;
  peerDependencies: Record<string, string>;
}

export type MarketplaceItem = ConnectorItem | ProcedureItem | SpecialistItem;

export interface RemoteIndex {
  updatedAt: string;
  items: MarketplaceManifest[];
}

export interface AuditEntry {
  at: string;
  action: "install" | "promote" | "remove";
  itemId: string;
  version: string;
  operator: string;
  sandbox: boolean;
}
