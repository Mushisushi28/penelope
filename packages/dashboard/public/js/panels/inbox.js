// panels/inbox.js — Unified omnichannel inbox orchestrator (v2)
import { renderThreadList, updateThreadListItem } from '../inbox/thread-list.js';
import { renderThreadDetail, appendMessage, refreshHeader } from '../inbox/thread-detail.js';
import { renderComposer } from '../inbox/composer.js';
import { renderTakeoverToggle } from '../inbox/takeover-toggle.js';

const POLL_INTERVAL = 30_000;
const _state = new WeakMap();
function getState(root) { return _state.get(root) || {}; }
function setState(root, patch) { _state.set(root, { ...getState(root), ...patch }); }

export function mountInbox(root) {
  setState(root, {
    threads: [], activeThread: null, messages: [],
    channelFilter: '', loading: false, pollTimer: null,
  });

  root.innerHTML = buildShell();

  root.querySelector('#inbox-refresh').addEventListener('click', () =>
    refreshThreads(root, { silent: false }));

  root.querySelector('#inbox-channel').addEventListener('change', e => {
    setState(root, { channelFilter: e.target.value, activeThread: null });
    root.querySelector('#inbox-detail-pane').style.display = 'none';
    root.querySelector('#inbox-detail-empty').style.display = '';
    root.querySelector('#inbox-v2').classList.remove('inbox-v2--thread-open');
    refreshThreads(root, { silent: true });
  });

  refreshThreads(root, { silent: false });
  const timer = setInterval(() => refreshThreads(root, { silent: true }), POLL_INTERVAL);
  setState(root, { pollTimer: timer });
}

export function unmountInbox(root) {
  const st = getState(root);
  if (st.pollTimer) clearInterval(st.pollTimer);
  _state.delete(root);
  root.innerHTML = '';
}

function buildShell() {
  return [
    '<div class="inbox-v2" id="inbox-v2">',
    '  <aside class="inbox-rail" id="inbox-rail">',
    '    <div class="inbox-rail-header">',
    '      <h2 class="inbox-rail-title">Inbox</h2>',
    '      <div class="inbox-rail-controls">',
    '        <select class="inbox-filter" id="inbox-channel" aria-label="Filter by channel">',
    '          <option value="">All channels</option>',
    '          <option value="telegram">Telegram</option>',
    '          <option value="fb-messenger">FB Messenger</option>',
    '          <option value="sms">SMS</option>',
    '          <option value="email">Email</option>',
    '          <option value="instagram">Instagram</option>',
    '          <option value="whatsapp">WhatsApp</option>',
    '          <option value="loom-a2a">Loom A2A</option>',
    '        </select>',
    '        <button class="btn btn-ghost btn-sm" id="inbox-refresh" aria-label="Refresh inbox">',
    '          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
    '            <path d="M23 4v6h-6M1 20v-6h6"/>',
    '            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    '          </svg>',
    '        </button>',
    '      </div>',
    '    </div>',
    '    <div class="inbox-thread-list" id="inbox-thread-list">',
    '      <div class="tl-loading">Loading...</div>',
    '    </div>',
    '  </aside>',
    '  <section class="inbox-detail" id="inbox-detail">',
    '    <div class="inbox-detail-empty" id="inbox-detail-empty">',
    '      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">',
    '        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    '      </svg>',
    '      <p>Select a conversation</p>',
    '    </div>',
    '    <div class="inbox-detail-pane" id="inbox-detail-pane" style="display:none">',
    '      <div class="inbox-detail-body" id="inbox-detail-body"></div>',
    '      <div class="inbox-takeover-bar" id="inbox-takeover-bar"></div>',
    '      <div class="inbox-composer" id="inbox-composer"></div>',
    '    </div>',
    '  </section>',
    '</div>',
  ].join('\n');
}

