// procedure-canvas.test.mjs — round-trip tests for parse↔compile
// Uses node:test (Node 20+). No test framework required.
//
// js-yaml shim: the browser modules read window.jsyaml / global._jsyaml.
// We inject global._jsyaml before importing so the modules don't throw.

import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── Shim js-yaml into the global the modules expect ─────────────────────────
// The workspace root has js-yaml; the dashboard package does not.
const jsyamlPath = path.resolve(__dirname, '../../../node_modules/js-yaml/index.js');
global._jsyaml = require(jsyamlPath);

// ── Import modules under test ────────────────────────────────────────────────
const { parseFromYaml }      = await import('../public/js/procedure-canvas/parse-from-yaml.js');
const { compileToYaml }      = await import('../public/js/procedure-canvas/compile-to-yaml.js');
const { NODE_TYPES, stepKindToNodeType } = await import('../public/js/procedure-canvas/node-types.js');

// ── Helpers ──────────────────────────────────────────────────────────────────
function roundTrip(yamlStr) {
  const graph = parseFromYaml(yamlStr);
  return compileToYaml(graph);
}

function makeYaml(states, trigger = { event: 'new_inquiry' }, extra = {}) {
  return global._jsyaml.dump({
    schema_version: 1,
    id: 'test-proc',
    name: 'Test Procedure',
    trigger,
    states,
    ...extra,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('NODE_TYPES has all 5 required types', () => {
  const required = ['trigger', 'channel-send', 'specialist-call', 'condition', 'wait'];
  for (const t of required) {
    assert.ok(NODE_TYPES[t], `Missing node type: ${t}`);
  }
});

test('stepKindToNodeType covers all known step kinds', () => {
  const cases = [
    ['send_message',       'channel-send'],
    ['ask_question',       'channel-send'],
    ['offer_booking_link', 'channel-send'],
    ['send_review_request','channel-send'],
    ['send_invoice',       'channel-send'],
    ['compute_quote',      'specialist-call'],
    ['lookup_external',    'specialist-call'],
    ['emit_bus_event',     'specialist-call'],
    ['escalate',           'specialist-call'],
    ['mark_job_status',    'specialist-call'],
    ['log_audit',          'specialist-call'],
    ['set_state',          'specialist-call'],
    ['schedule_followup',  'specialist-call'],
    ['compute_structured', 'specialist-call'],
    ['classify_text',      'specialist-call'],
    ['wait_for_event',     'wait'],
    ['__unknown__',        'unsupported'],
  ];
  for (const [kind, expected] of cases) {
    assert.equal(stepKindToNodeType(kind), expected, `stepKindToNodeType('${kind}') should be '${expected}'`);
  }
});

test('empty procedure returns no nodes, no edges', () => {
  const { nodes, edges } = parseFromYaml({ schema_version: 1, id: 'empty', trigger: {}, states: [] });
  assert.equal(nodes.length, 1, 'should have trigger node only');
  assert.equal(edges.length, 0);
});

test('single channel-send state round-trip preserves label and message', () => {
  const yaml = makeYaml([{
    id: 'greet',
    label: 'Greet customer',
    actions: [{ kind: 'send_message', message: 'Hello {{name}}!' }],
  }]);

  const roundTripped = roundTrip(yaml);
  const doc = global._jsyaml.load(roundTripped);

  assert.equal(doc.states.length, 1);
  assert.equal(doc.states[0].id, 'greet');
  assert.equal(doc.states[0].label, 'Greet customer');
  assert.equal(doc.states[0].actions[0].kind, 'send_message');
  assert.equal(doc.states[0].actions[0].message, 'Hello {{name}}!');
});

test('trigger event field is preserved through round-trip', () => {
  const yaml = makeYaml([], { event: 'customer_reply', channel: 'sms' });
  const roundTripped = roundTrip(yaml);
  const doc = global._jsyaml.load(roundTripped);

  assert.equal(doc.trigger.event, 'customer_reply');
  assert.equal(doc.trigger.channel, 'sms');
});

test('trigger → first state edge is created', () => {
  const yaml = makeYaml([{
    id: 'first',
    label: 'First state',
    actions: [{ kind: 'send_message', message: 'Hi' }],
  }]);
  const { nodes, edges } = parseFromYaml(yaml);
  const triggerNode = nodes.find(n => n.type === 'trigger');
  const firstStateNode = nodes.find(n => n.data.stateId === 'first');

  assert.ok(triggerNode, 'trigger node must exist');
  assert.ok(firstStateNode, 'first state node must exist');

  const triggerEdge = edges.find(e => e.source === triggerNode.id && e.target === firstStateNode.id);
  assert.ok(triggerEdge, 'trigger → first state edge must exist');
});

test('branching condition node has two labeled edges', () => {
  const yaml = makeYaml([
    {
      id: 'branch_decision',
      label: 'Branch: approve?',
      actions: [{ kind: 'ask_question', message: 'Approve?' }],
      next: { yes: 'approved', no: 'rejected' },
    },
    { id: 'approved', label: 'Approved', actions: [{ kind: 'send_message', message: 'Approved!' }] },
    { id: 'rejected', label: 'Rejected', actions: [{ kind: 'send_message', message: 'Rejected.' }] },
  ]);
  const { nodes, edges } = parseFromYaml(yaml);

  const branchNode = nodes.find(n => n.data.stateId === 'branch_decision');
  assert.ok(branchNode, 'branch node must exist');
  assert.equal(branchNode.type, 'condition');

  const branchEdges = edges.filter(e => e.source === branchNode.id);
  assert.equal(branchEdges.length, 2, 'condition node must have exactly 2 outgoing edges');

  const labels = branchEdges.map(e => e.label).sort();
  assert.deepEqual(labels, ['no', 'yes']);
});

test('wait node timeout field is preserved', () => {
  const yaml = makeYaml([{
    id: 'hold',
    label: 'Wait for reply',
    actions: [{ kind: 'wait_for_event', event: 'customer_reply', timeout: '24h' }],
  }]);

  const roundTripped = roundTrip(yaml);
  const doc = global._jsyaml.load(roundTripped);

  assert.equal(doc.states[0].actions[0].kind, 'wait_for_event');
  assert.equal(doc.states[0].actions[0].timeout, '24h');
});

test('specialist-call node is detected from compute_quote kind', () => {
  const yaml = makeYaml([{
    id: 'calc',
    label: 'Calculate quote',
    actions: [{ kind: 'compute_quote', specialist: 'quote_agent', args: { sqft: 100 } }],
  }]);
  const { nodes } = parseFromYaml(yaml);
  const calcNode = nodes.find(n => n.data.stateId === 'calc');

  assert.equal(calcNode.type, 'specialist-call');
  assert.equal(calcNode.data.specialist, 'quote_agent');
});

test('unknown step kind (classify_text) is preserved through round-trip', () => {
  const yaml = makeYaml([{
    id: 'classify',
    label: 'Classify intent',
    actions: [{ kind: 'classify_text', model: 'fast', classes: ['interested', 'not_interested'] }],
    next: 'follow_up',
  }, {
    id: 'follow_up',
    label: 'Follow up',
    actions: [{ kind: 'send_message', message: 'Thanks!' }],
  }]);

  const roundTripped = roundTrip(yaml);
  const doc = global._jsyaml.load(roundTripped);

  const classifyState = doc.states.find(s => s.id === 'classify');
  assert.equal(classifyState.actions[0].kind, 'classify_text');
  // model and classes are non-editor fields preserved from _raw
  assert.equal(classifyState.actions[0].model, 'fast');
  assert.deepEqual(classifyState.actions[0].classes, ['interested', 'not_interested']);
});

test('label edit is reflected in compiled YAML', () => {
  const yaml = makeYaml([{
    id: 'greet',
    label: 'Old label',
    actions: [{ kind: 'send_message', message: 'Hi' }],
  }]);

  const graph = parseFromYaml(yaml);

  // Simulate user editing the label in the inspector
  const stateNode = graph.nodes.find(n => n.data.stateId === 'greet');
  stateNode.data.label = 'New label edited';

  const compiled = compileToYaml(graph);
  const doc = global._jsyaml.load(compiled);

  assert.equal(doc.states[0].label, 'New label edited');
});

test('extra top-level fields (pricing_formula) are preserved through round-trip', () => {
  const yaml = makeYaml(
    [{ id: 'greet', label: 'Greet', actions: [{ kind: 'send_message', message: 'Hi' }] }],
    { event: 'new_inquiry' },
    { pricing_formula: 'base_price * 1.2', version_tag: 'v3' }
  );

  const roundTripped = roundTrip(yaml);
  const doc = global._jsyaml.load(roundTripped);

  assert.equal(doc.pricing_formula, 'base_price * 1.2');
  assert.equal(doc.version_tag, 'v3');
});
