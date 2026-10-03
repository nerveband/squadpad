// SquadPad Service Worker - caches the app shell for offline/PWA support.
// Network-first for everything on this origin so fixes reach returning players
// immediately; the cache is only a fallback when offline.
const CACHE_NAME = 'squadpad-v2';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/ui.js',
  '/js/controller-ui.js',
  '/js/controller.js',
  '/js/connection.js',
  '/js/protocol.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)));
        }
        return response;
      })
      .catch(() => caches.match(request).then(cached =>
        cached || (request.mode === 'navigate' ? caches.match('/index.html') : Response.error())
      ))
  );
});
