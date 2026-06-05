// procedures-editor.js — Visual node-canvas procedure editor
// Lazy-loaded by router.js on /procedures/:id/edit
// Implements React Flow-inspired canvas with SVG edges + positioned div nodes.
// No React dependency — pure vanilla-JS matching the dashboard's bundle pattern.

import { NODE_TYPES, stepKindToNodeType } from '../procedure-canvas/node-types.js';
import { parseFromYaml }  from '../procedure-canvas/parse-from-yaml.js';
import { compileToYaml }  from '../procedure-canvas/compile-to-yaml.js';
import { mountPalette }   from '../procedure-canvas/palette.js';

// ── js-yaml lazy loader ──────────────────────────────────────────────────────
let _jsyamlLoaded = false;
async function ensureJsYaml() {
  if (_jsyamlLoaded || (typeof window !== 'undefined' && window.jsyaml)) {
    _jsyamlLoaded = true;
    return;
  }
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/js-yaml@4/dist/js-yaml.min.js';
    script.onload  = () => { _jsyamlLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Failed to load js-yaml from CDN'));
    document.head.appendChild(script);
  });
}

// ── Canvas state ─────────────────────────────────────────────────────────────
let _state = null;           // { nodes, edges, meta }
let _procedureId = null;
let _zoom = 1;
let _panX = 40;
let _panY = 40;
let _selectedNodeId = null;
let _selectedEdgeId = null;

// DOM refs
let _shell = null;
let _viewport = null;
let _canvasWrap = null;
let _svgLayer = null;
let _nodesLayer = null;
let _inspectorRail = null;
let _minimapEl = null;
let _zoomLabel = null;

// Interaction state
let _panning = false;
let _panStart = null;
let _draggingNode = null;
let _dragNodeStart = null;
let _draftEdge = null;   // { sourceId, path }

// ── Unique ID generation ─────────────────────────────────────────────────────
let _uid = 0;
function uid(prefix = 'n') {
  return `${prefix}-${Date.now()}-${++_uid}`;
}

// ── Coordinate helpers ───────────────────────────────────────────────────────
function viewportToCanvas(vx, vy) {
  const rect = _viewport.getBoundingClientRect();
  return {
    x: (vx - rect.left - _panX) / _zoom,
    y: (vy - rect.top  - _panY) / _zoom,
  };
}

function canvasToViewport(cx, cy) {
  return {
    x: cx * _zoom + _panX,
    y: cy * _zoom + _panY,
  };
}

function getNodeCenter(node) {
  return { x: node.position.x + 90, y: node.position.y + 36 };
}

// ── Rendering ────────────────────────────────────────────────────────────────
function applyTransform() {
  if (_canvasWrap) {
    _canvasWrap.style.transform = `translate(${_panX}px,${_panY}px) scale(${_zoom})`;
  }
  if (_zoomLabel) _zoomLabel.textContent = Math.round(_zoom * 100) + '%';
  renderMinimap();
}

function renderMinimap() {
  if (!_minimapEl || !_state) return;
  const W = 140, H = 90;
  const nodes = _state.nodes;
  if (!nodes.length) { _minimapEl.innerHTML = ''; return; }

  const xs = nodes.map(n => n.position.x);
  const ys = nodes.map(n => n.position.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs) + 180;
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys) + 80;
  const rangeX = Math.max(maxX - minX, 1);
  const rangeY = Math.max(maxY - minY, 1);
  const scale = Math.min((W - 8) / rangeX, (H - 8) / rangeY);
  const offX = 4, offY = 4;

  let html = '';
  for (const node of nodes) {
    const def = NODE_TYPES[node.type] || NODE_TYPES.unsupported;
    const nx = offX + (node.position.x - minX) * scale;
    const ny = offY + (node.position.y - minY) * scale;
    const nw = Math.max(180 * scale, 4);
    const nh = Math.max(72 * scale, 3);
    html += `<div class="pcanvas-minimap-node" style="left:${nx}px;top:${ny}px;width:${nw}px;height:${nh}px;background:${def.color};"></div>`;
  }

  // Viewport rectangle
  const vpW = _viewport ? _viewport.clientWidth  : 800;
  const vpH = _viewport ? _viewport.clientHeight : 600;
  const vx = offX + ((-_panX / _zoom) - minX) * scale;
  const vy = offY + ((-_panY / _zoom) - minY) * scale;
  const vw = (vpW / _zoom) * scale;
  const vh = (vpH / _zoom) * scale;
  html += `<div class="pcanvas-minimap-viewport" style="left:${vx}px;top:${vy}px;width:${vw}px;height:${vh}px;"></div>`;

  _minimapEl.innerHTML = html;
}

