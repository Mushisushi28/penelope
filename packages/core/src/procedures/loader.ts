/**
 * Procedure YAML loader.
 *
 * Reads a procedure YAML file from disk, parses it, validates it
 * against ProcedureSchema, and returns a typed Procedure object.
 *
 * Throws on:
 *   - File not found
 *   - Malformed YAML (YAML parse error)
 *   - Schema validation failure (ZodError, formatted as human-readable string)
 *
 * Specialists call this at spawn time. A malformed procedure prevents spawn.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { ZodError } from 'zod';
import { validateProcedure, safeParseProcedure } from './schema.js';
import type { Procedure } from './types.js';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class ProcedureLoadError extends Error {
  constructor(
    public readonly path: string,
    public readonly cause_detail: string,
    cause?: unknown,
  ) {
    super(`Failed to load procedure at ${path}: ${cause_detail}`);
    this.name = 'ProcedureLoadError';
    if (cause instanceof Error) {
      this.stack = this.stack + '\nCaused by: ' + cause.stack;
    }
  }
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load and validate a procedure YAML file.
 *
 * @param filePath  Absolute or relative path to the .yaml file.
 * @returns         Fully validated Procedure object.
 * @throws          ProcedureLoadError on any failure.
 */
export function loadProcedure(filePath: string): Procedure {
  const absPath = resolve(filePath);

  // 1. Read file
  let raw: string;
  try {
    raw = readFileSync(absPath, { encoding: 'utf-8' });
  } catch (err) {
    throw new ProcedureLoadError(
      absPath,
      `File not found or not readable`,
      err,
    );
  }

  // 2. Parse YAML
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new ProcedureLoadError(
      absPath,
      `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  if (parsed === null || typeof parsed !== 'object') {
    throw new ProcedureLoadError(
      absPath,
      'YAML file did not produce an object (got null or primitive)',
    );
  }

  // 3. Validate against schema
  try {
    return validateProcedure(parsed) as Procedure;
  } catch (err) {
    if (err instanceof ZodError) {
      const issues = err.issues
        .map((i) => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new ProcedureLoadError(
        absPath,
        `Schema validation failed:\n${issues}`,
        err,
      );
    }
    throw new ProcedureLoadError(absPath, 'Unexpected validation error', err);
  }
}

/**
 * Safe variant — returns { ok, procedure, error } instead of throwing.
 * Useful when caller wants to handle errors gracefully rather than crash.
 */
export function loadProcedureSafe(filePath: string): {
  ok: true;
  procedure: Procedure;
} | {
  ok: false;
  error: ProcedureLoadError;
} {
  try {
    return { ok: true, procedure: loadProcedure(filePath) };
  } catch (err) {
    if (err instanceof ProcedureLoadError) {
      return { ok: false, error: err };
    }
    return {
      ok: false,
      error: new ProcedureLoadError(filePath, String(err), err),
    };
  }
}

/**
 * Parse a YAML string directly (useful for tests or in-memory procedures).
 * Equivalent to loadProcedure but takes raw YAML content instead of a path.
 */
export function parseProcedureYaml(content: string, sourcePath = '<inline>'): Procedure {
  let parsed: unknown;
  try {
    parsed = yaml.load(content);
  } catch (err) {
    throw new ProcedureLoadError(
      sourcePath,
      `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  if (parsed === null || typeof parsed !== 'object') {
    throw new ProcedureLoadError(
      sourcePath,
      'YAML did not produce an object',
    );
  }

  const result = safeParseProcedure(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new ProcedureLoadError(
      sourcePath,
      `Schema validation failed:\n${issues}`,
      result.error,
    );
  }

  return result.data as Procedure;
}
