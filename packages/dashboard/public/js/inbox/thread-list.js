// inbox/thread-list.js -- renders the thread list rail

import { channelIcon, channelColor } from './channel-icon.js';

function formatRelTime(isoStr) {
  if (!isoStr) return '';
  var d = new Date(isoStr);
  var diff = Date.now() - d.getTime();
  var m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm';
  var h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
}

function buildRow(thread, isActive) {
  var color = channelColor(thread.channel);
  var icon = channelIcon(thread.channel, false);
  var unread = thread.unread || 0;
  var statusBadge = '';
  if (thread.paused_at) {
    statusBadge = '<span class="tl-status-badge tl-status-paused">paused</span>';
  } else if (thread.ai_status === 'drafting') {
    statusBadge = '<span class="tl-status-badge tl-status-drafting">drafting</span>';
  } else if (thread.ai_status === 'sent') {
    statusBadge = '<span class="tl-status-badge tl-status-sent">sent</span>';
  }
  var classes = 'tl-row';
  if (isActive) classes += ' tl-row--active';
  if (unread > 0) classes += ' tl-row--unread';
  if (thread.paused_at) classes += ' tl-row--paused';
  return [
    '<div class="' + classes + '" data-thread-id="' + thread.id + '">',
    '  <div class="tl-avatar" style="--ch-color:' + color + '">',
    '    <span class="tl-avatar-initials">' + (thread.customer_name || '?').charAt(0).toUpperCase() + '</span>',
    '    <span class="tl-ch-badge">' + icon + '</span>',
    '  </div>',
    '  <div class="tl-info">',
    '    <div class="tl-name-row">',
    '      <span class="tl-name">' + (thread.customer_name || 'Unknown') + '</span>',
    '      <span class="tl-time">' + formatRelTime(thread.last_at) + '</span>',
    '    </div>',
    '    <div class="tl-preview-row">',
    '      <span class="tl-preview">' + (thread.last_message || '').slice(0, 60) + '</span>',
    unread > 0 ? '      <span class="tl-unread-dot">' + (unread > 9 ? '9+' : String(unread)) + '</span>' : '',
    '    </div>',
    statusBadge ? '    <div class="tl-badges">' + statusBadge + '</div>' : '',
    '  </div>',
    '</div>',
  ].join('');
}

export function renderThreadList(container, threads, activeId, onSelect) {
  if (!container) return;
  if (!threads || threads.length === 0) {
    container.innerHTML = '<div class="tl-empty">No conversations yet.</div>';
    return;
  }
  var html = threads.map(function(t) {
    return buildRow(t, String(t.id) === String(activeId));
  }).join('');
  container.innerHTML = html;
  container.querySelectorAll('.tl-row').forEach(function(row) {
    row.addEventListener('click', function() {
      onSelect(row.getAttribute('data-thread-id'));
    });
  });
}

export function updateThreadListItem(container, threadId, patch) {
  if (!container) return;
  var row = container.querySelector('[data-thread-id="' + threadId + '"]');
  if (!row) return;
  var isActive = row.classList.contains('tl-row--active');
  var newHtml = buildRow(patch, isActive);
  var tmp = document.createElement('div');
  tmp.innerHTML = newHtml;
  var newRow = tmp.firstChild;
  row.replaceWith(newRow);
  newRow.addEventListener('click', function() {
    // Re-attach click; onSelect not available here — handled by parent re-render
  });
}
