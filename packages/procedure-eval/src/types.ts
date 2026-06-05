/**
 * @penelope/procedure-eval — type definitions
 */

export interface Message {
  role: "agent" | "customer";
  content: string;
  at?: string;
  extracted?: Record<string, string>;
}

export interface Recording {
  id: string;
  procedureId: string;
  tenantId: string;
  recordedAt: string;
  messages: Message[];
  extractedFields: Record<string, string>;
  outcome?: string;
}

export interface FieldDiff {
  field: string;
  expected: string | undefined;
  actual: string | undefined;
  match: boolean;
}

export interface TurnDiff {
  turnIndex: number;
  stepId: string | undefined;
  expectedContent: string | undefined;
  actualContent: string | undefined;
  similarity: number;
}

export interface EvalResult {
  recordingId: string;
  procedureId: string;
  matchPercent: number;
  fieldDiffs: FieldDiff[];
  turnDiffs: TurnDiff[];
  passed: boolean;
  durationMs: number;
}

export interface ProcedureStep {
  id: string;
  role: "agent" | "customer";
  template?: string;
  extract?: Array<{ field: string; optional?: boolean }>;
  branch?: Record<string, unknown>;
}

export interface Procedure {
  id: string;
  name: string;
  version: string;
  steps: ProcedureStep[];
}
