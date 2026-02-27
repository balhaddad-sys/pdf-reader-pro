const CACHE_NAME = 'pdf-reader-pro-v40';
const ASSETS = [
  './',
  './manifest.json',
  './icons/icon-96.png',
  './lib/pdf.min.js',
  './lib/pdf.worker.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (request.destination === 'document' || request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match('./')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => new Response('', { status: 408, statusText: 'Offline' }));
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
