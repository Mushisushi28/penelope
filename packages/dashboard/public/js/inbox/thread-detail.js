// inbox/thread-detail.js -- renders the conversation detail pane

import { channelIcon, channelColor, channelLabel } from './channel-icon.js';

function formatTime(isoStr) {
  if (!isoStr) return '';
  var d = new Date(isoStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function buildBubble(msg) {
  var isDraft = msg.draft_id !== undefined || msg._is_draft;
  var dir = msg.direction || 'inbound';
  var cls = 'td-bubble td-bubble--' + (isDraft ? 'draft' : dir);
  return [
    '<div class="' + cls + '">',
    isDraft ? '<div class="td-draft-label">&#9670; Penelope draft &mdash; pending approval</div>' : '',
    '<div class="td-bubble-text">' + (msg.text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/
/g,'<br>') + '</div>',
    '<div class="td-bubble-time">' + formatTime(msg.ts) + '</div>',
    '</div>',
  ].join('');
}

export function renderThreadDetail(container, thread, messages, draft) {
  if (!container) return;
  var color = channelColor(thread.channel);
  var icon = channelIcon(thread.channel, true);
  var pills = '';
  if (thread.paused_at) {
    pills += '<span class="td-pill td-pill--paused">paused</span>';
  } else if (thread.ai_status === 'drafting') {
    pills += '<span class="td-pill td-pill--drafting">drafting</span>';
  }
  var header = [
    '<div class="td-header">',
    '  <button class="itp-back-btn" id="td-back" aria-label="Back to thread list">',
    '    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>',
    '  </button>',
    '  <div class="td-header-avatar" style="--ch-color:' + color + '">',
    '    <span>' + (thread.customer_name || '?').charAt(0).toUpperCase() + '</span>',
    '  </div>',
    '  <div class="td-header-info">',
    '    <div class="td-header-name">' + (thread.customer_name || 'Unknown') + '</div>',
    '    <div class="td-header-meta">',
    '      <span class="td-ch-pill" style="background:' + color + '20;color:' + color + '">' + icon + ' ' + channelLabel(thread.channel) + '</span>',
    pills,
    '    </div>',
    '  </div>',
    '</div>',
  ].join('');
  var bubbles = (messages || []).map(buildBubble).join('');
  if (draft) {
    bubbles += buildBubble({ text: draft.text || draft, direction: 'outbound', ts: draft.ts || null, _is_draft: true });
  }
  container.innerHTML = header + '<div class="td-messages" id="td-messages">' + bubbles + '</div>';
  var msgs = container.querySelector('#td-messages');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

export function appendMessage(container, msg) {
  if (!container) return;
  var msgs = container.querySelector('#td-messages');
  if (!msgs) return;
  var tmp = document.createElement('div');
  tmp.innerHTML = buildBubble(msg);
  msgs.appendChild(tmp.firstChild);
  msgs.scrollTop = msgs.scrollHeight;
}

export function refreshHeader(container, thread) {
  if (!container) return;
  var header = container.querySelector('.td-header');
  if (!header) return;
  var color = channelColor(thread.channel);
  var icon = channelIcon(thread.channel, true);
  var pills = '';
  if (thread.paused_at) {
    pills = '<span class="td-pill td-pill--paused">paused</span>';
  } else if (thread.ai_status === 'drafting') {
    pills = '<span class="td-pill td-pill--drafting">drafting</span>';
  }
  header.querySelector('.td-header-name').textContent = thread.customer_name || 'Unknown';
  var meta = header.querySelector('.td-header-meta');
  if (meta) {
    meta.innerHTML = '<span class="td-ch-pill" style="background:' + color + '20;color:' + color + '">' + icon + ' ' + channelLabel(thread.channel) + '</span>' + pills;
  }
}
