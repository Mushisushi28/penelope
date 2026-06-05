// panels/home.js — Home panel: stats, brief, approvals callout, quick actions

import { getBrief, getShadowQueue, busAction } from '../api.js';
import { navigate } from '../router.js';

export function mountHome(root) {
  root.innerHTML = `
    <div class="panel" id="home-panel">
      <div class="panel-header">
        <h1 class="panel-title">Good morning</h1>
        <span class="panel-subtitle" id="home-date"></span>
      </div>

      <div id="home-approvals"></div>

      <div class="stat-grid" id="home-stats">
        ${['New inquiries','Jobs booked','Queue pending','Unread messages'].map(l => `
          <div class="stat-card">
            <div class="stat-label">${l}</div>
            <div class="stat-value skeleton skeleton-line" style="width:60px;height:32px;">&nbsp;</div>
          </div>
        `).join('')}
      </div>

      <div class="brief-section">
        <div class="section-title">Today's brief</div>
        <div class="brief-list" id="home-brief">
          ${[1,2,3].map(() => `<div class="brief-item"><span class="skeleton skeleton-line" style="width:100%;height:14px;"></span></div>`).join('')}
        </div>
      </div>

      <div class="section-title" style="margin-bottom:10px">Quick actions</div>
      <div class="quick-actions">
        <button class="btn btn-outline" id="qa-pause">⏸ Pause autopilot</button>
        <button class="btn btn-outline" id="qa-recap">📊 Run recap</button>
        <button class="btn btn-outline" id="qa-queue">⟳ Review queue</button>
        <button class="btn btn-outline" id="qa-inbox">✉ Open inbox</button>
      </div>
    </div>
  `;

  // Set date subtitle
  const dateEl = root.querySelector('#home-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
  }

  // Wire quick actions
  root.querySelector('#qa-pause').addEventListener('click', async () => {
    try { await busAction('pause-autopilot'); alert('Autopilot paused for 1 hour.'); }
    catch (e) { alert('Could not reach bus: ' + e.message); }
  });
  root.querySelector('#qa-recap').addEventListener('click', async () => {
    try { await busAction('run-recap'); alert('Recap queued.'); }
    catch (e) { alert('Could not reach bus: ' + e.message); }
  });
  root.querySelector('#qa-queue').addEventListener('click', () => navigate('shadow-queue'));
  root.querySelector('#qa-inbox').addEventListener('click', () => navigate('inbox'));

  // Load data
  loadStats(root);
  loadApprovals(root);
}

export function unmountHome(root) {
  root.innerHTML = '';
}

async function loadStats(root) {
  try {
    const data = await getBrief();
    const s = data.stats || {};
    const statsEl = root.querySelector('#home-stats');
    if (!statsEl) return;
    statsEl.innerHTML = [
      { label: 'New inquiries',    val: s.new_inquiries    ?? '—' },
      { label: 'Jobs booked',      val: s.jobs_booked      ?? '—' },
      { label: 'Queue pending',    val: s.queue_pending    ?? '—' },
      { label: 'Unread messages',  val: s.unread           ?? '—' },
    ].map(({ label, val }) => `
      <div class="stat-card">
        <div class="stat-label">${label}</div>
        <div class="stat-value">${val}</div>
      </div>
    `).join('');

    const briefEl = root.querySelector('#home-brief');
    if (briefEl && data.bullets && data.bullets.length) {
      briefEl.innerHTML = data.bullets.slice(0, 8).map(b => `
        <div class="brief-item">
          <span class="brief-bullet">◆</span>
          <span>${b}</span>
        </div>
      `).join('');
    } else if (briefEl) {
      briefEl.innerHTML = `<div class="brief-item"><span class="brief-bullet">◆</span><span>No brief data available.</span></div>`;
    }
  } catch (e) {
    const statsEl = root.querySelector('#home-stats');
    if (statsEl) statsEl.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:8px;">Could not load stats: ${e.message}</div>`;
  }
}

async function loadApprovals(root) {
  try {
    const data = await getShadowQueue();
    const pending = (data.items || []).filter(i => i.status === 'pending');
    const approvalsEl = root.querySelector('#home-approvals');
    if (!approvalsEl) return;
    if (pending.length > 0) {
      approvalsEl.innerHTML = `
        <div class="approvals-card">
          <div class="approvals-icon">✉</div>
          <div class="approvals-body">
            <div class="approvals-count">${pending.length} message${pending.length > 1 ? 's' : ''} pending approval</div>
            <div class="approvals-desc">Drafted replies waiting for your review</div>
          </div>
          <button class="btn btn-primary btn-sm" id="approvals-go">Review →</button>
        </div>
      `;
      approvalsEl.querySelector('#approvals-go').addEventListener('click', () => navigate('shadow-queue'));
    }
  } catch (_) {}
}
