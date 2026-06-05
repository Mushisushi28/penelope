// theme.js — Penelope dashboard theme engine (Odysseus pattern)

const STORE_KEY = 'penelope-theme';

const DARK_DEFAULTS = {
  '--penelope-loom':    '#1a1e14',
  '--penelope-thread':  '#dde3d0',
  '--penelope-shuttle': '#b87333',
  '--penelope-warp':    '#2e3424',
  '--penelope-weft':    '#212618',
};

const LIGHT_DEFAULTS = {
  '--penelope-loom':    '#f0ece2',
  '--penelope-thread':  '#1e2116',
  '--penelope-shuttle': '#9b5f20',
  '--penelope-warp':    '#d4cebb',
  '--penelope-weft':    '#e8e2d4',
};

export function currentTheme() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch (_) { return {}; }
}

export function isDark() {
  const t = currentTheme();
  return t.dark !== false; // default dark
}

export function setTheme(dark, extras = {}) {
  const base = dark ? DARK_DEFAULTS : LIGHT_DEFAULTS;
  const merged = { ...base, ...(extras.colors || {}) };
  const t = { dark, colors: merged, density: extras.density || 'comfortable' };
  try { localStorage.setItem(STORE_KEY, JSON.stringify(t)); } catch (_) {}
  applyTheme(t);
}

export function toggleTheme() {
  const t = currentTheme();
  setTheme(!isDark(), { colors: t.colors, density: t.density });
}

export function setCustomColor(token, value) {
  const t = currentTheme();
  const colors = { ...(isDark() ? DARK_DEFAULTS : LIGHT_DEFAULTS), ...(t.colors || {}) };
  colors[token] = value;
  setTheme(isDark(), { colors, density: t.density });
}

export function setDensity(density) {
  const t = currentTheme();
  document.documentElement.classList.remove('density-compact', 'density-spacious');
  if (density !== 'comfortable') document.documentElement.classList.add('density-' + density);
  setTheme(isDark(), { colors: t.colors, density });
}

export function resetTheme() {
  try { localStorage.removeItem(STORE_KEY); } catch (_) {}
  applyTheme({ dark: true, colors: DARK_DEFAULTS, density: 'comfortable' });
}

export function bootTheme() {
  const t = currentTheme();
  applyTheme({
    dark: t.dark !== false,
    colors: t.colors || (t.dark === false ? LIGHT_DEFAULTS : DARK_DEFAULTS),
    density: t.density || 'comfortable',
  });
}

function applyTheme(t) {
  const root = document.documentElement;
  const s = root.style;

  root.setAttribute('data-theme', t.dark ? 'dark' : 'light');

  const palette = t.colors || (t.dark ? DARK_DEFAULTS : LIGHT_DEFAULTS);
  for (const [k, v] of Object.entries(palette)) {
    if (k.startsWith('--')) s.setProperty(k, v);
  }

  root.classList.remove('density-compact', 'density-spacious');
  if (t.density && t.density !== 'comfortable') {
    root.classList.add('density-' + t.density);
  }

  // Update favicon per Odysseus pattern 5
  updateFavicon(palette['--penelope-shuttle'] || '#b87333', palette['--penelope-loom'] || '#1a1e14');

  // Sync theme-color meta
  const mtc = document.querySelector('meta[name="theme-color"]');
  if (mtc) mtc.setAttribute('content', palette['--penelope-loom'] || '#1a1e14');
}

function updateFavicon(accent, bg) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>
    <rect width='32' height='32' rx='6' fill='${bg}'/>
    <line x1='6' y1='10' x2='26' y2='10' stroke='${accent}' stroke-width='2.5' stroke-linecap='round'/>
    <line x1='6' y1='16' x2='20' y2='16' stroke='${accent}' stroke-width='2.5' stroke-linecap='round'/>
    <line x1='6' y1='22' x2='24' y2='22' stroke='${accent}' stroke-width='2.5' stroke-linecap='round'/>
  </svg>`;
  let link = document.querySelector("link[rel='icon'][data-penelope]");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.setAttribute('data-penelope', '1');
    document.head.appendChild(link);
  }
  link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
}
