// panels/settings.js — Appearance, business, agent voice, escalation, security

import { getSettings, saveSettings } from '../api.js';
import { setCustomColor, setDensity, isDark, toggleTheme } from '../theme.js';

const DAYS = ['mon','tue','wed','thu','fri','sat','sun'];
const DAY_LABELS = { mon:'Mon',tue:'Tue',wed:'Wed',thu:'Thu',fri:'Fri',sat:'Sat',sun:'Sun' };

let _settings = {};
let _escalations = [];

export function mountSettings(root) {
  root.innerHTML = `
    <div class="panel" id="settings-panel">
      <div class="panel-header">
        <h1 class="panel-title">Settings</h1>
        <span class="panel-subtitle">Appearance, business info, agent configuration</span>
      </div>
      <div id="settings-body">
        <div style="color:var(--muted);padding:16px 0;">Loading…</div>
      </div>
      <div style="margin-top:8px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" id="settings-save">Save changes</button>
        <button class="btn btn-ghost" id="settings-discard">Discard</button>
      </div>
    </div>
  `;

  root.querySelector('#settings-save').addEventListener('click', () => saveAll(root));
  root.querySelector('#settings-discard').addEventListener('click', () => mountSettings(root));

  loadSettings(root);
}

async function loadSettings(root) {
  try {
    _settings = await getSettings();
    _escalations = _settings.escalation_contacts || [];
    renderBody(root);
  } catch (e) {
    const body = root.querySelector('#settings-body');
    if (body) body.innerHTML = `<div style="color:var(--danger);">Failed to load settings: ${e.message}</div>`;
  }
}

function renderBody(root) {
  const body = root.querySelector('#settings-body');
  if (!body) return;
  body.innerHTML = [
    buildAppearance(),
    buildBusiness(),
    buildAgentVoice(),
    buildEscalation(),
    buildSecurity(),
  ].join('');

  wireAppearance(root);
  wireEscalation(root);
}

function buildAppearance() {
  return `
    <div class="settings-section">
      <div class="settings-section-title">🎨 Appearance</div>
      <div class="settings-row">
        <div class="settings-label">Dark mode
          <div class="settings-label-sub">Toggle between dark (olive) and light (sand) themes</div>
        </div>
        <label class="toggle"><input type="checkbox" id="dark-toggle" ${isDark() ? 'checked' : ''}><span class="toggle-track"></span></label>
      </div>
      <div class="settings-row">
        <div class="settings-label">Density</div>
        <select class="settings-select" id="density-select">
          <option value="compact">Compact</option>
          <option value="comfortable" selected>Comfortable</option>
          <option value="spacious">Spacious</option>
        </select>
      </div>
      <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:12px">
        <div class="settings-label">Brand colors</div>
        <div class="color-row" style="flex-wrap:wrap;gap:14px">
          ${buildColorSwatch('--penelope-loom',    'Background')}
          ${buildColorSwatch('--penelope-thread',  'Text')}
          ${buildColorSwatch('--penelope-shuttle', 'Accent')}
          ${buildColorSwatch('--penelope-warp',    'Border')}
          ${buildColorSwatch('--penelope-weft',    'Surface')}
        </div>
      </div>
    </div>
  `;
}

