#!/usr/bin/env node
/**
 * @penelope/procedure-eval — CLI
 * Usage:
 *   penelope eval <procedure-path> <recording-path> [--threshold 70]
 */

import { readFile } from "node:fs/promises";
import { replay } from "./replay.js";
import { loadRecording } from "./recorder.js";
import type { Procedure } from "./types.js";

function parseArgs(argv: string[]): {
  procedurePath: string;
  recordingPath: string;
  threshold: number;
  json: boolean;
} {
  const args = argv.slice(2);
  const procedurePath = args[0];
  const recordingPath = args[1];

  if (!procedurePath || !recordingPath) {
    console.error("Usage: penelope eval <procedure-path> <recording-path> [--threshold N] [--json]");
    process.exit(1);
  }

  const thresholdIdx = args.indexOf("--threshold");
  const threshold = thresholdIdx >= 0 ? parseInt(args[thresholdIdx + 1] ?? "70", 10) : 70;
  const json = args.includes("--json");

  return { procedurePath, recordingPath, threshold, json };
}

async function loadProcedure(path: string): Promise<Procedure> {
  const raw = await readFile(path, "utf8");
  // Support both JSON and minimal YAML (JSON is canonical here)
  if (path.endsWith(".json")) {
    return JSON.parse(raw) as Procedure;
  }
  // Very minimal YAML-to-procedure reader for the seed format
  // In production use js-yaml + the core procedure parser.
  throw new Error("JSON procedure format required for eval CLI. Convert YAML via core first.");
}

async function main(): Promise<void> {
  const { procedurePath, recordingPath, threshold, json } = parseArgs(process.argv);

  let procedure: Procedure;
  try {
    procedure = await loadProcedure(procedurePath);
  } catch (err) {
    console.error(`Failed to load procedure: ${(err as Error).message}`);
    process.exit(1);
  }

  let recording;
  try {
    recording = await loadRecording(recordingPath);
  } catch (err) {
    console.error(`Failed to load recording: ${(err as Error).message}`);
    process.exit(1);
  }

  const result = await replay(procedure, recording, { passThreshold: threshold });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const status = result.passed ? "PASS" : "FAIL";
    console.log(`${status} — ${result.matchPercent}% match (threshold ${threshold}%)`);
    console.log(`Recording: ${result.recordingId}`);
    console.log(`Procedure: ${result.procedureId}`);
    console.log(`Duration:  ${result.durationMs}ms`);

    if (result.fieldDiffs.length > 0) {
      console.log("\nField diffs:");
      for (const d of result.fieldDiffs) {
        const mark = d.match ? "OK" : "DIFF";
        console.log(`  [${mark}] ${d.field}: expected=${d.expected ?? "—"} actual=${d.actual ?? "—"}`);
      }
    }

    if (result.turnDiffs.length > 0) {
      console.log("\nTurn diffs:");
      for (const d of result.turnDiffs) {
        const pct = Math.round(d.similarity * 100);
        console.log(`  Turn ${d.turnIndex} (${d.stepId ?? "?"}): ${pct}% similarity`);
      }
    }
  }

  process.exit(result.passed ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
