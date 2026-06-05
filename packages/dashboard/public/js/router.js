// router.js — hash-based SPA router with per-route favicon (Odysseus pattern 5)

import { mountHome, unmountHome } from './panels/home.js';
import { mountInbox, unmountInbox } from './panels/inbox.js';
import { mountShadowQueue, unmountShadowQueue } from './panels/shadow-queue.js';
import { mountSettings } from './panels/settings.js';

function stubPanel(label, icon, desc) {
  return {
    mount(root) {
      root.innerHTML = `
        <div class="stub-pane">
          <div class="stub-icon">${icon}</div>
          <div class="stub-label">${label}</div>
          <div class="stub-sub">${desc}</div>
          <span class="stub-tag">coming soon</span>
        </div>
      `;
    },
    unmount() {},
  };
}

export const ROUTES = {
  home: {
    label: 'Home', icon: '⌂', real: true, faviconShape: 'home',
    mount: mountHome, unmount: unmountHome,
  },
  inbox: {
    label: 'Inbox', icon: '✉', real: true, faviconShape: 'inbox',
    mount: mountInbox, unmount: unmountInbox,
  },
  'shadow-queue': {
    label: 'Queue', icon: '⟳', real: true, faviconShape: 'queue',
    mount: mountShadowQueue, unmount: unmountShadowQueue,
  },
  customers: {
    label: 'Customers', icon: '👥', real: false, faviconShape: 'circle',
    ...stubPanel('Customers', '👥', 'Full CRM — leads, history, lifecycle.'),
  },
  quotes: {
    label: 'Quotes', icon: '📋', real: false, faviconShape: 'square',
    ...stubPanel('Quotes', '📋', 'Draft, send, and track service quotes.'),
  },
  money: {
    label: 'Money', icon: '💵', real: false, faviconShape: 'diamond',
    ...stubPanel('Money', '💵', 'Revenue, invoices, and reconciliation.'),
  },
  agents: {
    label: 'Agents', icon: '🤖', real: false, faviconShape: 'hexagon',
    ...stubPanel('Agents', '🤖', 'Configure and monitor your AI agents.'),
  },
  procedures: {
    label: 'Procedures', icon: '📐', real: false, faviconShape: 'triangle',
    ...stubPanel('Procedures', '📐', 'YAML procedure library — view, edit, test.'),
  },
  connectors: {
    label: 'Connectors', icon: '🔌', real: false, faviconShape: 'cross',
    ...stubPanel('Connectors', '🔌', 'FB Messenger, SMS, Square, and more.'),
  },
  settings: {
    label: 'Settings', icon: '⚙', real: true, faviconShape: 'gear',
    mount: mountSettings, unmount() {},
  },
};

let _active = null;
let _root = null;
let _onChange = null;

function getHash() {
  const h = location.hash.replace(/^#\/?/, '');
  return h || 'home';
}

function setFavicon(shape, accent) {
  const shapes = {
    home:    `<path d='M16 4 L28 14 V28 H20 V20 H12 V28 H4 V14 Z' fill='none' stroke='${accent}' stroke-width='2.2' stroke-linejoin='round'/>`,
    inbox:   `<rect x='4' y='8' width='24' height='18' rx='2' fill='none' stroke='${accent}' stroke-width='2'/><polyline points='4,8 16,19 28,8' fill='none' stroke='${accent}' stroke-width='2'/>`,
    queue:   `<circle cx='16' cy='16' r='11' fill='none' stroke='${accent}' stroke-width='2'/><polyline points='16,9 16,16 21,16' fill='none' stroke='${accent}' stroke-width='2' stroke-linecap='round'/>`,
    gear:    `<circle cx='16' cy='16' r='4' fill='none' stroke='${accent}' stroke-width='2'/><path d='M16 4v3M16 25v3M4 16h3M25 16h3M7.5 7.5l2.1 2.1M22.4 22.4l2.1 2.1M7.5 24.5l2.1-2.1M22.4 9.6l2.1-2.1' stroke='${accent}' stroke-width='2' stroke-linecap='round'/>`,
    circle:  `<circle cx='16' cy='16' r='11' fill='none' stroke='${accent}' stroke-width='2'/>`,
    square:  `<rect x='5' y='5' width='22' height='22' rx='3' fill='none' stroke='${accent}' stroke-width='2'/>`,
    diamond: `<path d='M16 4 L28 16 L16 28 L4 16 Z' fill='none' stroke='${accent}' stroke-width='2'/>`,
    hexagon: `<path d='M16 4 L26 10 L26 22 L16 28 L6 22 L6 10 Z' fill='none' stroke='${accent}' stroke-width='2'/>`,
    triangle:`<path d='M16 5 L28 26 L4 26 Z' fill='none' stroke='${accent}' stroke-width='2'/>`,
    cross:   `<line x1='16' y1='4' x2='16' y2='28' stroke='${accent}' stroke-width='2.5' stroke-linecap='round'/><line x1='4' y1='16' x2='28' y2='16' stroke='${accent}' stroke-width='2.5' stroke-linecap='round'/>`,
  };
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--penelope-loom').trim() || '#1a1e14';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='5' fill='${bg}'/>${shapes[shape] || shapes.circle}</svg>`;
  let link = document.querySelector("link[rel='icon'][data-penelope]");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon'; link.type = 'image/svg+xml';
    link.setAttribute('data-penelope', '1');
    document.head.appendChild(link);
  }
  link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function activate(id) {
  const route = ROUTES[id] || ROUTES.home;
  const prevId = _active;

  if (prevId && prevId !== id && ROUTES[prevId] && ROUTES[prevId].unmount) {
    try { ROUTES[prevId].unmount(_root); } catch (_) {}
  }

  _active = id;
  if (_root) {
    _root.innerHTML = '';
    route.mount(_root);
  }

  const accent = getComputedStyle(document.documentElement).getPropertyValue('--penelope-shuttle').trim() || '#b87333';
  setFavicon(route.faviconShape, accent);

  document.title = `${route.label} — Penelope`;

  if (_onChange) _onChange(id);
}

function onHashChange() {
  activate(getHash());
}

export function initRouter(root, onChange) {
  _root = root;
  _onChange = onChange;
  window.addEventListener('hashchange', onHashChange);
  activate(getHash());
}

export function navigate(id) {
  location.hash = '/' + id;
}

export function currentRoute() {
  return _active || getHash();
}

export function listRoutes() {
  return Object.entries(ROUTES).map(([id, r]) => ({ id, label: r.label, icon: r.icon, real: r.real }));
}
