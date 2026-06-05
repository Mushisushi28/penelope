// serve.mjs — Penelope Dashboard HTTP server
// Env:
//   PENELOPE_DASHBOARD_PORT  (default 18900)
//   PENELOPE_TENANT_BUS      path to tenant SQLite bus db
//   PENELOPE_TENANT_SLUG     tenant label (default "owner")

import { createServer }  from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve }  from 'node:path';
import { fileURLToPath }  from 'node:url';
import { lookup }         from 'node:dns/promises';

const __dir   = dirname(fileURLToPath(import.meta.url));
const PUBLIC  = join(__dir, 'public');
const PORT    = parseInt(process.env.PENELOPE_DASHBOARD_PORT || '18900', 10);
const BUS_DB  = process.env.PENELOPE_TENANT_BUS || null;
const SLUG    = process.env.PENELOPE_TENANT_SLUG || 'owner';
const SETTINGS_FILE = join(__dir, 'tenant-settings.json');

// ── Tenant directory resolution ──────────────────────────────────────────────
// Procedures live at <repo-root>/tenants/<slug>/procedures/<id>.yaml
// __dir is packages/dashboard; repo root is two levels up.
const REPO_ROOT       = resolve(__dir, '..', '..');
const TENANTS_DIR     = join(REPO_ROOT, 'tenants');
const PROCEDURES_DIR  = join(TENANTS_DIR, SLUG, 'procedures');

function procedurePath(id) {
  // Guard against path traversal
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  return join(PROCEDURES_DIR, `${safeId}.yaml`);
}

// ── SQLite (optional) ───────────────────────────────────────────────────────
const require = createRequire(import.meta.url);
let db = null;
if (BUS_DB) {
  try {
    const Database = require('better-sqlite3');
    db = new Database(BUS_DB, { readonly: true });
    console.log(`[penelope-dash] bus db: ${BUS_DB}`);
  } catch (e) {
    console.warn(`[penelope-dash] could not open bus db: ${e.message}`);
  }
}