function buildColorSwatch(token, label) {
  const val = getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#888';
  return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
      <label class="color-swatch" style="background:${val}" title="${token}">
        <input type="color" class="color-picker" data-token="${token}" value="${rgbToHex(val)}">
      </label>
      <span class="color-label">${label}</span>
    </div>
  `;
}

function buildBusiness() {
  const s = _settings;
  return `
    <div class="settings-section">
      <div class="settings-section-title">🏢 Business</div>
      <div class="settings-row">
        <div class="settings-label">Business name</div>
        <input class="settings-input" id="biz-name" value="${esc(s.business_name || '')}" placeholder="Your business name">
      </div>
      <div class="settings-row">
        <div class="settings-label">Phone</div>
        <input class="settings-input" id="biz-phone" value="${esc(s.phone || '')}" placeholder="+1 (xxx) xxx-xxxx">
      </div>
      <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:12px">
        <div class="settings-label">Hours</div>
        <div class="hours-grid">
          ${DAYS.map(d => buildHoursRow(d, s)).join('')}
        </div>
      </div>
    </div>
  `;
}

function buildHoursRow(day, s) {
  const hours  = (s.hours || {})[day] || {};
  const open   = !!hours.open;
  return `
    <div class="hours-row">
      <span class="hours-day">${DAY_LABELS[day]}</span>
      <label class="toggle" title="Open on ${DAY_LABELS[day]}">
        <input type="checkbox" class="hours-open" data-day="${day}" ${open ? 'checked' : ''}>
        <span class="toggle-track"></span>
      </label>
      <input type="time" class="hours-time" id="hours-${day}-from" value="${hours.from || '09:00'}" ${!open ? 'disabled' : ''}>
      <span style="color:var(--muted);font-size:12px">–</span>
      <input type="time" class="hours-time" id="hours-${day}-to" value="${hours.to || '17:00'}" ${!open ? 'disabled' : ''}>
    </div>
  `;
}

function buildAgentVoice() {
  const s = _settings;
  return `
    <div class="settings-section">
      <div class="settings-section-title">🤖 Agent voice</div>
      <div class="settings-row">
        <div class="settings-label">Tone</div>
        <select class="settings-select" id="agent-tone">
          <option value="friendly" ${s.tone==='friendly'?'selected':''}>Friendly</option>
          <option value="professional" ${s.tone==='professional'?'selected':''}>Professional</option>
          <option value="casual" ${s.tone==='casual'?'selected':''}>Casual</option>
        </select>
      </div>
      <div class="settings-row">
        <div class="settings-label">Signature
          <div class="settings-label-sub">Appended to agent replies</div>
        </div>
        <input class="settings-input" id="agent-signature" value="${esc(s.signature || '')}" placeholder="e.g. — The Team at Acme">
      </div>
      <div class="settings-row">
        <div class="settings-label">Autopilot
          <div class="settings-label-sub">Allow agent to send without approval</div>
        </div>
        <label class="toggle"><input type="checkbox" id="autopilot-toggle" ${s.autopilot ? 'checked' : ''}><span class="toggle-track"></span></label>
      </div>
    </div>
  `;
}

function buildEscalation() {
  return `
    <div class="settings-section">
      <div class="settings-section-title">🚨 Escalation contacts</div>
      <div class="escalation-list" id="escalation-list">
        ${_escalations.map((c, i) => `
          <div class="escalation-item" data-idx="${i}">
            <span>${esc(c.name || '')} — ${esc(c.contact || '')}</span>
            <button class="btn btn-ghost btn-sm remove-escalation" data-idx="${i}">✕</button>
          </div>
        `).join('')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input class="settings-input" id="esc-name" placeholder="Name" style="min-width:140px">
        <input class="settings-input" id="esc-contact" placeholder="Phone or Telegram" style="min-width:180px">
        <button class="btn btn-outline btn-sm" id="add-escalation">+ Add</button>
      </div>
    </div>
  `;
}

function buildSecurity() {
  const s = _settings;
  return `
    <div class="settings-section">
      <div class="settings-section-title">🔒 Security</div>
      <div class="settings-row">
        <div class="settings-label">TOTP
          <div class="settings-label-sub">Two-factor authentication for sensitive actions</div>
        </div>
        <a href="/setup/totp" class="btn btn-outline btn-sm">Configure TOTP →</a>
      </div>
      <div class="settings-row">
        <div class="settings-label">Telegram bot
          <div class="settings-label-sub">Connected bot for notifications and approvals</div>
        </div>
        <span style="color:${s.telegram_connected ? 'var(--success)' : 'var(--muted)'};font-size:13px">
          ${s.telegram_connected ? '● Connected' : '○ Not connected'}
        </span>
      </div>
    </div>
  `;
}

function wireAppearance(root) {
  const darkToggle = root.querySelector('#dark-toggle');
  if (darkToggle) {
    darkToggle.addEventListener('change', () => {
      if (darkToggle.checked !== isDark()) toggleTheme();
    });
  }

  const densitySelect = root.querySelector('#density-select');
  if (densitySelect) {
    const cur = document.documentElement.classList.contains('density-compact') ? 'compact'
              : document.documentElement.classList.contains('density-spacious') ? 'spacious'
              : 'comfortable';
    densitySelect.value = cur;
    densitySelect.addEventListener('change', () => setDensity(densitySelect.value));
  }

  root.querySelectorAll('.color-picker').forEach(input => {
    input.addEventListener('input', () => {
      setCustomColor(input.dataset.token, input.value);
      // Update swatch background
      const swatch = input.closest('.color-swatch');
      if (swatch) swatch.style.background = input.value;
    });
  });

  root.querySelectorAll('.hours-open').forEach(cb => {
    cb.addEventListener('change', () => {
      const day = cb.dataset.day;
      const fromEl = root.querySelector(`#hours-${day}-from`);
      const toEl   = root.querySelector(`#hours-${day}-to`);
      if (fromEl) fromEl.disabled = !cb.checked;
      if (toEl)   toEl.disabled = !cb.checked;
    });
  });
}

