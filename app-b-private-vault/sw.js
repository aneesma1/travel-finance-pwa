// v3.2.2 — 2026-03-21 — 2026-03-21 — 2026-03-21
// ─── app-b-private-vault/sw.js ───────────────────────────────────────────────
// Service Worker for Private Vault PWA

'use strict';

const CACHE_NAME    = 'private-vault-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/auth-config.js',
  './js/router.js',
  './js/pin.js',
  './js/screens/pin-lock.js',
  './js/screens/dashboard.js',
  './js/screens/add-transaction.js',
  './js/screens/transactions.js',
  './js/screens/analytics.js',
  './js/screens/settings.js',
  '../shared/utils.js',
  '../shared/auth.js',
  '../shared/drive.js',
  '../shared/db.js',
  '../shared/smart-input.js',
  '../shared/pill-select.js',
  '../shared/import-tool.js',
  '../shared/pwa-install.js',
  '../shared/sync-queue.js',
  'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,400&family=DM+Mono:wght@400;500&display=swap',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('accounts.google.com')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        if (e.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});

self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'drive-mirror-sync') {
    e.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(c => c.postMessage({ type: 'MIRROR_SYNC_REQUESTED' }));
      })
    );
  }
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
