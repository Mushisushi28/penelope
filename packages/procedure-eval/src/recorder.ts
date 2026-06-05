/**
 * @penelope/procedure-eval — recorder
 *
 * Wraps a live agent invocation, captures inputs + outputs as a Recording.
 * In production, wire `agentInvoke` to the actual Penelope agent runtime.
 */

import { randomUUID } from "node:crypto";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Recording, Message } from "./types.js";

export type AgentInvokeFn = (input: string, context: Record<string, string>) => Promise<string>;

export interface RecorderOptions {
  procedureId: string;
  tenantId: string;
  recordingId?: string;
  /** Directory to persist recordings (optional) */
  outputDir?: string;
}

export interface RecorderSession {
  readonly recordingId: string;
  /** Send a customer message and capture the agent response */
  turn(customerMessage: string, extractedFields?: Record<string, string>): Promise<string>;
  /** Finalise and return the Recording */
  finish(outcome?: string): Recording;
  /** Persist to disk (if outputDir set) */
  save(): Promise<string>;
}

export function createRecorder(
  agentInvoke: AgentInvokeFn,
  opts: RecorderOptions
): RecorderSession {
  const { procedureId, tenantId, outputDir } = opts;
  const recordingId = opts.recordingId ?? randomUUID();
  const messages: Message[] = [];
  const extractedFields: Record<string, string> = {};
  const recordedAt = new Date().toISOString();

  return {
    get recordingId() {
      return recordingId;
    },

    async turn(customerMessage: string, extracted?: Record<string, string>): Promise<string> {
      // Capture the customer message
      messages.push({
        role: "customer",
        content: customerMessage,
        at: new Date().toISOString(),
        extracted,
      });

      if (extracted) {
        Object.assign(extractedFields, extracted);
      }

      // Invoke the agent
      const agentResponse = await agentInvoke(customerMessage, { ...extractedFields });

      // Capture the agent response
      messages.push({
        role: "agent",
        content: agentResponse,
        at: new Date().toISOString(),
      });

      return agentResponse;
    },

    finish(outcome?: string): Recording {
      return {
        id: recordingId,
        procedureId,
        tenantId,
        recordedAt,
        messages: [...messages],
        extractedFields: { ...extractedFields },
        outcome,
      };
    },

    async save(): Promise<string> {
      if (!outputDir) throw new Error("outputDir not set in RecorderOptions");
      await mkdir(outputDir, { recursive: true });
      const filename = `${recordingId}.json`;
      const dest = join(outputDir, filename);
      const recording = this.finish();
      await writeFile(dest, JSON.stringify(recording, null, 2), "utf8");
      return dest;
    },
  };
}

// ---------------------------------------------------------------------------
// Disk I/O helpers
// ---------------------------------------------------------------------------

export async function loadRecording(filePath: string): Promise<Recording> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as Recording;
}

export async function saveRecording(recording: Recording, outputDir: string): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const dest = join(outputDir, `${recording.id}.json`);
  await writeFile(dest, JSON.stringify(recording, null, 2), "utf8");
  return dest;
}