// ── Settings persistence ────────────────────────────────────────────────────
function loadSettingsFile() {
  if (existsSync(SETTINGS_FILE)) {
    try { return JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')); } catch (_) {}
  }
  return {
    business_name: SLUG,
    phone: '',
    tone: 'friendly',
    signature: '',
    autopilot: false,
    telegram_connected: false,
    hours: {
      mon: { open: true,  from: '09:00', to: '17:00' },
      tue: { open: true,  from: '09:00', to: '17:00' },
      wed: { open: true,  from: '09:00', to: '17:00' },
      thu: { open: true,  from: '09:00', to: '17:00' },
      fri: { open: true,  from: '09:00', to: '17:00' },
      sat: { open: false, from: '10:00', to: '15:00' },
      sun: { open: false, from: '10:00', to: '15:00' },
    },
    escalation_contacts: [],
  };
}

function saveSettingsFile(data) {
  writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ── Stub data (used when DB unavailable) ────────────────────────────────────
const STUB_QUEUE = {
  items: [
    {
      id: 'stub-1',
      customer_name: 'John Smith',
      channel: 'sms',
      draft_text: "Hi John! Thanks for reaching out about headlight restoration. We'd love to help — want to schedule a free estimate this week? We're open Mon–Fri 9–5.",
      status: 'pending',
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'stub-2',
      customer_name: 'Maria Garcia',
      channel: 'fb-messenger',
      draft_text: "Hey Maria! Great news — your headlights are ready for pickup. Total is $89. We're open until 5pm today.",
      status: 'approved',
      created_at: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: 'stub-3',
      customer_name: 'Tyler Brooks',
      channel: 'sms',
      draft_text: "Hi Tyler! Following up on your headlight restoration inquiry. Are you still interested in getting those done?",
      status: 'pending',
      created_at: new Date(Date.now() - 1800000).toISOString(),
    },
  ],
};

const STUB_INBOX = {
  threads: [
    {
      id: 'thread-1',
      customer_name: 'John Smith',
      channel: 'sms',
      last_message: "Are you available this Saturday?",
      unread: 2,
      last_at: new Date(Date.now() - 1200000).toISOString(),
    },
    {
      id: 'thread-2',
      customer_name: 'Maria Garcia',
      channel: 'fb-messenger',
      last_message: "Perfect, I'll pick them up at 4pm.",
      unread: 0,
      last_at: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: 'thread-3',
      customer_name: 'Tyler Brooks',
      channel: 'sms',
      last_message: "Yeah still interested. How much?",
      unread: 1,
      last_at: new Date(Date.now() - 3600000).toISOString(),
    },
  ],
};

const STUB_THREAD_MSGS = {
  'thread-1': [
    { direction: 'inbound',  text: "Hey, do you do headlight restoration?", ts: new Date(Date.now() - 86400000).toISOString() },
    { direction: 'outbound', text: "Yes! We do headlight restoration starting at $69. Want to schedule a free estimate?", ts: new Date(Date.now() - 82800000).toISOString() },
    { direction: 'inbound',  text: "Are you available this Saturday?", ts: new Date(Date.now() - 1200000).toISOString() },
  ],
  'thread-2': [
    { direction: 'inbound',  text: "Hi, I dropped off my car yesterday.", ts: new Date(Date.now() - 10800000).toISOString() },
    { direction: 'outbound', text: "Hey Maria! Great news — your headlights are ready for pickup. Total is $89.", ts: new Date(Date.now() - 9000000).toISOString() },
    { direction: 'inbound',  text: "Perfect, I'll pick them up at 4pm.", ts: new Date(Date.now() - 7200000).toISOString() },
  ],
  'thread-3': [
    { direction: 'inbound',  text: "Yeah still interested. How much?", ts: new Date(Date.now() - 3600000).toISOString() },
  ],
};

const STUB_BRIEF = {
  stats: {
    new_inquiries: null,
    jobs_booked:   null,
    queue_pending: STUB_QUEUE.items.filter(i => i.status === 'pending').length,
    unread:        null,
  },
  bullets: [
    'No bus database connected — configure PENELOPE_TENANT_BUS to read live data.',
    'Dashboard is running with stub demo data.',
    '2 messages pending approval in the shadow queue.',
    'Check the Queue panel to approve or decline drafted replies.',
  ],
};

// ── Shadow-queue mutation (in-memory for stubs) ──────────────────────────────
const _queueState = new Map(STUB_QUEUE.items.map(i => [i.id, { ...i }]));

function getQueue() {
  if (!db) return { items: Array.from(_queueState.values()) };
  try {
    const rows = db.prepare(
      `SELECT id, customer_name, channel, draft_text, status, created_at
       FROM shadow_queue ORDER BY created_at DESC LIMIT 100`
    ).all();
    return { items: rows };
  } catch (_) {
    return { items: Array.from(_queueState.values()) };
  }
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

function ext(p) {
  const i = p.lastIndexOf('.');
  return i > -1 ? p.slice(i) : '';
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function sendStatic(res, filePath) {
  try {
    const data = readFileSync(filePath);
    const mime = MIME[ext(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': mime, 'cache-control': 'no-cache' });
    res.end(data);
  } catch (_) {
    res.writeHead(404); res.end('Not found');
  }
}

function bodyJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) reject(new Error('Too large')); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// ── Route handlers ────────────────────────────────────────────────────────────
async function handleApi(req, res, url) {
  const path = url.pathname;
  const method = req.method.toUpperCase();

  // CORS
  res.setHeader('access-control-allow-origin', `http://localhost:${PORT}`);
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // GET /api/health
  if (path === '/api/health' && method === 'GET') {
    return sendJson(res, 200, { ok: true, bus: !!db, slug: SLUG, port: PORT });
  }

  // GET /api/brief/today
  if (path === '/api/brief/today' && method === 'GET') {
    if (db) {
      try {
        const rows = db.prepare(`SELECT key, value FROM kv WHERE key LIKE 'brief.%' ORDER BY key DESC LIMIT 20`).all();
        const bullets = rows.map(r => r.value);
        return sendJson(res, 200, { stats: {}, bullets });
      } catch (_) {}
    }
    return sendJson(res, 200, STUB_BRIEF);
  }

  // GET /api/shadow-queue
  if (path === '/api/shadow-queue' && method === 'GET') {
    return sendJson(res, 200, getQueue());
  }

  // POST /api/shadow-queue/:id/approve|decline|edit
  const queueMatch = path.match(/^\/api\/shadow-queue\/([^/]+)\/(approve|decline|edit)$/);
  if (queueMatch && method === 'POST') {
    const [, id, action] = queueMatch;
    if (db) {
      try {
        if (action === 'approve') db.prepare(`UPDATE shadow_queue SET status='approved' WHERE id=?`).run(id);
        else if (action === 'decline') db.prepare(`UPDATE shadow_queue SET status='declined' WHERE id=?`).run(id);
        else if (action === 'edit') {
          const body = await bodyJson(req);
          db.prepare(`UPDATE shadow_queue SET draft_text=?, status='edited' WHERE id=?`).run(body.text, id);
        }
        return sendJson(res, 200, { ok: true });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    // Stub mutation
    const item = _queueState.get(id);
    if (!item) return sendJson(res, 404, { error: 'not found' });
    if (action === 'approve')       item.status = 'approved';
    else if (action === 'decline')  item.status = 'declined';
    else if (action === 'edit') {
      const body = await bodyJson(req);
      item.draft_text = body.text;
      item.status = 'edited';
    }
    return sendJson(res, 200, { ok: true });
  }

  // GET /api/inbox[?channel=...]
  if (path === '/api/inbox' && method === 'GET') {
    const channel = url.searchParams.get('channel');
    if (db) {
      try {
        let q = `SELECT id, customer_name, channel, last_message, unread, last_at FROM inbox_threads`;
        const args = [];
        if (channel) { q += ` WHERE channel=?`; args.push(channel); }
        q += ` ORDER BY last_at DESC LIMIT 50`;
        const threads = db.prepare(q).all(...args);
        return sendJson(res, 200, { threads });
      } catch (_) {}
    }
    const threads = channel
      ? STUB_INBOX.threads.filter(t => t.channel === channel)
      : STUB_INBOX.threads;
    return sendJson(res, 200, { threads });
  }

  // GET /api/inbox/:id/thread
  const threadMatch = path.match(/^\/api\/inbox\/([^/]+)\/thread$/);
  if (threadMatch && method === 'GET') {
    const id = threadMatch[1];
    if (db) {
      try {
        const msgs = db.prepare(
          `SELECT direction, text, ts FROM inbox_messages WHERE thread_id=? ORDER BY ts ASC`
        ).all(id);
        return sendJson(res, 200, { messages: msgs });
      } catch (_) {}
    }
    const msgs = STUB_THREAD_MSGS[id] || [];
    return sendJson(res, 200, { messages: msgs });
  }

  // GET /api/settings
  if (path === '/api/settings' && method === 'GET') {
    return sendJson(res, 200, loadSettingsFile());
  }

  // POST /api/settings
  if (path === '/api/settings' && method === 'POST') {
    try {
      const body = await bodyJson(req);
      const current = loadSettingsFile();
      const merged = { ...current, ...body };
      saveSettingsFile(merged);
      return sendJson(res, 200, { ok: true });
    } catch (e) { return sendJson(res, 400, { error: e.message }); }
  }

  // POST /api/action
  if (path === '/api/action' && method === 'POST') {
    try {
      const body = await bodyJson(req);
      console.log(`[penelope-dash] bus action: ${body.action}`);
      return sendJson(res, 200, { ok: true, queued: body.action });
    } catch (e) { return sendJson(res, 400, { error: e.message }); }
  }

  // GET /api/procedures/:id  — read procedure YAML
  const procedureGetMatch = path.match(/^\/api\/procedures\/([^/]+)$/);
  if (procedureGetMatch && method === 'GET') {
    const id = procedureGetMatch[1];
    const filePath = procedurePath(id);
    if (!existsSync(filePath)) {
      return sendJson(res, 404, { error: `Procedure '${id}' not found`, path: filePath });
    }
    try {
      const yaml = readFileSync(filePath, 'utf8');
      return sendJson(res, 200, { id, yaml });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // PUT /api/procedures/:id  — write procedure YAML
  const procedurePutMatch = path.match(/^\/api\/procedures\/([^/]+)$/);
  if (procedurePutMatch && method === 'PUT') {
    const id = procedurePutMatch[1];
    const filePath = procedurePath(id);
    try {
      const body = await bodyJson(req);
      if (typeof body.yaml !== 'string') {
        return sendJson(res, 400, { error: '`yaml` string field required' });
      }
      // Ensure directory exists
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, body.yaml, 'utf8');
      console.log(`[penelope-dash] procedure saved: ${id}`);
      return sendJson(res, 200, { ok: true, id });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  return sendJson(res, 404, { error: 'Not found' });
}

// ── Main server ───────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (path.startsWith('/api/')) {
    return handleApi(req, res, url).catch(e => {
      console.error('[penelope-dash] api error:', e);
      sendJson(res, 500, { error: e.message });
    });
  }

  // Static files
  const candidates = [
    join(PUBLIC, path === '/' ? 'index.html' : path),
    join(PUBLIC, path, 'index.html'),
  ];

  for (const f of candidates) {
    if (existsSync(f)) return sendStatic(res, f);
  }

  // SPA fallback
  sendStatic(res, join(PUBLIC, 'index.html'));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[penelope-dash] → http://localhost:${PORT}`);
  console.log(`[penelope-dash] tenant: ${SLUG}`);
  if (db)  console.log(`[penelope-dash] bus: connected`);
  else     console.log(`[penelope-dash] bus: (not configured — stubs active)\n[penelope-dash] set PENELOPE_TENANT_BUS=<path> to connect a live bus db`);
});
