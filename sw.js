const CACHE_NAME = 'vora-cache-v3';
const APP_SHELL = ['/', '/home.html', '/index.html', '/manifest.json', '/favicon-192.png', '/favicon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const shouldPreferNetwork =
    event.request.mode === 'navigate' ||
    event.request.destination === 'script' ||
    event.request.destination === 'style';

  if (shouldPreferNetwork) {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.url.startsWith(self.location.origin)) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return networkResponse;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200 && event.request.url.startsWith(self.location.origin)) {
        const copy = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return networkResponse;
    }).catch(() => cached))
  );
});
