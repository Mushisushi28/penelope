/**
 * @penelope/procedure-eval — replay engine
 */

import type { Procedure, Recording, EvalResult, FieldDiff, TurnDiff } from "./types.js";

export interface ReplayOptions {
  passThreshold?: number;
  verbose?: boolean;
}

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

function interpolate(template: string, fields: Record<string, string>): string {
  return template.replace(/\{(\w+)(?:\s*\|\s*"[^"]*")?\}/g, (_, key: string) => {
    return fields[key] ?? `{${key}}`;
  });
}

function computeFieldDiffs(procedure: Procedure, recording: Recording): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const actual = recording.extractedFields;

  for (const step of procedure.steps) {
    if (!step.extract) continue;
    for (const extraction of step.extract) {
      const field = extraction.field;
      const value = actual[field];
      diffs.push({ field, expected: value, actual: value, match: value !== undefined });
    }
  }

  return diffs;
}

function computeTurnDiffs(procedure: Procedure, recording: Recording): TurnDiff[] {
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
      expectedContent && actualContent ? tokenSimilarity(expectedContent, actualContent) : 0;

    diffs.push({ turnIndex: i, stepId: step?.id, expectedContent, actualContent, similarity });
  }

  return diffs;
}

export async function replay(
  procedure: Procedure,
  recording: Recording,
  opts: ReplayOptions = {}
): Promise<EvalResult> {
  const start = Date.now();
  const { passThreshold = 70 } = opts;

  const fieldDiffs = computeFieldDiffs(procedure, recording);
  const turnDiffs = computeTurnDiffs(procedure, recording);

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
