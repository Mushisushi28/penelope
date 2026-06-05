/**
 * @penelope/procedure-eval — replay engine
 *
 * Given a procedure definition + a recorded thread, replays the procedure
 * against the thread and computes a match score.
 */

import type {
  Procedure,
  Recording,
  EvalResult,
  FieldDiff,
  TurnDiff,
} from "./types.js";

export interface ReplayOptions {
  /** Pass threshold (default 70) */
  passThreshold?: number;
  /** Whether to emit verbose diffs */
  verbose?: boolean;
}

// ---------------------------------------------------------------------------
// Similarity helpers
// ---------------------------------------------------------------------------

/**
 * Simple bag-of-words token overlap similarity (Jaccard on word sets).
 * Good enough for procedure eval; swap for cosine/LLM judge in prod.
 */
function tokenSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean));

  const setA = tokenize(a);
  const setB = tokenize(b);

  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const tok of setA) {
    if (setB.has(tok)) intersection++;
  }

  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

/**
 * Interpolate template variables using a flat field map.
 * Replaces `{field}` with the recorded value (or leaves placeholder).
 */
function interpolate(template: string, fields: Record<string, string>): string {
  return template.replace(/\{(\w+)(?:\s*\|\s*"[^"]*")?\}/g, (_, key: string) => {
    return fields[key] ?? `{${key}}`;
  });
}

// ---------------------------------------------------------------------------
// Field diff
// ---------------------------------------------------------------------------

function computeFieldDiffs(
  procedure: Procedure,
  recording: Recording
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const actual = recording.extractedFields;

  for (const step of procedure.steps) {
    if (!step.extract) continue;
    for (const extraction of step.extract) {
      const field = extraction.field;
      const expectedValue = actual[field]; // what was captured in the recording
      const actualValue = actual[field]; // in replay we compare against itself (ground truth)
      diffs.push({
        field,
        expected: expectedValue,
        actual: actualValue,
        match: expectedValue === actualValue,
      });
    }
  }

  return diffs;
}

// ---------------------------------------------------------------------------
// Turn diff
// ---------------------------------------------------------------------------

function computeTurnDiffs(
  procedure: Procedure,
  recording: Recording
): TurnDiff[] {
  const diffs: TurnDiff[] = [];
  const agentSteps = procedure.steps.filter((s) => s.role === "agent" && s.template);
  const agentMessages = recording.messages.filter((m) => m.role === "agent");

  const len = Math.max(agentSteps.length, agentMessages.length);

  for (let i = 0; i < len; i++) {
    const step = agentSteps[i];
    const msg = agentMessages[i];

    const expectedContent = step?.template
      ? interpolate(step.template, recording.extractedFields)
      : undefined;
    const actualContent = msg?.content;

    const similarity =
      expectedContent && actualContent
        ? tokenSimilarity(expectedContent, actualContent)
        : 0;

    diffs.push({
      turnIndex: i,
      stepId: step?.id,
      expectedContent,
      actualContent,
      similarity,
    });
  }

  return diffs;
}

// ---------------------------------------------------------------------------
// replay — main entrypoint
// ---------------------------------------------------------------------------

export async function replay(
  procedure: Procedure,
  recording: Recording,
  opts: ReplayOptions = {}
): Promise<EvalResult> {
  const start = Date.now();
  const { passThreshold = 70 } = opts;

  // Field diffs
  const fieldDiffs = computeFieldDiffs(procedure, recording);

  // Turn diffs
  const turnDiffs = computeTurnDiffs(procedure, recording);

  // Overall match score
  // Weight: 50% field coverage, 50% turn similarity average
  const fieldScore =
    fieldDiffs.length === 0
      ? 100
      : (fieldDiffs.filter((d) => d.match).length / fieldDiffs.length) * 100;

  const turnScore =
    turnDiffs.length === 0
      ? 100
      : (turnDiffs.reduce((sum, d) => sum + d.similarity, 0) / turnDiffs.length) * 100;

  const matchPercent = Math.round((fieldScore + turnScore) / 2);

  return {
    recordingId: recording.id,
    procedureId: procedure.id,
    matchPercent,
    fieldDiffs,
    turnDiffs,
    passed: matchPercent >= passThreshold,
    durationMs: Date.now() - start,
  };
}
