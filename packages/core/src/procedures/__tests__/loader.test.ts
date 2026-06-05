/**
 * Tests for the procedure YAML loader.
 *
 * Tests:
 *   1. Valid minimal procedure loads and returns typed object
 *   2. Valid full procedure (auto-service inbound DM) loads correctly
 *   3. Missing required field throws ProcedureLoadError with field name
 *   4. Malformed YAML throws ProcedureLoadError mentioning YAML parse
 *   5. Unknown step kind throws ProcedureLoadError
 *   6. File not found throws ProcedureLoadError
 *   7. loadProcedureSafe returns ok:false on error instead of throwing
 *   8. parseProcedureYaml works without a file path
 */

import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { loadProcedure, loadProcedureSafe, parseProcedureYaml, ProcedureLoadError } from '../loader.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_MINIMAL_YAML = `
schema_version: 1
procedure_id: test-minimal
owner_team: test
specialist_class: test-specialist
trigger:
  kind: inbound_message
  channel: fb-page
inputs:
  required:
    - thread_id
    - inbound_message_text
states:
  - id: greet
    actions:
      - kind: send_message
        template: "Hello!"
`.trim();

const VALID_FULL_YAML = [
  'schema_version: 1',
  'procedure_id: auto-service-fb-inbound',
  'description: Handle incoming Facebook Messenger DMs for an auto-service business',
  'owner_team: auto-service',
  'specialist_class: customer-frontend',
  'trigger:',
  '  kind: inbound_message',
  '  channel: fb-page',
  'inputs:',
  '  required:',
  '    - thread_id',
  '    - inbound_message_text',
  '    - inbound_message_ts',
  '  optional:',
  '    - customer_state_snapshot',
  'runtime_budget:',
  '  max_tokens_per_run: 8000',
  '  max_usd_per_run: 0.25',
  '  max_runs_per_thread_per_day: 6',
  'brand_voice:',
  '  tone: lowercase, conversational, 1-2 sentences',
  '  forbidden_phrases:',
  "    - \"I'd be happy to\"",
  '    - "Of course!"',
  '  emoji_policy: match-customer',
  'states:',
  '  - id: new_inbound',
  '    label: New customer first contact',
  '    when:',
  '      - customer_state.is_none',
  '    actions:',
  '      - kind: ask_question',
  '        question: "hey! what kind of vehicle do you have?"',
  '        store_as: vehicle_info',
  '        approval: auto',
  '      - kind: mark_job_status',
  '        status: qualifying',
  '    next: awaiting_vehicle_info',
  '    approval: auto',
  '  - id: awaiting_vehicle_info',
  '    when:',
  '      - customer_state.vehicle_info',
  '    actions:',
  '      - kind: compute_quote',
  '        pricing_rule_id: regular',
  '        store_as: quote_amount',
  '        out_of_band_approval: team_lead_approve',
  '      - kind: send_message',
  '        template: "for a regular headlight restoration on your {{vehicle_info}}, looking at about ${{quote_amount}}"',
  '      - kind: mark_job_status',
  '        status: quoted',
  '    next: quoted_pending_booking',
  '  - id: quoted_pending_booking',
  '    when:',
  '      - customer_state.intent_to_book',
  '    actions:',
  '      - kind: offer_booking_link',
  '        provider: calendly',
  '        message_template: "awesome, here is a link to pick a time: {{calendly_link}}"',
  '      - kind: mark_job_status',
  '        status: booked',
  '    next: booked',
  'outputs:',
  '  - quote_amount',
  '  - booking_confirmed',
].join('\n');

const MISSING_REQUIRED_FIELD_YAML = `
schema_version: 1
procedure_id: missing-fields
owner_team: test
specialist_class: test
trigger:
  kind: inbound_message
inputs:
  required:
    - thread_id