// ── Node rendering ───────────────────────────────────────────────────────────
const NODE_HEIGHT = 72;

function createNodeEl(node) {
  const def = NODE_TYPES[node.type] || NODE_TYPES.unsupported;
  const el = document.createElement('div');
  el.className = 'pcanvas-node' + (node.id === _selectedNodeId ? ' pcanvas-node-selected' : '');
  el.dataset.nodeId = node.id;
  el.dataset.type = node.type;
  el.style.left = node.position.x + 'px';
  el.style.top  = node.position.y + 'px';
  el.style.setProperty('--node-color',  def.color);
  el.style.setProperty('--node-border', def.borderColor);

  const desc = node.data.description || node.data.message?.slice(0, 40) || '';

  el.innerHTML = `
    <div class="pcanvas-node-header">
      <span class="pcanvas-node-icon">${def.icon}</span>
      <span class="pcanvas-node-type-badge">${def.label}</span>
    </div>
    <div class="pcanvas-node-body">
      <div class="pcanvas-node-label">${escHtml(node.data.label || '')}</div>
      ${desc ? `<div class="pcanvas-node-desc">${escHtml(desc)}</div>` : ''}
    </div>
    ${def.handles.target ? `<div class="pcanvas-handle pcanvas-handle-target" data-handle="target" data-node-id="${node.id}"></div>` : ''}
    ${def.handles.source ? `<div class="pcanvas-handle pcanvas-handle-source" data-handle="source" data-node-id="${node.id}"></div>` : ''}
  `;

  return el;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderNodes() {
  if (!_nodesLayer || !_state) return;
  _nodesLayer.innerHTML = '';
  for (const node of _state.nodes) {
    _nodesLayer.appendChild(createNodeEl(node));
  }
  bindNodeEvents();
}

// ── Edge rendering ───────────────────────────────────────────────────────────
function cubicBezier(x1,y1, x2,y2) {
  const cx = Math.max(Math.abs(x2-x1) * 0.5, 60);
  return `M ${x1} ${y1} C ${x1+cx} ${y1} ${x2-cx} ${y2} ${x2} ${y2}`;
}

function renderEdges() {
  if (!_svgLayer || !_state) return;
  _svgLayer.innerHTML = '';

  const nodeById = new Map(_state.nodes.map(n => [n.id, n]));

  for (const edge of _state.edges) {
    const src = nodeById.get(edge.source);
    const tgt = nodeById.get(edge.target);
    if (!src || !tgt) continue;

    const sx = src.position.x + 180;
    const sy = src.position.y + 36;
    const tx = tgt.position.x;
    const ty = tgt.position.y + 36;
    const d  = cubicBezier(sx, sy, tx, ty);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.dataset.edgeId = edge.id;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'pcanvas-edge-path' + (edge.id === _selectedEdgeId ? ' pcanvas-edge-selected' : ''));
    path.setAttribute('d', d);
    path.dataset.edgeId = edge.id;
    g.appendChild(path);

    // Arrow marker
    const mx = tx - 6, my = ty;
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    arrow.setAttribute('class', 'pcanvas-edge-arrow');
    arrow.setAttribute('points', `${mx},${my-4} ${mx+8},${my} ${mx},${my+4}`);
    g.appendChild(arrow);

    // Label
    if (edge.label) {
      const midX = (sx + tx) / 2;
      const midY = (sy + ty) / 2;
      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', midX);
      txt.setAttribute('y', midY - 6);
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('fill', 'rgba(221,227,208,0.55)');
      txt.setAttribute('font-size', '10');
      txt.setAttribute('font-family', 'IBM Plex Mono, monospace');
      txt.textContent = edge.label;
      g.appendChild(txt);
    }

    _svgLayer.appendChild(g);
  }
}

