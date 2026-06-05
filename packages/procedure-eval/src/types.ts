/**
 * @penelope/procedure-eval — type definitions
 * Replay harness for procedure testing against recorded threads.
 */

/** A single message in a conversation thread */
export interface Message {
  role: "agent" | "customer";
  content: string;
  /** ISO-8601 timestamp (optional) */
  at?: string;
  /** Extracted fields at this turn */
  extracted?: Record<string, string>;
}

/** A recorded conversation thread with metadata */
export interface Recording {
  id: string;
  procedureId: string;
  tenantId: string;
  recordedAt: string; // ISO-8601
  messages: Message[];
  /** Final extracted fields across all turns */
  extractedFields: Record<string, string>;
  /** Outcome label, e.g. "booked", "declined", "closed" */
  outcome?: string;
}

/** A single field-level diff between expected and actual values */
export interface FieldDiff {
  field: string;
  expected: string | undefined;
  actual: string | undefined;
  match: boolean;
}

/** Diff between expected and actual turn content */
export interface TurnDiff {
  turnIndex: number;
  stepId: string | undefined;
  expectedContent: string | undefined;
  actualContent: string | undefined;
  /** Simple token-overlap match ratio 0–1 */
  similarity: number;
}

/** Full result of a replay run */
export interface EvalResult {
  recordingId: string;
  procedureId: string;
  /** Overall match percentage (0–100) */
  matchPercent: number;
  /** Field-level diffs */
  fieldDiffs: FieldDiff[];
  /** Turn-level diffs */
  turnDiffs: TurnDiff[];
  /** True if matchPercent >= threshold */
  passed: boolean;
  durationMs: number;
}

/** A single procedure step (simplified for eval) */
export interface ProcedureStep {
  id: string;
  role: "agent" | "customer";
  template?: string;
  extract?: Array<{ field: string; optional?: boolean }>;
  branch?: Record<string, unknown>;
}

/** Simplified procedure definition (parsed from YAML) */
export interface Procedure {
  id: string;
  name: string;
  version: string;
  steps: ProcedureStep[];
}