# states is missing — required field
`.trim();

const MALFORMED_YAML = `
schema_version: 1
procedure_id: bad
states:
  - id: broken
    actions:
      : this is not valid yaml
    ][invalid bracket
`.trim();

const UNKNOWN_STEP_KIND_YAML = `
schema_version: 1
procedure_id: unknown-step
owner_team: test
specialist_class: test
trigger:
  kind: inbound_message
inputs:
  required:
    - thread_id
states:
  - id: greet
    actions:
      - kind: fly_to_the_moon
        destination: luna
`.trim();

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function writeTmpFile(content: string, ext = '.yaml'): string {
  const dir = join(tmpdir(), `penelope-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `procedure${ext}`);
  writeFileSync(path, content, 'utf-8');
  return path;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loadProcedure', () => {
  it('1. valid minimal procedure loads and returns typed object', () => {
    const path = writeTmpFile(VALID_MINIMAL_YAML);
    const proc = loadProcedure(path);
    expect(proc.schema_version).toBe(1);
    expect(proc.procedure_id).toBe('test-minimal');
    expect(proc.states).toHaveLength(1);
    expect(proc.states[0]?.id).toBe('greet');
    expect(proc.states[0]?.actions[0]?.kind).toBe('send_message');
  });

  it('2. valid full procedure loads with all fields', () => {
    const path = writeTmpFile(VALID_FULL_YAML);
    const proc = loadProcedure(path);
    expect(proc.procedure_id).toBe('auto-service-fb-inbound');
    expect(proc.states).toHaveLength(3);
    expect(proc.runtime_budget?.max_tokens_per_run).toBe(8000);
    expect(proc.brand_voice?.emoji_policy).toBe('match-customer');
    expect(proc.outputs).toContain('quote_amount');
    // Check nested step types
    const firstState = proc.states[0];
    expect(firstState?.id).toBe('new_inbound');
    const firstAction = firstState?.actions[0];
    expect(firstAction?.kind).toBe('ask_question');
  });

  it('3. missing required field (states) throws ProcedureLoadError mentioning schema validation', () => {
    const path = writeTmpFile(MISSING_REQUIRED_FIELD_YAML);
    expect(() => loadProcedure(path)).toThrow(ProcedureLoadError);
    try {
      loadProcedure(path);
    } catch (err) {
      expect(err).toBeInstanceOf(ProcedureLoadError);
      const e = err as ProcedureLoadError;
      expect(e.message).toMatch(/Schema validation failed/);
      // The error should mention "states"
      expect(e.message).toMatch(/states/);
    }
  });

  it('4. malformed YAML throws ProcedureLoadError mentioning YAML parse', () => {
    const path = writeTmpFile(MALFORMED_YAML);
    expect(() => loadProcedure(path)).toThrow(ProcedureLoadError);
    try {
      loadProcedure(path);
    } catch (err) {
      expect(err).toBeInstanceOf(ProcedureLoadError);
      const e = err as ProcedureLoadError;
      expect(e.message).toMatch(/YAML parse error/i);
    }
  });

  it('5. unknown step kind throws ProcedureLoadError', () => {
    const path = writeTmpFile(UNKNOWN_STEP_KIND_YAML);
    expect(() => loadProcedure(path)).toThrow(ProcedureLoadError);
    try {
      loadProcedure(path);
    } catch (err) {
      expect(err).toBeInstanceOf(ProcedureLoadError);
      const e = err as ProcedureLoadError;
      // Should be a validation error, not a parse error
      expect(e.message).toMatch(/Schema validation failed/);
    }
  });

  it('6. file not found throws ProcedureLoadError', () => {
    const nonExistent = '/tmp/this-file-does-not-exist-penelope.yaml';
    expect(() => loadProcedure(nonExistent)).toThrow(ProcedureLoadError);
    try {
      loadProcedure(nonExistent);
    } catch (err) {
      expect(err).toBeInstanceOf(ProcedureLoadError);
      const e = err as ProcedureLoadError;
      expect(e.message).toMatch(/not found|not readable/i);
    }
  });

  it('7. loadProcedureSafe returns ok:false on error instead of throwing', () => {
    const path = writeTmpFile(MISSING_REQUIRED_FIELD_YAML);
    const result = loadProcedureSafe(path);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ProcedureLoadError);
    }
  });

  it('8. parseProcedureYaml works with inline YAML string (no file)', () => {
    const proc = parseProcedureYaml(VALID_MINIMAL_YAML);
    expect(proc.procedure_id).toBe('test-minimal');
    expect(proc.states[0]?.id).toBe('greet');
  });
});
