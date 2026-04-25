const CACHE_NAME = 'moving-boxes-v4';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './vendor/qrcode.min.js',
  './vendor/pako.min.js',
  './vendor/jsqr.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        CORE_ASSETS.map(url => cache.add(url).catch(e => console.log('Skip cache:', url)))
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        fetch(req).then(fresh => {
          if (fresh && fresh.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(req, fresh.clone()));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(req).then(fresh => {
        if (fresh && fresh.status === 200 && req.url.startsWith(self.location.origin)) {
          const copy = fresh.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
        }
        return fresh;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
