// compile-to-yaml.js — { nodes, edges, meta } → YAML string
// Performs a topological walk from the trigger node, reconstructing the state
// machine in the order edges define, then falls back to disconnected nodes.

function getJsYaml() {
  if (typeof window !== 'undefined' && window.jsyaml) return window.jsyaml;
  if (typeof global !== 'undefined' && global._jsyaml) return global._jsyaml;
  throw new Error('js-yaml not available.');
}

/**
 * Build the next map: sourceNodeId → [{ target: targetNodeId, label? }]
 */
function buildNextMap(edges) {
  const map = new Map();
  for (const edge of edges) {
    if (!map.has(edge.source)) map.set(edge.source, []);
    map.get(edge.source).push({ target: edge.target, label: edge.label });
  }
  return map;
}

/**
 * Given a node, reconstruct its `next` value from edges.
 * Single outgoing edge → string
 * Multiple outgoing edges → { label: stateId }
 * No outgoing edges → undefined
 */
function buildNext(nodeId, nextMap, nodeById) {
  const outs = nextMap.get(nodeId) || [];
  if (outs.length === 0) return undefined;
  if (outs.length === 1 && !outs[0].label) {
    const target = nodeById.get(outs[0].target);
    return target?.data?.stateId || outs[0].target;
  }
  // Labeled (condition) branches
  const result = {};
  for (const { target, label } of outs) {
    const targetNode = nodeById.get(target);
    const targetStateId = targetNode?.data?.stateId || target;
    result[label || 'next'] = targetStateId;
  }
  return result;
}

/**
 * Reconstruct actions array from node data, merging edits over _raw.
 */
function buildActions(nodeData) {
  const raw = nodeData._raw;
  const rawActions = Array.isArray(raw?.actions) ? raw.actions : [];
  const base = rawActions[0] ? { ...rawActions[0] } : {};

  // Apply editor fields
  if (nodeData.stepKind) base.kind = nodeData.stepKind;
  if (nodeData.message)  base.message = nodeData.message;
  if (nodeData.channel)  base.channel = nodeData.channel;
  if (nodeData.specialist) base.specialist = nodeData.specialist;
  if (nodeData.timeout)  base.timeout = nodeData.timeout;

  // args is stored as JSON string in the editor
  if (nodeData.args) {
    try { base.args = JSON.parse(nodeData.args); } catch (_) {}
  }

  // Remove empty string values
  for (const [k, v] of Object.entries(base)) {
    if (v === '' || v === undefined) delete base[k];
  }

  const extra = rawActions.slice(1);
  return base.kind ? [base, ...extra] : (rawActions.length ? rawActions : undefined);
}

/**
 * Build a state object for a node.
 */
function buildState(node, nextVal) {
  const d = node.data;
  const raw = d._raw || {};

  const state = {
    // Spread raw first so we preserve unknown fields
    ...raw,
    id: d.stateId || raw.id || node.id,
    label: d.label || raw.label,
  };

  // Rebuild actions
  const actions = buildActions(d);
  if (actions) state.actions = actions;
  else delete state.actions;

  // Rebuild next from live edges (overrides _raw.next)
  if (nextVal !== undefined) {
    state.next = nextVal;
  } else {
    delete state.next;
  }

  // Preserve when / approval from raw if not overridden
  if (!state.when && raw.when) state.when = raw.when;
  if (state.approval === undefined && raw.approval !== undefined) state.approval = raw.approval;

  return state;
}

/**
 * Topological walk starting from the trigger's first outgoing edge.
 * Returns stateNodeIds in procedure order.
 */
function topoSort(triggerNodeId, nextMap, stateNodeIds) {
  const stateSet = new Set(stateNodeIds);
  const visited = new Set();
  const order = [];

  function visit(nodeId) {
    if (visited.has(nodeId) || !stateSet.has(nodeId)) return;
    visited.add(nodeId);
    order.push(nodeId);
    const outs = nextMap.get(nodeId) || [];
    for (const { target } of outs) {
      visit(target);
    }
  }

  // Start from trigger's immediate successors
  const triggerOuts = nextMap.get(triggerNodeId) || [];
  for (const { target } of triggerOuts) {
    visit(target);
  }

  // Append any disconnected state nodes
  for (const id of stateNodeIds) {
    if (!visited.has(id)) order.push(id);
  }

  return order;
}

/**
 * Convert a canvas graph back to a YAML string.
 * graph: { nodes, edges, meta }
 */
export function compileToYaml(graph) {
  const jsyaml = getJsYaml();
  const { nodes = [], edges = [], meta = {} } = graph;

  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const nextMap = buildNextMap(edges);

  // ── Trigger ──────────────────────────────────────────────────────────────────
  const triggerNode = nodes.find(n => n.type === 'trigger');
  let triggerObj = {};
  if (triggerNode) {
    const rawTrigger = triggerNode.data?._raw?.trigger || {};
    triggerObj = { ...rawTrigger };
    if (triggerNode.data.event)   triggerObj.event = triggerNode.data.event;
    if (triggerNode.data.channel) triggerObj.channel = triggerNode.data.channel;
    // Remove empty values
    for (const [k, v] of Object.entries(triggerObj)) {
      if (v === '' || v === undefined) delete triggerObj[k];
    }
  }

  // ── States ───────────────────────────────────────────────────────────────────
  const stateNodes = nodes.filter(n => n.type !== 'trigger');
  const triggerNodeId = triggerNode?.id || 'node-trigger';
  const orderedIds = topoSort(triggerNodeId, nextMap, stateNodes.map(n => n.id));

  const states = orderedIds.map(nodeId => {
    const node = nodeById.get(nodeId);
    const nextVal = buildNext(nodeId, nextMap, nodeById);
    return buildState(node, nextVal);
  });

  // ── Top-level document ───────────────────────────────────────────────────────
  const doc = {
    schema_version: meta.schemaVersion || 1,
  };
  if (meta.id)          doc.id = meta.id;
  if (meta.name)        doc.name = meta.name;
  if (meta.description) doc.description = meta.description;

  // Restore extra top-level fields (e.g. pricing_formula)
  if (meta.extraFields && typeof meta.extraFields === 'object') {
    Object.assign(doc, meta.extraFields);
  }

  doc.trigger = triggerObj;
  doc.states  = states;

  return jsyaml.dump(doc, { indent: 2, lineWidth: 120, noRefs: true });
}
