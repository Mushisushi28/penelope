// panels/inbox.js -- Unified omnichannel inbox orchestrator (v2)
import { renderThreadList, updateThreadListItem } from '../inbox/thread-list.js';
import { renderThreadDetail, appendMessage, refreshHeader } from '../inbox/thread-detail.js';
import { renderComposer } from '../inbox/composer.js';
import { renderTakeoverToggle } from '../inbox/takeover-toggle.js';

const POLL_INTERVAL = 30000;
const _state = new WeakMap();
function getState(root) { return _state.get(root) || {}; }
function setState(root, patch) { _state.set(root, Object.assign({}, _state.get(root) || {}, patch)); }

function buildShell() {
  return [
    '<div class="inbox-v2" id="inbox-v2">',
    '<aside class="inbox-rail" id="inbox-rail">',
    '<div class="inbox-rail-header">',
    '<h2 class="inbox-rail-title">Inbox</h2>',
    '<div class="inbox-rail-controls">',
    '<select class="inbox-filter" id="inbox-channel">',
    '<option value="">All channels</option>',
    '<option value="telegram">Telegram</option>',
    '<option value="fb-messenger">FB Messenger</option>',
    '<option value="sms">SMS</option>',
    '<option value="email">Email</option>',
    '<option value="instagram">Instagram</option>',
    '<option value="whatsapp">WhatsApp</option>',
    '<option value="loom-a2a">Loom A2A</option>',
    '</select>',
    '<button class="btn btn-ghost btn-sm" id="inbox-refresh" aria-label="Refresh inbox">',
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
    '<path d="M23 4v6h-6M1 20v-6h6"/>',
    '<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    '</svg></button>',
    '</div></div>',
    '<div class="inbox-thread-list" id="inbox-thread-list"><div class="tl-loading">Loading...</div></div>',
    '</aside>',
    '<section class="inbox-detail" id="inbox-detail">',
    '<div class="inbox-detail-empty" id="inbox-detail-empty">',
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">',
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    '</svg><p>Select a conversation</p></div>',
    '<div class="inbox-detail-pane" id="inbox-detail-pane" style="display:none">',
    '<div class="inbox-detail-body" id="inbox-detail-body"></div>',
    '<div class="inbox-takeover-bar" id="inbox-takeover-bar"></div>',
    '<div class="inbox-composer" id="inbox-composer"></div>',
    '</div></section></div>',
  ].join('\n');
}

export function mountInbox(root) {
  setState(root, { threads: [], activeThread: null, messages: [], channelFilter: '', loading: false, pollTimer: null });
  root.innerHTML = buildShell();
  root.querySelector('#inbox-refresh').addEventListener('click', function() { refreshThreads(root, false); });
  root.querySelector('#inbox-channel').addEventListener('change', function(e) {
    setState(root, { channelFilter: e.target.value, activeThread: null });
    root.querySelector('#inbox-detail-pane').style.display = 'none';
    root.querySelector('#inbox-detail-empty').style.display = '';
    root.querySelector('#inbox-v2').classList.remove('inbox-v2--thread-open');
    refreshThreads(root, true);
  });
  refreshThreads(root, false);
  var timer = setInterval(function() { refreshThreads(root, true); }, POLL_INTERVAL);
  setState(root, { pollTimer: timer });
}

export function unmountInbox(root) {
  var st = getState(root);
  if (st.pollTimer) clearInterval(st.pollTimer);
  _state.delete(root);
  root.innerHTML = '';
}

function refreshThreads(root, silent) {
  var st = getState(root);
  if (st.loading && !silent) return;
  setState(root, { loading: true });
  var ch = st.channelFilter || (root.querySelector('#inbox-channel') && root.querySelector('#inbox-channel').value) || '';
  var path = ch ? '/api/inbox/threads?channel=' + encodeURIComponent(ch) : '/api/inbox/threads';
  return fetch(path)
    .then(function(res) { if (!res.ok) return res.text().then(function(t) { throw new Error(t); }); return res.json(); })
    .then(function(data) {
      var threads = data.threads || [];
      setState(root, { threads: threads, loading: false });
      var listEl = root.querySelector('#inbox-thread-list');
      if (listEl) {
        var activeId = getState(root).activeThread ? getState(root).activeThread.id : null;
        renderThreadList(listEl, threads, activeId, function(id) {
          var t = getState(root).threads.find(function(x) { return String(x.id) === String(id); });
          if (t) selectThread(root, t);
        });
      }
      var totalUnread = threads.reduce(function(n, t) { return n + (t.unread || 0); }, 0);
      updateNavBadge(totalUnread);
    })
    .catch(function(e) {
      setState(root, { loading: false });
      if (!silent) {
        var listEl2 = root.querySelector('#inbox-thread-list');
        if (listEl2) listEl2.innerHTML = '<div class="tl-error">Failed: ' + e.message + '</div>';
      }
    });
}

