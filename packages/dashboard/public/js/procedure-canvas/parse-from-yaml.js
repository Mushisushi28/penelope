// parse-from-yaml.js — YAML string/object → { nodes, edges, meta }
// Used by procedures-editor.js (browser) and test suite (Node.js with shim).

import { NODE_TYPES, stepKindToNodeType } from './node-types.js';

function getJsYaml() {
  // Browser: loaded from CDN by procedures-editor.js before this runs
  if (typeof window !== 'undefined' && window.jsyaml) return window.jsyaml;
  // Tests: shim via global._jsyaml
  if (typeof global !== 'undefined' && global._jsyaml) return global._jsyaml;
  throw new Error('js-yaml not available. Load from CDN before calling parseFromYaml.');
}

/**
 * Convert a YAML string (or already-parsed object) to a canvas graph.
 * Returns { nodes, edges, meta, _stateIdToNodeId }
 *   nodes: Array<{ id, type, position, data }>
 *   edges: Array<{ id, source, target, label? }>
 *   meta:  { id, schemaVersion, name, description, extraFields }
 *   _stateIdToNodeId: Map<stateId, nodeId>
 */
export function parseFromYaml(yamlOrObj) {
  const jsyaml = getJsYaml();

  let doc;
  if (typeof yamlOrObj === 'string') {
    doc = jsyaml.load(yamlOrObj);
  } else {
    doc = yamlOrObj;
  }

  if (!doc || typeof doc !== 'object') {
    return { nodes: [], edges: [], meta: {}, _stateIdToNodeId: new Map() };
  }

  const nodes = [];
  const edges = [];
  const _stateIdToNodeId = new Map();

  // ── Meta ────────────────────────────────────────────────────────────────────
  const KNOWN_TOP_KEYS = new Set(['schema_version', 'id', 'name', 'description', 'trigger', 'states']);
  const extraFields = {};
  for (const [k, v] of Object.entries(doc)) {
    if (!KNOWN_TOP_KEYS.has(k)) extraFields[k] = v;
  }

  const meta = {
    id: doc.id || '',
    schemaVersion: doc.schema_version || 1,
    name: doc.name || doc.id || '',
    description: doc.description || '',
    extraFields,
  };

  // ── Trigger node ────────────────────────────────────────────────────────────
  const triggerDef = doc.trigger || {};
  const triggerNodeId = 'node-trigger';
  nodes.push({
    id: triggerNodeId,
    type: 'trigger',
    position: { x: 60, y: 80 },
    data: {
      label: 'On ' + (triggerDef.event || triggerDef.event_type || 'event'),
      event: triggerDef.event || triggerDef.event_type || '',
      channel: triggerDef.channel || triggerDef.filter?.channel || '',
      _raw: { trigger: triggerDef },
    },
  });

  // ── State nodes ─────────────────────────────────────────────────────────────
  const states = Array.isArray(doc.states) ? doc.states : [];
  const COL_X = 60;
  const ROW_H = 160;

  states.forEach((state, idx) => {
    const nodeId = `node-state-${state.id || idx}`;
    _stateIdToNodeId.set(state.id, nodeId);

    // Determine node type from actions
    const actions = Array.isArray(state.actions) ? state.actions : [];
    const firstKind = actions[0]?.kind || '';
    let nodeType = stepKindToNodeType(firstKind);

    // Override for condition heuristic
    const conditionKeywords = ['branch', 'if', 'condition', 'check', 'classify', 'route', 'decide'];
    const labelLower = (state.label || state.id || '').toLowerCase();
    const idLower = (state.id || '').toLowerCase();
    if (conditionKeywords.some(k => labelLower.includes(k) || idLower.includes(k))) {
      nodeType = 'condition';
    }

    // Build description from first action
    let desc = '';
    if (actions[0]) {
      desc = actions[0].kind || '';
      if (actions[0].message) desc += ` "${String(actions[0].message).slice(0, 32)}"`;
      else if (actions[0].specialist) desc += ` ${actions[0].specialist}`;
    }

    nodes.push({
      id: nodeId,
      type: nodeType,
      position: { x: COL_X, y: 80 + (idx + 1) * ROW_H },
      data: {
        label: state.label || state.id || `State ${idx}`,
        stateId: state.id,
        stepKind: firstKind,
        description: desc,
        message: actions[0]?.message || '',
        channel: actions[0]?.channel || '',
        specialist: actions[0]?.specialist || '',
        args: actions[0]?.args ? JSON.stringify(actions[0].args) : '',
        event: state.when?.event || '',
        timeout: actions[0]?.timeout || '',
        condition: state.when?.condition || '',
        approval: state.approval || false,
        _raw: state,
      },
    });
  });

  // ── Edges ────────────────────────────────────────────────────────────────────
  // Trigger → first state
  if (states.length > 0) {
    const firstStateId = states[0].id;
    const firstNodeId = _stateIdToNodeId.get(firstStateId);
    if (firstNodeId) {
      edges.push({
        id: `edge-trigger-${firstStateId}`,
        source: triggerNodeId,
        target: firstNodeId,
      });
    }
  }

  // State → next state(s)
  states.forEach(state => {
    const sourceNodeId = _stateIdToNodeId.get(state.id);
    if (!sourceNodeId) return;

    const next = state.next;
    if (!next) return;

    if (typeof next === 'string') {
      // Simple next
      const targetNodeId = _stateIdToNodeId.get(next);
      if (targetNodeId) {
        edges.push({
          id: `edge-${state.id}-${next}`,
          source: sourceNodeId,
          target: targetNodeId,
        });
      }
    } else if (next && typeof next === 'object') {
      // Conditional next: { yes: stateId, no: stateId } or { default: stateId, ... }
      for (const [label, targetId] of Object.entries(next)) {
        if (typeof targetId !== 'string') continue;
        const targetNodeId = _stateIdToNodeId.get(targetId);
        if (targetNodeId) {
          edges.push({
            id: `edge-${state.id}-${label}-${targetId}`,
            source: sourceNodeId,
            target: targetNodeId,
            label,
          });
        }
      }
    }
  });

  return { nodes, edges, meta, _stateIdToNodeId };
}
