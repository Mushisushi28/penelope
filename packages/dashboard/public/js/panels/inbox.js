// panels/inbox.js — Unified inbox: thread list → thread view

import { getInbox, getThread } from '../api.js';

export function mountInbox(root) {
  root.innerHTML = `
    <div class="panel" id="inbox-panel">
      <div class="panel-header">
        <h1 class="panel-title">Inbox</h1>
        <span class="panel-subtitle">All customer conversations</span>
      </div>
      <div class="inbox-controls">
        <select class="inbox-filter" id="inbox-channel">
          <option value="">All channels</option>
          <option value="sms">SMS</option>
          <option value="fb-messenger">FB Messenger</option>
          <option value="email">Email</option>
        </select>
        <button class="btn btn-ghost btn-sm" id="inbox-refresh">↻ Refresh</button>
      </div>
      <div id="inbox-body">
        <div style="color:var(--muted);padding:16px 0;">Loading…</div>
      </div>
    </div>
  `;

  root.querySelector('#inbox-refresh').addEventListener('click', () => loadInbox(root));
  root.querySelector('#inbox-channel').addEventListener('change', () => loadInbox(root));

  loadInbox(root);
}

export function unmountInbox(root) {
  root.innerHTML = '';
}

async function loadInbox(root) {
  const ch = root.querySelector('#inbox-channel')?.value || '';
  try {
    const data = await getInbox(ch);
    renderInbox(root, data.threads || []);
  } catch (e) {
    const body = root.querySelector('#inbox-body');
    if (body) body.innerHTML = `<div style="color:var(--danger);padding:16px 0;">Failed to load inbox: ${e.message}</div>`;
  }
}

function renderInbox(root, threads) {
  const body = root.querySelector('#inbox-body');
  if (!body) return;

  if (threads.length === 0) {
    body.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">✉</div>
        <div class="empty-state-text">No messages yet.</div>
      </div>
    `;
    return;
  }

  body.innerHTML = `<div class="inbox-list">${threads.map(t => buildRow(t)).join('')}</div>`;

  body.querySelectorAll('.inbox-row').forEach(row => {
    row.addEventListener('click', () => openThread(root, row.dataset.id, threads));
  });
}

function buildRow(t) {
  const initials = (t.customer_name || '?').slice(0, 2).toUpperCase();
  const preview  = esc((t.last_message || '').slice(0, 80));
  const time     = t.last_at ? relTime(new Date(t.last_at)) : '';
  return `
    <div class="inbox-row ${t.unread ? 'unread' : ''}" data-id="${t.id}">
      <div class="inbox-avatar">${initials}</div>
      <div class="inbox-meta">
        <div class="inbox-name">
          ${esc(t.customer_name || 'Unknown')}
          <span class="channel-badge">${esc(t.channel || '?')}</span>
        </div>
        <div class="inbox-preview">${preview}</div>
      </div>
      <div class="inbox-right">
        <span class="inbox-time">${time}</span>
        ${t.unread ? `<span class="inbox-unread-badge">${t.unread}</span>` : ''}
      </div>
    </div>
  `;
}

async function openThread(root, id, threads) {
  const t = threads.find(x => String(x.id) === String(id));
  const body = root.querySelector('#inbox-body');
  if (!body) return;

  body.innerHTML = `<div style="color:var(--muted);padding:16px 0;">Loading thread…</div>`;

  try {
    const data = await getThread(id);
    const msgs = data.messages || [];
    body.innerHTML = `
      <div class="thread-view">
        <div class="thread-header">
          <button class="btn btn-ghost btn-sm" id="thread-back">← Back</button>
          <h3>${esc(t ? t.customer_name : id)}</h3>
          ${t ? `<span class="channel-badge">${esc(t.channel || '')}</span>` : ''}
        </div>
        <div class="messages-list">
          ${msgs.map(m => buildBubble(m)).join('')}
          ${msgs.length === 0 ? '<div class="empty-state"><div class="empty-state-text">No messages in this thread.</div></div>' : ''}
        </div>
      </div>
    `;
    body.querySelector('#thread-back').addEventListener('click', () => {
      renderInbox(root, threads);
    });
  } catch (e) {
    body.innerHTML = `<div style="color:var(--danger);padding:16px 0;">Failed to load thread: ${e.message}</div>`;
  }
}

function buildBubble(m) {
  const side = m.direction === 'outbound' ? 'agent' : 'customer';
  const time = m.ts ? new Date(m.ts).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : '';
  return `
    <div class="message-bubble ${side}">
      ${esc(m.text || '')}
      <div class="message-meta">${side === 'agent' ? 'Agent' : 'Customer'} · ${time}</div>
    </div>
  `;
}

function relTime(d) {
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60)   return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
