const CACHE_NAME = 'travel-finance-record-v0-1-0';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/api.js',
  './js/router.js',
  './js/state.js',
  './js/storage.js',
  './js/sync.js',
  './js/screens/dashboard.js',
  './js/screens/people.js',
  './js/screens/trips.js',
  './js/screens/documents.js',
  './js/screens/finance.js',
  './js/screens/settings.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});