// ── Inspector ────────────────────────────────────────────────────────────────
function renderInspector() {
  if (!_inspectorRail || !_state) return;

  const node = _selectedNodeId ? _state.nodes.find(n => n.id === _selectedNodeId) : null;
  if (!node) {
    _inspectorRail.innerHTML = `
      <div class="pcanvas-inspector-empty">
        <span class="pcanvas-inspector-empty-icon">◈</span>
        Select a node to edit its properties
      </div>`;
    return;
  }

  const def = NODE_TYPES[node.type] || NODE_TYPES.unsupported;
  let fieldsHtml = '';
  for (const field of def.fields) {
    fieldsHtml += `<div class="pcanvas-field">
      <label for="field-${field.key}">${field.label}</label>`;

    const val = escHtml(node.data[field.key] ?? '');

    if (field.type === 'select') {
      const opts = (field.options || []).map(o =>
        `<option value="${escHtml(o)}" ${node.data[field.key] === o ? 'selected' : ''}>${escHtml(o) || '—'}</option>`
      ).join('');
      fieldsHtml += `<select id="field-${field.key}" data-field="${field.key}">${opts}</select>`;
    } else if (field.type === 'textarea') {
      fieldsHtml += `<textarea id="field-${field.key}" data-field="${field.key}" rows="3">${val}</textarea>`;
    } else {
      fieldsHtml += `<input type="text" id="field-${field.key}" data-field="${field.key}" value="${val}" placeholder="${escHtml(field.placeholder||'')}" />`;
    }
    fieldsHtml += `</div>`;
  }

  _inspectorRail.innerHTML = `
    <div class="pcanvas-inspector-header" style="--node-color:${def.color}">
      <span class="pcanvas-inspector-node-icon">${def.icon}</span>
      <span class="pcanvas-inspector-node-type">${def.label}</span>
    </div>
    <div class="pcanvas-inspector-fields">${fieldsHtml}</div>
    <div class="pcanvas-field">
      <button class="pcanvas-btn pcanvas-btn-danger" id="btn-delete-node">Delete node</button>
    </div>`;

  // Bind field changes
  _inspectorRail.querySelectorAll('[data-field]').forEach(input => {
    input.addEventListener('input', e => {
      const n = _state.nodes.find(x => x.id === _selectedNodeId);
      if (n) {
        n.data[e.target.dataset.field] = e.target.value;
        // Re-render node label live
        const el = _nodesLayer.querySelector(`[data-node-id="${_selectedNodeId}"]`);
        if (el && e.target.dataset.field === 'label') {
          const lbl = el.querySelector('.pcanvas-node-label');
          if (lbl) lbl.textContent = e.target.value;
        }
      }
    });
  });

  const deleteBtn = _inspectorRail.querySelector('#btn-delete-node');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      deleteSelectedNode();
    });
  }
}

// ── Full render ──────────────────────────────────────────────────────────────
function render() {
  renderEdges();
  renderNodes();
  renderInspector();
  renderMinimap();
}

// ── Node interaction ─────────────────────────────────────────────────────────
function bindNodeEvents() {
  if (!_nodesLayer) return;

  _nodesLayer.querySelectorAll('.pcanvas-node').forEach(el => {
    el.addEventListener('mousedown', onNodeMousedown);
  });

  _nodesLayer.querySelectorAll('.pcanvas-handle[data-handle="source"]').forEach(el => {
    el.addEventListener('mousedown', onHandleMousedown);
  });
}

function onNodeMousedown(e) {
  if (e.target.classList.contains('pcanvas-handle')) return;
  e.stopPropagation();

  const nodeId = e.currentTarget.dataset.nodeId;

  // Select
  _selectedNodeId = nodeId;
  _selectedEdgeId = null;
  render();

  // Begin drag
  const node = _state.nodes.find(n => n.id === nodeId);
  if (!node) return;

  _draggingNode = node;
  const canvasPos = viewportToCanvas(e.clientX, e.clientY);
  _dragNodeStart = {
    mouseX: canvasPos.x,
    mouseY: canvasPos.y,
    nodeX: node.position.x,
    nodeY: node.position.y,
  };

  e.currentTarget.classList.add('pcanvas-node-dragging');
}

function onHandleMousedown(e) {
  e.stopPropagation();
  const nodeId = e.target.dataset.nodeId;
  const node = _state.nodes.find(n => n.id === nodeId);
  if (!node) return;

  _draftEdge = { sourceId: nodeId };

  // Create draft path element
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('class', 'pcanvas-draft-edge');
  _svgLayer.appendChild(path);
  _draftEdge.path = path;
}

