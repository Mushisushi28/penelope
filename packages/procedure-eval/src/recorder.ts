/**
 * @penelope/procedure-eval — recorder
 * Wraps a live agent invocation, captures inputs + outputs as a Recording.
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
  outputDir?: string;
}

export interface RecorderSession {
  readonly recordingId: string;
  turn(customerMessage: string, extractedFields?: Record<string, string>): Promise<string>;
  finish(outcome?: string): Recording;
  save(): Promise<string>;
}

export function createRecorder(agentInvoke: AgentInvokeFn, opts: RecorderOptions): RecorderSession {
  const { procedureId, tenantId, outputDir } = opts;
  const recordingId = opts.recordingId ?? randomUUID();
  const messages: Message[] = [];
  const extractedFields: Record<string, string> = {};
  const recordedAt = new Date().toISOString();

  return {
    get recordingId() { return recordingId; },

    async turn(customerMessage: string, extracted?: Record<string, string>): Promise<string> {
      messages.push({ role: "customer", content: customerMessage, at: new Date().toISOString(), ...(extracted !== undefined ? { extracted } : {}) });
      if (extracted) Object.assign(extractedFields, extracted);
      const agentResponse = await agentInvoke(customerMessage, { ...extractedFields });
      messages.push({ role: "agent", content: agentResponse, at: new Date().toISOString() });
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
        ...(outcome !== undefined ? { outcome } : {}),
      };
    },

    async save(): Promise<string> {
      if (!outputDir) throw new Error("outputDir not set in RecorderOptions");
      await mkdir(outputDir, { recursive: true });
      const dest = join(outputDir, `${recordingId}.json`);
      await writeFile(dest, JSON.stringify(this.finish(), null, 2), "utf8");
      return dest;
    },
  };
}

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
