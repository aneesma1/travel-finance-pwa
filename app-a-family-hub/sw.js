// v4.8.0 — 2026-04-04
// ...
const CACHE_NAME = 'hub-cache-v4.8.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/auth-config.js',
  './js/router.js',
  './js/calendar.js',
  './js/expiry-checker.js',
  './js/relation-engine.js',
  './js/screens/dashboard.js',
  './js/screens/travel-log.js',
  './js/screens/add-trip.js',
  './js/screens/documents.js',
  './js/screens/add-document.js',
  './js/screens/people.js',
  './js/screens/person-profile.js',
  './js/screens/family-defaults.js',
  './js/screens/settings.js',
  '../shared/utils.js',
  '../shared/auth.js',
  '../shared/drive.js',
  '../shared/db.js',
  '../shared/smart-input.js',
  '../shared/multi-smart-input.js',
  '../shared/pill-select.js',
  '../shared/import-tool.js',
  '../shared/photo-picker.js',
  '../shared/sync-manager.js',
  './js/screens/travel-export.js',
  '../shared/pwa-install.js',
  '../shared/sync-queue.js',
  'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,400&family=DM+Mono:wght@400;500&display=swap',
];

// ── Install: cache static assets ──────────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache what we can -- ignore failures for external resources
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(() => { }))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: Stale-While-Revalidate for app assets ─────────────────────────────
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip non-GET and cross-origin Google API calls
  if (e.request.method !== 'GET') return;
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('accounts.google.com')) return;

  // Stale-While-Revalidate Strategy
  e.respondWith(
    caches.match(e.request).then(cached => {
      // 1. Fire off the network request in background
      const networkFetch = fetch(e.request).then(response => {
        // SUCCESS: Update cache if it's a valid local asset (not 403/404)
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(err => {
        // FAIL: Silent ignore for background revalidation
        return null;
      });

      // 2. Return cached version immediately (0-second load)
      if (cached) return cached;
      
      // 3. If not in cache, wait for the network (first-time load)
      return networkFetch.then(resp => {
        if (resp) return resp;
        // Offline fallback for navigation
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        return new Response('Network unavailable', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

// ── Periodic background sync ──────────────────────────────────────────────────
self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'drive-mirror-sync') {
    e.waitUntil(triggerMirrorSync());
  }
});

async function triggerMirrorSync() {
  // Notify the active client to perform a mirror write
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => {
    client.postMessage({ type: 'MIRROR_SYNC_REQUESTED' });
  });
}

// ── Message handler (from app) ────────────────────────────────────────────────
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
