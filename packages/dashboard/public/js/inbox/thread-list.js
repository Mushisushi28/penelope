// inbox/thread-list.js — Left-rail thread list renderer
import { channelIcon, channelColor, channelLabel } from './channel-icon.js';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function relTime(d) {
  if (!d) return '';
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return Math.floor(diff / 60) + 'm';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function statusBadge(t) {
  if (t.paused_at) return `<span class="tl-status tl-status--paused">paused</span>`;
  if (t.ai_status === 'drafting') return `<span class="tl-status tl-status--drafting">drafting</span>`;
  if (t.ai_status === 'sent')    return `<span class="tl-status tl-status--sent">sent</span>`;
  return '';
}

function buildRow(t, isActive) {
  const initials  = (t.customer_name || '?').slice(0, 2).toUpperCase();
  const chColor   = channelColor(t.channel);
  const chIcon    = channelIcon(t.channel, true);
  const preview   = esc((t.last_message || '').slice(0, 90));
  const time      = relTime(t.last_at);
  const unread    = t.unread || 0;
  const activeClass  = isActive ? ' tl-row--active' : '';
  const unreadClass  = unread  ? ' tl-row--unread' : '';
  const pausedClass  = t.paused_at ? ' tl-row--paused' : '';

  return `
    <div class="tl-row${activeClass}${unreadClass}${pausedClass}" data-id="${t.id}"
         style="--ch-color:${chColor}" role="button" tabindex="0">
      <div class="tl-avatar-wrap">
        <div class="tl-avatar">${esc(initials)}</div>
        <div class="tl-ch-badge" title="${esc(channelLabel(t.channel))}">${chIcon}</div>
      </div>
      <div class="tl-body">
        <div class="tl-row-top">
          <span class="tl-name">${esc(t.customer_name || 'Unknown')}</span>
          <span class="tl-time">${time}</span>
        </div>
        <div class="tl-row-mid">
          <span class="tl-preview">${preview}</span>
          ${unread ? `<span class="tl-unread-dot">${unread}</span>` : ''}
        </div>
        <div class="tl-row-foot">
          ${statusBadge(t)}
        </div>
      </div>
    </div>
  `;
}

export function renderThreadList(container, threads, activeId, onSelect) {
  if (!container) return;

  if (!threads || threads.length === 0) {
    container.innerHTML = `
      <div class="tl-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <p>No conversations yet</p>
      </div>
    `;
    return;
  }

  container.innerHTML = threads.map(t => buildRow(t, String(t.id) === String(activeId))).join('');

  container.querySelectorAll('.tl-row').forEach(row => {
    const id = row.dataset.id;
    row.addEventListener('click', () => onSelect && onSelect(id));
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect && onSelect(id);
      }
    });
  });
}

export function updateThreadListItem(container, threadId, patch) {
  const row = container?.querySelector(`.tl-row[data-id="${threadId}"]`);
  if (!row) return;

  if (patch.paused_at !== undefined) {
    row.classList.toggle('tl-row--paused', !!patch.paused_at);
  }
  if (patch.ai_status) {
    const foot = row.querySelector('.tl-row-foot');
    if (foot) {
      foot.innerHTML = statusBadge({ ...patch });
    }
  }
  if (patch.unread !== undefined) {
    const dot = row.querySelector('.tl-unread-dot');
    if (patch.unread > 0) {
      if (dot) { dot.textContent = patch.unread; }
      else {
        const mid = row.querySelector('.tl-row-mid');
        if (mid) mid.insertAdjacentHTML('beforeend', `<span class="tl-unread-dot">${patch.unread}</span>`);
      }
      row.classList.add('tl-row--unread');
    } else {
      if (dot) dot.remove();
      row.classList.remove('tl-row--unread');
    }
  }
}
