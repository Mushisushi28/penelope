// inbox/thread-detail.js — Right-pane message bubbles renderer
import { channelIcon, channelLabel } from './channel-icon.js';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTs(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function buildBubble(m) {
  const isOut   = m.direction === 'outbound';
  const isDraft = m.is_draft || m.status === 'draft';
  const side    = isOut ? 'out' : 'in';
  const draftClass = isDraft ? ' td-bubble--draft' : '';
  const sender  = isOut ? (isDraft ? 'Penelope (draft)' : 'Agent') : 'Customer';

  return `
    <div class="td-bubble td-bubble--${side}${draftClass}">
      ${isDraft ? `<div class="td-draft-label">✦ Penelope draft — pending approval</div>` : ''}
      <div class="td-bubble-text">${esc(m.text || '')}</div>
      <div class="td-bubble-meta">${sender} · ${formatTs(m.ts || m.created_at)}</div>
    </div>
  `;
}

function buildHeader(thread) {
  const chIcon  = channelIcon(thread.channel, true);
  const chLabel = channelLabel(thread.channel);
  const paused  = thread.paused_at;
  const drafting = thread.ai_status === 'drafting';

  return `
    <div class="td-header">
      <div class="td-header-left">
        <button class="btn btn-ghost btn-sm itp-back-btn" id="td-back" aria-label="Back to list">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <div class="td-ch-icon" title="${esc(chLabel)}">${chIcon}</div>
        <div class="td-header-info">
          <span class="td-customer-name">${esc(thread.customer_name || 'Unknown')}</span>
          <span class="td-ch-pill">${esc(chLabel)}</span>
          ${paused  ? `<span class="td-status-pill td-status-pill--paused">human takeover</span>` : ''}
          ${drafting ? `<span class="td-status-pill td-status-pill--drafting">drafting</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

export function renderThreadDetail(container, thread, messages, draft) {
  if (!container || !thread) return;

  const allMsgs = [...(messages || [])];
  if (draft) {
    allMsgs.push({ ...draft, is_draft: true, direction: 'outbound' });
  }

  container.innerHTML = `
    ${buildHeader(thread)}
    <div class="td-messages" id="td-messages">
      ${allMsgs.length === 0
        ? `<div class="td-empty"><p>No messages in this thread yet.</p></div>`
        : allMsgs.map(buildBubble).join('')
      }
    </div>
  `;

  // Scroll to bottom
  const msgs = container.querySelector('#td-messages');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

export function appendMessage(container, msg) {
  const msgs = container?.querySelector('#td-messages');
  if (!msgs) return;

  const empty = msgs.querySelector('.td-empty');
  if (empty) empty.remove();

  msgs.insertAdjacentHTML('beforeend', buildBubble(msg));
  msgs.scrollTop = msgs.scrollHeight;
}

export function refreshHeader(container, thread) {
  if (!container) return;
  const hdr = container.querySelector('.td-header');
  if (!hdr) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = buildHeader(thread);
  hdr.replaceWith(tmp.firstElementChild);
}
