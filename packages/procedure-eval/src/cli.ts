#!/usr/bin/env node
/**
 * @penelope/procedure-eval — CLI
 * penelope eval <procedure-path> <recording-path> [--threshold N] [--json]
 */

import { readFile } from "node:fs/promises";
import { replay } from "./replay.js";
import { loadRecording } from "./recorder.js";
import type { Procedure } from "./types.js";

function parseArgs(argv: string[]) {
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

async function main(): Promise<void> {
  const { procedurePath, recordingPath, threshold, json } = parseArgs(process.argv);

  let procedure: Procedure;
  try {
    const raw = await readFile(procedurePath, "utf8");
    procedure = JSON.parse(raw) as Procedure;
  } catch (err) {
    console.error(`Failed to load procedure: ${(err as Error).message}`);
    process.exit(1);
  }

  const recording = await loadRecording(recordingPath);
  const result = await replay(procedure, recording, { passThreshold: threshold });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const status = result.passed ? "PASS" : "FAIL";
    console.log(`${status} — ${result.matchPercent}% match (threshold ${threshold}%)`);
    console.log(`Recording: ${result.recordingId} | Procedure: ${result.procedureId} | ${result.durationMs}ms`);
    if (result.fieldDiffs.length > 0) {
      console.log("\nField diffs:");
      for (const d of result.fieldDiffs) {
        console.log(`  [${d.match ? "OK" : "DIFF"}] ${d.field}: ${d.actual ?? "—"}`);
      }
    }
    if (result.turnDiffs.length > 0) {
      console.log("\nTurn diffs:");
      for (const d of result.turnDiffs) {
        console.log(`  Turn ${d.turnIndex} (${d.stepId ?? "?"}): ${Math.round(d.similarity * 100)}% similarity`);
      }
    }
  }

  process.exit(result.passed ? 0 : 1);
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1); });
