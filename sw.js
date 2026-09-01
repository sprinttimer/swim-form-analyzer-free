const CACHE_NAME = 'swim-form-analyzer-free-v1.5.0';
const ROOT_URL = new URL('./', self.registration.scope).href;
const INDEX_URL = new URL('./index.html', self.registration.scope).href;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('swim-form-analyzer-free-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Do not intercept MediaPipe/CDN/model traffic. The existing app intentionally
  // loads these from their original providers.
  if (url.origin !== self.location.origin) return;

  const isAppDocument = request.mode === 'navigate' || /\/index\.html$/.test(url.pathname);
  if (isAppDocument) {
    event.respondWith(
      fetch(request, {cache:'no-store'})
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(INDEX_URL, copy)).catch(()=>{});
          }
          return response;
        })
        .catch(() => caches.match(INDEX_URL).then(cached => cached || caches.match(ROOT_URL)))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  );
});
