// app.js — Penelope dashboard boot module

import { bootTheme, toggleTheme } from './theme.js';
import { initRouter, navigate, listRoutes, currentRoute } from './router.js';
import { health, getSettings } from './api.js';

function buildNav(navRoot) {
  const active = currentRoute();
  navRoot.innerHTML = listRoutes().map(r => `
    <button class="nav-row ${r.id === active ? 'active' : ''} ${!r.real ? 'stub' : ''}"
            data-view="${r.id}">
      <span class="nav-icon">${r.icon}</span>
      <span class="nav-label">${r.label}</span>
      ${!r.real ? '<span class="nav-stub-tag">soon</span>' : ''}
    </button>
  `).join('');
  navRoot.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });
}

async function loadTenantLabel() {
  try {
    const s = await getSettings();
    const name = s.business_name || s.tenant_slug || 'Penelope';
    const el = document.getElementById('brand-tenant');
    if (el) el.textContent = name;
  } catch (_) {}
}

function boot() {
  bootTheme();

  const navRoot     = document.getElementById('nav-list');
  const viewRoot    = document.getElementById('view-root');
  const themeToggle = document.getElementById('theme-toggle');
  const healthDot   = document.getElementById('health-dot');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebar     = document.getElementById('sidebar');

  // Router initialises and mounts first panel
  initRouter(viewRoot, () => buildNav(navRoot));
  buildNav(navRoot);

  // Theme toggle (quick click = dark/light)
  themeToggle.addEventListener('click', () => {
    toggleTheme();
    buildNav(navRoot); // re-render nav after theme change (active state unchanged)
  });

  // Mobile sidebar toggle
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
    // Close on nav click (mobile)
    navRoot.addEventListener('click', () => {
      sidebar.classList.remove('open');
    });
  }

  // Health pinger
  const ping = async () => {
    try {
      const h = await health();
      healthDot.classList.remove('bad', 'warn');
      healthDot.classList.add(h.bus ? 'ok' : 'warn');
      healthDot.title = h.bus ? 'Server ok · bus connected' : 'Server ok · stubs active';
    } catch (_) {
      healthDot.classList.remove('ok', 'warn');
      healthDot.classList.add('bad');
      healthDot.title = 'Server unreachable';
    }
  };
  ping();
  setInterval(ping, 8000);

  // Load tenant label
  loadTenantLabel();

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