// ── Canvas interaction ───────────────────────────────────────────────────────
function bindCanvasEvents() {
  _viewport.addEventListener('mousedown', onCanvasMousedown);
  window.addEventListener('mousemove', onMousemove);
  window.addEventListener('mouseup', onMouseup);
  _viewport.addEventListener('wheel', onWheel, { passive: false });

  // Drop from palette
  _viewport.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  _viewport.addEventListener('drop', onDrop);
}

function onCanvasMousedown(e) {
  if (e.target !== _viewport && e.target !== _canvasWrap && e.target !== _svgLayer) return;

  // Deselect
  _selectedNodeId = null;
  _selectedEdgeId = null;
  renderInspector();
  _nodesLayer.querySelectorAll('.pcanvas-node-selected').forEach(el => el.classList.remove('pcanvas-node-selected'));

  // Pan
  _panning = true;
  _panStart = { mouseX: e.clientX, mouseY: e.clientY, panX: _panX, panY: _panY };
  _viewport.classList.add('pcanvas-panning');
}

function onMousemove(e) {
  if (_draggingNode) {
    const cp = viewportToCanvas(e.clientX, e.clientY);
    _draggingNode.position.x = _dragNodeStart.nodeX + (cp.x - _dragNodeStart.mouseX);
    _draggingNode.position.y = _dragNodeStart.nodeY + (cp.y - _dragNodeStart.mouseY);
    const el = _nodesLayer.querySelector(`[data-node-id="${_draggingNode.id}"]`);
    if (el) {
      el.style.left = _draggingNode.position.x + 'px';
      el.style.top  = _draggingNode.position.y + 'px';
    }
    renderEdges();
    renderMinimap();
    return;
  }

  if (_draftEdge) {
    const canvasPos = viewportToCanvas(e.clientX, e.clientY);
    const srcNode = _state.nodes.find(n => n.id === _draftEdge.sourceId);
    if (srcNode) {
      const sx = srcNode.position.x + 180;
      const sy = srcNode.position.y + 36;
      const d  = cubicBezier(sx, sy, canvasPos.x, canvasPos.y);
      _draftEdge.path.setAttribute('d', d);
    }
    return;
  }

  if (_panning) {
    _panX = _panStart.panX + (e.clientX - _panStart.mouseX);
    _panY = _panStart.panY + (e.clientY - _panStart.mouseY);
    applyTransform();
  }
}

function onMouseup(e) {
  if (_draggingNode) {
    const el = _nodesLayer.querySelector(`[data-node-id="${_draggingNode.id}"]`);
    if (el) el.classList.remove('pcanvas-node-dragging');
    _draggingNode = null;
    _dragNodeStart = null;
  }

  if (_draftEdge) {
    // Check if released on a target handle
    const targetEl = document.elementFromPoint(e.clientX, e.clientY);
    const targetHandle = targetEl?.closest('[data-handle="target"]');
    if (targetHandle) {
      const targetNodeId = targetHandle.dataset.nodeId;
      if (targetNodeId && targetNodeId !== _draftEdge.sourceId) {
        // Avoid duplicate edges
        const exists = _state.edges.some(
          ed => ed.source === _draftEdge.sourceId && ed.target === targetNodeId
        );
        if (!exists) {
          _state.edges.push({
            id: uid('edge'),
            source: _draftEdge.sourceId,
            target: targetNodeId,
          });
        }
      }
    }
    _draftEdge.path.remove();
    _draftEdge = null;
    renderEdges();
  }

  if (_panning) {
    _panning = false;
    _viewport.classList.remove('pcanvas-panning');
  }
}

function onWheel(e) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  const rect  = _viewport.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  // Zoom toward cursor
  _panX = mouseX - (mouseX - _panX) * delta;
  _panY = mouseY - (mouseY - _panY) * delta;
  _zoom = Math.min(3, Math.max(0.2, _zoom * delta));
  applyTransform();
}

function onDrop(e) {
  e.preventDefault();
  const typeId = e.dataTransfer.getData('application/penelope-node-type');
  if (!typeId || !NODE_TYPES[typeId]) return;

  const pos = viewportToCanvas(e.clientX, e.clientY);
  const def = NODE_TYPES[typeId];

  const newNode = {
    id: uid('node'),
    type: typeId,
    position: { x: pos.x - 90, y: pos.y - 36 },
    data: { ...def.defaultData, _raw: {} },
  };

  _state.nodes.push(newNode);
  renderNodes();
  renderEdges();
  renderMinimap();

  // Select new node
  _selectedNodeId = newNode.id;
  render();
}

