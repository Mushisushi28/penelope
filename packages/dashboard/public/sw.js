// sw.js — Penelope Dashboard service worker
// Strategy: cache-first for shell assets, network-first for /api/ routes

const CACHE = 'penelope-dash-v1';
const SHELL = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/api.js',
  '/js/theme.js',
  '/js/router.js',
  '/js/panels/home.js',
  '/js/panels/inbox.js',
  '/js/panels/shadow-queue.js',
  '/js/panels/settings.js',
  '/manifest.webmanifest',
  '/icons/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API: network-first, fall back to 503 stub
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ error: 'offline', ok: false }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        })
      )
    );
    return;
  }

  // Shell: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
