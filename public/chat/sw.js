// ─── M.A.I. Chat Service Worker ─────────────────────────────────────────────
// Handles caching, offline support, and push notification stubs.

const SHELL_CACHE = 'mai-chat-shell-v1';
const API_CACHE = 'mai-chat-api-v1';
const SHELL_ASSETS = [
  '/chat/',
  '/chat/index.html',
  '/chat/styles.css',
  '/chat/app.js',
  '/chat/manifest.json',
];

const MAX_API_ENTRIES = 100;
const MAX_API_AGE = 5 * 60 * 1000; // 5 minutes

// ─── Install: pre-cache shell assets ────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.addAll(SHELL_ASSETS);
    })
  );
  self.skipWaiting();
});

// ─── Activate: clean up old caches ──────────────────────────────────────────
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

// ─── Fetch: network-first for API, cache-first for shell ───────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isShell = SHELL_ASSETS.some(
    (asset) => url.pathname === asset || url.pathname === '/chat/index.html'
  );

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
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M.A.I. Chat - Offline</title>
<style>
  body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;
    background:#0a0f1a;color:#e0e8f0;font-family:system-ui;text-align:center;padding:1rem;}
  h1{color:#00d4ff;font-size:1.5rem;margin-bottom:.5rem;}
  p{opacity:.7;}
</style></head>
<body><div><h1>M.A.I. Chat</h1><p>You are offline. Messages will be sent when connection is restored.</p></div></body>
</html>`;
}

// ─── Push Notification Support (stub) ───────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'M.A.I.', body: 'New message' };
  if (event.data) {
    try { data = event.data.json(); } catch { data.body = event.data.text(); }
  }
  const options = {
    body: data.body,
    icon: '/chat/icon-192.png',
    badge: '/chat/icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: '/chat/' },
    actions: [{ action: 'open', title: 'Open Chat' }],
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes('/chat/') && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow('/chat/');
    })
  );
});