// ── Edge click to select ─────────────────────────────────────────────────────
function bindEdgeEvents() {
  _svgLayer.addEventListener('click', e => {
    const edgePath = e.target.closest('[data-edge-id]');
    if (edgePath) {
      _selectedEdgeId = edgePath.dataset.edgeId || e.target.parentElement?.dataset.edgeId;
      _selectedNodeId = null;
      render();
    }
  });
}

// ── Delete ───────────────────────────────────────────────────────────────────
function deleteSelectedNode() {
  if (!_selectedNodeId) return;
  _state.nodes  = _state.nodes.filter(n => n.id !== _selectedNodeId);
  _state.edges  = _state.edges.filter(e => e.source !== _selectedNodeId && e.target !== _selectedNodeId);
  _selectedNodeId = null;
  render();
}

function bindKeyboardShortcuts() {
  window.addEventListener('keydown', e => {
    if ((e.key === 'Delete' || e.key === 'Backspace') &&
        document.activeElement === document.body) {
      if (_selectedNodeId)  deleteSelectedNode();
      if (_selectedEdgeId) {
        _state.edges = _state.edges.filter(ed => ed.id !== _selectedEdgeId);
        _selectedEdgeId = null;
        renderEdges();
      }
    }
  });
}

// ── Fit-to-view ──────────────────────────────────────────────────────────────
function fitToView() {
  if (!_state?.nodes.length || !_viewport) return;
  const padding = 60;
  const xs = _state.nodes.map(n => n.position.x);
  const ys = _state.nodes.map(n => n.position.y);
  const minX = Math.min(...xs) - padding;
  const maxX = Math.max(...xs) + 180 + padding;
  const minY = Math.min(...ys) - padding;
  const maxY = Math.max(...ys) + NODE_HEIGHT + padding;
  const vpW  = _viewport.clientWidth  || 800;
  const vpH  = _viewport.clientHeight || 600;
  const zx   = vpW  / (maxX - minX);
  const zy   = vpH  / (maxY - minY);
  _zoom = Math.min(zx, zy, 1.5);
  _panX = -minX * _zoom + (vpW  - (maxX - minX) * _zoom) / 2;
  _panY = -minY * _zoom + (vpH  - (maxY - minY) * _zoom) / 2;
  applyTransform();
}

// ── YAML overlay ─────────────────────────────────────────────────────────────
function showYamlOverlay() {
  if (!_shell || !_state) return;
  const yaml = compileToYaml(_state);
  const overlay = document.createElement('div');
  overlay.className = 'pcanvas-yaml-overlay';
  overlay.innerHTML = `
    <div class="pcanvas-yaml-overlay-header">
      <span class="pcanvas-yaml-overlay-title">YAML — ${_procedureId}</span>
      <button class="pcanvas-btn" id="yaml-apply">Apply changes</button>
      <button class="pcanvas-btn" id="yaml-close">Close</button>
    </div>
    <textarea class="pcanvas-yaml-textarea" spellcheck="false">${escHtml(yaml)}</textarea>`;

  _shell.appendChild(overlay);

  overlay.querySelector('#yaml-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#yaml-apply').addEventListener('click', () => {
    const raw = overlay.querySelector('.pcanvas-yaml-textarea').value;
    try {
      const parsed = parseFromYaml(raw);
      _state = { nodes: parsed.nodes, edges: parsed.edges, meta: parsed.meta };
      render();
      overlay.remove();
      showToast('YAML applied', 'success');
    } catch (err) {
      showToast('Parse error: ' + err.message, 'error');
    }
  });
}

