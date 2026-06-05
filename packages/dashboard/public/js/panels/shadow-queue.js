// panels/shadow-queue.js — Shadow queue panel: approve / edit / decline

import { getShadowQueue, approveQueueItem, declineQueueItem, editQueueItem } from '../api.js';

let _items = [];
let _expanded = null;

export function mountShadowQueue(root) {
  root.innerHTML = `
    <div class="panel" id="queue-panel">
      <div class="panel-header">
        <h1 class="panel-title">Shadow Queue</h1>
        <span class="panel-subtitle">Drafted replies waiting for approval</span>
      </div>
      <div id="queue-content">
        <div style="color:var(--muted);padding:20px 0;">Loading…</div>
      </div>
    </div>
  `;
  loadQueue(root);
}

export function unmountShadowQueue(root) {
  _expanded = null;
  root.innerHTML = '';
}

async function loadQueue(root) {
  try {
    const data = await getShadowQueue();
    _items = data.items || [];
    renderQueue(root);
  } catch (e) {
    const el = root.querySelector('#queue-content');
    if (el) el.innerHTML = `<div style="color:var(--danger);padding:16px 0;">Failed to load queue: ${e.message}</div>`;
  }
}

function renderQueue(root) {
  const el = root.querySelector('#queue-content');
  if (!el) return;

  const pending  = _items.filter(i => i.status === 'pending');
  const resolved = _items.filter(i => i.status !== 'pending');

  if (_items.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">✓</div>
        <div class="empty-state-text">Queue is empty — all caught up!</div>
      </div>
    `;
    return;
  }

  el.innerHTML = buildTable('Pending', pending) + buildTable('Resolved', resolved, true);

  // Wire row expand
  el.querySelectorAll('.queue-data-row').forEach(row => {
    row.addEventListener('click', () => toggleExpand(row.dataset.id, root));
  });

  // Re-expand if needed
  if (_expanded) expandRow(_expanded, root);
}

function buildTable(title, items, collapsed = false) {
  if (items.length === 0) return '';
  return `
    <div class="queue-wrap">
      <div class="queue-header-bar">
        <h3>${title} <span style="color:var(--muted);font-weight:400">(${items.length})</span></h3>
      </div>
      <table class="queue-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Channel</th>
            <th>Draft preview</th>
            <th>Status</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => buildRow(item)).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function buildRow(item) {
  const preview = (item.draft_text || '').slice(0, 60) + ((item.draft_text || '').length > 60 ? '…' : '');
  const when = item.created_at ? new Date(item.created_at).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : '—';
  return `
    <tr class="queue-data-row" data-id="${item.id}">
      <td><strong>${esc(item.customer_name || 'Unknown')}</strong></td>
      <td><span class="channel-badge">${esc(item.channel || '?')}</span></td>
      <td style="max-width:320px;color:var(--muted)">${esc(preview)}</td>
      <td><span class="status-pill status-${item.status}">${item.status}</span></td>
      <td style="color:var(--muted);font-size:12px;font-family:var(--font-mono)">${when}</td>
    </tr>
    <tr class="queue-expand-row" id="expand-${item.id}" style="display:none">
      <td colspan="5"></td>
    </tr>
  `;
}

function toggleExpand(id, root) {
  if (_expanded === id) {
    collapseRow(id, root);
    _expanded = null;
  } else {
    if (_expanded) collapseRow(_expanded, root);
    _expanded = id;
    expandRow(id, root);
  }
}

function expandRow(id, root) {
  const item = _items.find(i => String(i.id) === String(id));
  if (!item) return;

  const dataRow = root.querySelector(`.queue-data-row[data-id="${id}"]`);
  const expandRow = root.querySelector(`#expand-${id}`);
  if (!expandRow) return;

  if (dataRow) dataRow.classList.add('expanded');
  expandRow.style.display = '';

  expandRow.querySelector('td').innerHTML = `
    <div class="queue-expand-inner">
      <div class="queue-draft-text" id="draft-display-${id}">${esc(item.draft_text || '')}</div>
      <textarea class="queue-edit-area" id="draft-edit-${id}" rows="4">${esc(item.draft_text || '')}</textarea>
      <div class="queue-actions">
        ${item.status === 'pending' ? `
          <button class="btn btn-primary btn-sm" data-action="approve" data-id="${id}">✓ Approve</button>
          <button class="btn btn-outline btn-sm" data-action="edit-toggle" data-id="${id}" id="edit-toggle-${id}">✏ Edit</button>
          <button class="btn btn-sm btn-outline" data-action="save-edit" data-id="${id}" style="display:none" id="save-edit-${id}">Save edit</button>
          <button class="btn btn-danger btn-sm" data-action="decline" data-id="${id}">✕ Decline</button>
        ` : `<span style="color:var(--muted);font-size:12px">This item is ${item.status}.</span>`}
      </div>
    </div>
  `;

  // Wire action buttons
  expandRow.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleAction(btn.dataset.action, btn.dataset.id, root);
    });
  });
}

function collapseRow(id, root) {
  const dataRow = root.querySelector(`.queue-data-row[data-id="${id}"]`);
  const expRow  = root.querySelector(`#expand-${id}`);
  if (dataRow) dataRow.classList.remove('expanded');
  if (expRow)  { expRow.style.display = 'none'; expRow.querySelector('td').innerHTML = ''; }
}

async function handleAction(action, id, root) {
  const item = _items.find(i => String(i.id) === String(id));
  if (!item) return;

  if (action === 'edit-toggle') {
    const display = root.querySelector(`#draft-display-${id}`);
    const edit    = root.querySelector(`#draft-edit-${id}`);
    const saveBtn = root.querySelector(`#save-edit-${id}`);
    const toggleBtn = root.querySelector(`#edit-toggle-${id}`);
    if (edit.classList.contains('visible')) {
      edit.classList.remove('visible');
      if (display) display.style.display = '';
      if (saveBtn) saveBtn.style.display = 'none';
      if (toggleBtn) toggleBtn.textContent = '✏ Edit';
    } else {
      edit.classList.add('visible');
      if (display) display.style.display = 'none';
      if (saveBtn) saveBtn.style.display = '';
      if (toggleBtn) toggleBtn.textContent = '✕ Cancel';
      edit.focus();
    }
    return;
  }

  if (action === 'save-edit') {
    const edit = root.querySelector(`#draft-edit-${id}`);
    const newText = edit ? edit.value.trim() : '';
    if (!newText) return;
    try {
      await editQueueItem(id, newText);
      item.draft_text = newText;
      item.status = 'edited';
      renderQueue(root);
    } catch (e) { alert('Edit failed: ' + e.message); }
    return;
  }

  if (action === 'approve') {
    try {
      await approveQueueItem(id);
      item.status = 'approved';
      renderQueue(root);
    } catch (e) { alert('Approve failed: ' + e.message); }
    return;
  }

  if (action === 'decline') {
    if (!confirm('Decline this draft? It will not be sent.')) return;
    try {
      await declineQueueItem(id);
      item.status = 'declined';
      renderQueue(root);
    } catch (e) { alert('Decline failed: ' + e.message); }
    return;
  }
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