function wireEscalation(root) {
  const list = root.querySelector('#escalation-list');
  const addBtn = root.querySelector('#add-escalation');
  if (!list || !addBtn) return;

  list.addEventListener('click', e => {
    const btn = e.target.closest('.remove-escalation');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx, 10);
    _escalations.splice(idx, 1);
    list.innerHTML = _escalations.map((c, i) => `
      <div class="escalation-item" data-idx="${i}">
        <span>${esc(c.name || '')} — ${esc(c.contact || '')}</span>
        <button class="btn btn-ghost btn-sm remove-escalation" data-idx="${i}">✕</button>
      </div>
    `).join('');
  });

  addBtn.addEventListener('click', () => {
    const name    = root.querySelector('#esc-name')?.value.trim();
    const contact = root.querySelector('#esc-contact')?.value.trim();
    if (!name || !contact) return;
    _escalations.push({ name, contact });
    root.querySelector('#esc-name').value = '';
    root.querySelector('#esc-contact').value = '';
    list.innerHTML = _escalations.map((c, i) => `
      <div class="escalation-item" data-idx="${i}">
        <span>${esc(c.name || '')} — ${esc(c.contact || '')}</span>
        <button class="btn btn-ghost btn-sm remove-escalation" data-idx="${i}">✕</button>
      </div>
    `).join('');
  });
}

async function saveAll(root) {
  const get = (id) => root.querySelector(id);

  // Business hours
  const hours = {};
  DAYS.forEach(d => {
    const openEl = root.querySelector(`.hours-open[data-day="${d}"]`);
    const fromEl = root.querySelector(`#hours-${d}-from`);
    const toEl   = root.querySelector(`#hours-${d}-to`);
    hours[d] = {
      open: openEl ? openEl.checked : false,
      from: fromEl ? fromEl.value : '09:00',
      to:   toEl   ? toEl.value   : '17:00',
    };
  });

  const payload = {
    business_name:        get('#biz-name')?.value.trim()  || _settings.business_name,
    phone:                get('#biz-phone')?.value.trim() || _settings.phone,
    tone:                 get('#agent-tone')?.value || _settings.tone,
    signature:            get('#agent-signature')?.value.trim() || '',
    autopilot:            get('#autopilot-toggle')?.checked ?? _settings.autopilot,
    hours,
    escalation_contacts:  _escalations,
  };

  try {
    await saveSettings(payload);
    _settings = { ..._settings, ...payload };
    // Update brand-tenant label in topbar
    const brandEl = document.getElementById('brand-tenant');
    if (brandEl && payload.business_name) brandEl.textContent = payload.business_name;
    // Flash save button
    const saveBtn = root.querySelector('#settings-save');
    if (saveBtn) { saveBtn.textContent = '✓ Saved'; setTimeout(() => { saveBtn.textContent = 'Save changes'; }, 2000); }
  } catch (e) {
    alert('Save failed: ' + e.message);
  }
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function rgbToHex(rgb) {
  if (!rgb) return '#000000';
  if (rgb.startsWith('#')) return rgb;
  const m = rgb.match(/\d+/g);
  if (!m || m.length < 3) return '#000000';
  return '#' + m.slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
}