// ── Save ─────────────────────────────────────────────────────────────────────
async function saveProcedure() {
  if (!_state || !_procedureId) return;
  const yaml = compileToYaml(_state);
  try {
    const res = await fetch(`/api/procedures/${_procedureId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ yaml }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast('Saved', 'success');
  } catch (err) {
    showToast('Save failed: ' + err.message, 'error');
  }
}

// ── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg, type = '') {
  if (!_viewport) return;
  const t = document.createElement('div');
  t.className = 'pcanvas-toast' + (type ? ` pcanvas-toast-${type}` : '');
  t.textContent = msg;
  _viewport.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ── Build shell HTML ─────────────────────────────────────────────────────────
function buildShell(root, procedureId) {
  root.innerHTML = `
    <div class="pcanvas-shell" id="pcanvas-shell">
      <div class="pcanvas-topbar">
        <span class="pcanvas-topbar-title">
          Procedure Editor
          <span class="pcanvas-id-badge">${escHtml(procedureId)}</span>
        </span>
        <button class="pcanvas-btn" id="pcbtn-fit">Fit</button>
        <button class="pcanvas-btn" id="pcbtn-yaml">YAML</button>
        <button class="pcanvas-btn pcanvas-btn-primary" id="pcbtn-save">Save</button>
      </div>
      <div class="pcanvas-body">
        <div class="pcanvas-palette-rail" id="pcanvas-palette"></div>
        <div class="pcanvas-viewport" id="pcanvas-viewport">
          <div class="pcanvas-canvas-wrap" id="pcanvas-canvas-wrap">
            <svg class="pcanvas-edges-svg" id="pcanvas-svg"></svg>
            <div class="pcanvas-nodes-layer" id="pcanvas-nodes"></div>
          </div>
          <div class="pcanvas-minimap" id="pcanvas-minimap"></div>
          <div class="pcanvas-zoom-controls">
            <button class="pcanvas-zoom-btn" id="pcbtn-zoom-out">−</button>
            <span class="pcanvas-zoom-label" id="pcanvas-zoom-label">100%</span>
            <button class="pcanvas-zoom-btn" id="pcbtn-zoom-in">+</button>
          </div>
        </div>
        <div class="pcanvas-inspector-rail" id="pcanvas-inspector"></div>
      </div>
    </div>`;

  _shell        = root.querySelector('#pcanvas-shell');
  _viewport     = root.querySelector('#pcanvas-viewport');
  _canvasWrap   = root.querySelector('#pcanvas-canvas-wrap');
  _svgLayer     = root.querySelector('#pcanvas-svg');
  _nodesLayer   = root.querySelector('#pcanvas-nodes');
  _inspectorRail= root.querySelector('#pcanvas-inspector');
  _minimapEl    = root.querySelector('#pcanvas-minimap');
  _zoomLabel    = root.querySelector('#pcanvas-zoom-label');

  root.querySelector('#pcbtn-fit').addEventListener('click', fitToView);
  root.querySelector('#pcbtn-yaml').addEventListener('click', showYamlOverlay);
  root.querySelector('#pcbtn-save').addEventListener('click', saveProcedure);
  root.querySelector('#pcbtn-zoom-in').addEventListener('click', () => {
    _zoom = Math.min(3, _zoom * 1.2); applyTransform();
  });
  root.querySelector('#pcbtn-zoom-out').addEventListener('click', () => {
    _zoom = Math.max(0.2, _zoom / 1.2); applyTransform();
  });

  mountPalette(root.querySelector('#pcanvas-palette'), null);
  bindCanvasEvents();
  bindEdgeEvents();
  bindKeyboardShortcuts();
}

// ── Mount / Unmount (router.js panel contract) ───────────────────────────────
export async function mount(root, procedureId) {
  _procedureId = procedureId || 'unknown';
  _zoom = 1; _panX = 40; _panY = 40;
  _selectedNodeId = null; _selectedEdgeId = null;
  _state = null;

  // Show loading state
  root.innerHTML = `
    <div class="pcanvas-shell">
      <div class="pcanvas-loading">
        <div class="pcanvas-loading-spinner"></div>
        Loading procedure…
      </div>
    </div>`;

  try {
    await ensureJsYaml();
    const res = await fetch(`/api/procedures/${_procedureId}`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const { yaml } = await res.json();
    const parsed = parseFromYaml(yaml);
    _state = { nodes: parsed.nodes, edges: parsed.edges, meta: parsed.meta };
  } catch (err) {
    root.innerHTML = `
      <div class="pcanvas-shell">
        <div class="pcanvas-error">
          <span class="pcanvas-error-icon">⚠</span>
          Failed to load procedure: ${escHtml(err.message)}
        </div>
      </div>`;
    return;
  }

  buildShell(root, _procedureId);
  render();
  fitToView();
}

export function unmount(root) {
  // Clean up window-level listeners by rebuilding them fresh on next mount.
  // (They are bound to _viewport refs that will be GC'd.)
  _state = null;
  _shell = null;
  _viewport = null;
  _canvasWrap = null;
  _svgLayer = null;
  _nodesLayer = null;
  _inspectorRail = null;
  _minimapEl = null;
  _zoomLabel = null;
  _draggingNode = null;
  _draftEdge = null;
  if (root) root.innerHTML = '';
}