async function refreshThreads(root, { silent = false } = {}) {
  const st = getState(root);
  if (st.loading && !silent) return;
  setState(root, { loading: true });

  const ch = st.channelFilter || root.querySelector('#inbox-channel')?.value || '';

  try {
    const path = ch
      ? '/api/inbox/threads?channel=' + encodeURIComponent(ch)
      : '/api/inbox/threads';
    const res = await fetch(path);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const threads = data.threads || [];

    setState(root, { threads, loading: false });

    const listEl = root.querySelector('#inbox-thread-list');
    if (listEl) {
      const activeId = getState(root).activeThread?.id;
      renderThreadList(listEl, threads, activeId, (id) => {
        const t = getState(root).threads.find(x => String(x.id) === String(id));
        if (t) selectThread(root, t);
      });
    }

    const totalUnread = threads.reduce((n, t) => n + (t.unread || 0), 0);
    updateNavBadge(totalUnread);
  } catch (e) {
    setState(root, { loading: false });
    if (!silent) {
      const listEl = root.querySelector('#inbox-thread-list');
      if (listEl) listEl.innerHTML = '<div class="tl-error">Failed to load inbox: ' + e.message + '</div>';
    }
  }
}

function makeToggleHandler(root, bodyEl, takeoverEl, composerEl, draft) {
  return function onToggle(updatedThread) {
    const st = getState(root);
    const idx = st.threads.findIndex(x => String(x.id) === String(updatedThread.id));
    if (idx !== -1) {
      const newThreads = [...st.threads];
      newThreads[idx] = Object.assign({}, newThreads[idx], updatedThread);
      setState(root, { threads: newThreads, activeThread: updatedThread });
    } else {
      setState(root, { activeThread: updatedThread });
    }
    renderTakeoverToggle(takeoverEl, updatedThread,
      makeToggleHandler(root, bodyEl, takeoverEl, composerEl, draft));
    renderComposer(composerEl, updatedThread, draft, function(msg) { appendMessage(bodyEl, msg); });
    refreshHeader(bodyEl, updatedThread);
    const listEl = root.querySelector('#inbox-thread-list');
    if (listEl) updateThreadListItem(listEl, updatedThread.id, updatedThread);
  };
}

async function selectThread(root, thread) {
  setState(root, { activeThread: thread, messages: [] });
  root.querySelector('#inbox-v2').classList.add('inbox-v2--thread-open');

  root.querySelector('#inbox-detail-pane').style.display  = '';
  root.querySelector('#inbox-detail-empty').style.display = 'none';

  const listEl = root.querySelector('#inbox-thread-list');
  if (listEl) {
    renderThreadList(listEl, getState(root).threads, thread.id, function(id) {
      const t = getState(root).threads.find(x => String(x.id) === String(id));
      if (t) selectThread(root, t);
    });
  }

  const bodyEl     = root.querySelector('#inbox-detail-body');
  const takeoverEl = root.querySelector('#inbox-takeover-bar');
  const composerEl = root.querySelector('#inbox-composer');

  if (bodyEl) bodyEl.innerHTML = '<div class="td-loading">Loading messages...</div>';

  try {
    const res = await fetch('/api/inbox/' + thread.id + '/thread');
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const messages = data.messages || [];
    const draft    = data.pending_draft || null;

    setState(root, { messages, activeThread: thread });

    if (bodyEl) {
      renderThreadDetail(bodyEl, thread, messages, draft);
      const backBtn = bodyEl.querySelector('#td-back');
      if (backBtn) {
        backBtn.addEventListener('click', function() {
          root.querySelector('#inbox-v2').classList.remove('inbox-v2--thread-open');
          root.querySelector('#inbox-detail-pane').style.display  = 'none';
          root.querySelector('#inbox-detail-empty').style.display = '';
        });
      }
    }

    if (takeoverEl) {
      renderTakeoverToggle(takeoverEl, thread,
        makeToggleHandler(root, bodyEl, takeoverEl, composerEl, draft));
    }

    if (composerEl) {
      renderComposer(composerEl, thread, draft, function(msg) { appendMessage(bodyEl, msg); });
    }

  } catch (e) {
    if (bodyEl) bodyEl.innerHTML = '<div class="td-error">Failed to load thread: ' + e.message + '</div>';
  }
}

function updateNavBadge(count) {
  let badge = document.querySelector('.nav-inbox-badge');
  if (count <= 0) { if (badge) badge.remove(); return; }
  if (!badge) {
    const navRow = document.querySelector('[data-view="inbox"], [data-route="inbox"], [href="#/inbox"]');
    if (!navRow) return;
    badge = document.createElement('span');
    badge.className = 'nav-inbox-badge';
    navRow.appendChild(badge);
  }
  badge.textContent = count > 99 ? '99+' : String(count);
}
