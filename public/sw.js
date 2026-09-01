// ─── M.A.I. Service Worker ──────────────────────────────────────────────
// Handles caching and offline support.

const SHELL_CACHE = 'mai-shell-v2';
const API_CACHE = 'mai-api-v2';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
];

const MAX_API_ENTRIES = 100;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isShell = SHELL_ASSETS.some((asset) => url.pathname === asset);

  if (isShell) {
    event.respondWith(cacheFirst(event.request));
  } else {
    event.respondWith(networkFirst(event.request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response(offlineFallback(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
      trimApiCache();
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function trimApiCache() {
  const cache = await caches.open(API_CACHE);
  const keys = await cache.keys();
  if (keys.length > MAX_API_ENTRIES) {
    const toDelete = keys.slice(0, keys.length - MAX_API_ENTRIES);
    await Promise.all(toDelete.map((key) => cache.delete(key)));
  }
}

function offlineFallback() {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M.A.I. - Offline</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#020817;color:#c8f0ff;font-family:system-ui;text-align:center;padding:1rem;}h1{color:#00d4ff;font-size:1.5rem;margin-bottom:.5rem;}p{opacity:.7;}</style></head><body><div><h1>M.A.I.</h1><p>You are offline. Messages will be sent when connection is restored.</p></div></body></html>';
}

self.addEventListener('push', (event) => {
  let data = { title: 'M.A.I.', body: 'New message' };
  if (event.data) {
    try { data = event.data.json(); } catch { data.body = event.data.text(); }
  }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    vibrate: [100, 50, 100],
    data: { url: '/' },
    actions: [{ action: 'open', title: 'Open M.A.I.' }],
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) { if ('focus' in client) return client.focus(); }
      return self.clients.openWindow('/');
    })
  );
});