function makeToggleHandler(root, bodyEl, takeoverEl, composerEl, draft) {
  return function onToggle(updatedThread) {
    var st = getState(root);
    var idx = st.threads.findIndex(function(x) { return String(x.id) === String(updatedThread.id); });
    if (idx !== -1) {
      var nt = st.threads.slice();
      nt[idx] = Object.assign({}, nt[idx], updatedThread);
      setState(root, { threads: nt, activeThread: updatedThread });
    } else {
      setState(root, { activeThread: updatedThread });
    }
    renderTakeoverToggle(takeoverEl, updatedThread, makeToggleHandler(root, bodyEl, takeoverEl, composerEl, draft));
    renderComposer(composerEl, updatedThread, draft, function(msg) { appendMessage(bodyEl, msg); });
    refreshHeader(bodyEl, updatedThread);
    var lEl = root.querySelector('#inbox-thread-list');
    if (lEl) updateThreadListItem(lEl, updatedThread.id, updatedThread);
  };
}

function selectThread(root, thread) {
  setState(root, { activeThread: thread, messages: [] });
  root.querySelector('#inbox-v2').classList.add('inbox-v2--thread-open');
  root.querySelector('#inbox-detail-pane').style.display = '';
  root.querySelector('#inbox-detail-empty').style.display = 'none';
  var listEl = root.querySelector('#inbox-thread-list');
  if (listEl) {
    renderThreadList(listEl, getState(root).threads, thread.id, function(id) {
      var t = getState(root).threads.find(function(x) { return String(x.id) === String(id); });
      if (t) selectThread(root, t);
    });
  }
  var bodyEl     = root.querySelector('#inbox-detail-body');
  var takeoverEl = root.querySelector('#inbox-takeover-bar');
  var composerEl = root.querySelector('#inbox-composer');
  if (bodyEl) bodyEl.innerHTML = '<div class="td-loading">Loading messages...</div>';
  return fetch('/api/inbox/' + thread.id + '/thread')
    .then(function(res) { if (!res.ok) return res.text().then(function(t) { throw new Error(t); }); return res.json(); })
    .then(function(data) {
      var messages = data.messages || [];
      var draft = data.pending_draft || null;
      setState(root, { messages: messages, activeThread: thread });
      if (bodyEl) {
        renderThreadDetail(bodyEl, thread, messages, draft);
        var bb = bodyEl.querySelector('#td-back');
        if (bb) bb.addEventListener('click', function() {
          root.querySelector('#inbox-v2').classList.remove('inbox-v2--thread-open');
          root.querySelector('#inbox-detail-pane').style.display = 'none';
          root.querySelector('#inbox-detail-empty').style.display = '';
        });
      }
      if (takeoverEl) renderTakeoverToggle(takeoverEl, thread, makeToggleHandler(root, bodyEl, takeoverEl, composerEl, draft));
      if (composerEl) renderComposer(composerEl, thread, draft, function(msg) { appendMessage(bodyEl, msg); });
    })
    .catch(function(e) {
      if (bodyEl) bodyEl.innerHTML = '<div class="td-error">Failed to load thread: ' + e.message + '</div>';
    });
}

function updateNavBadge(count) {
  var badge = document.querySelector('.nav-inbox-badge');
  if (count <= 0) { if (badge) badge.remove(); return; }
  if (!badge) {
    var navRow = document.querySelector('[data-view="inbox"], [data-route="inbox"], [href="#/inbox"]');
    if (!navRow) return;
    badge = document.createElement('span');
    badge.className = 'nav-inbox-badge';
    navRow.appendChild(badge);
  }
  badge.textContent = count > 99 ? '99+' : String(count);
}
