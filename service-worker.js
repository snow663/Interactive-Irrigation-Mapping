const CACHE_NAME = 'interactive-irrigation-map-current';
const APP_SHELL = [
  './',
  './index.html',
  './login.html',
  './ride-map.html',
  './admin-v2.html',
  './manifest.webmanifest',
  './assets/icon.svg',
  './data/definitions.json',
  './src/register-sw.js',
  './src/user-session.js',
  './src/usgs-key.js',
  './src/current-ride-map.js',
  './src/admin-v2.js',
  './src/style.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => (key === CACHE_NAME ? null : caches.delete(key)))))
      .then(() => self.clients.claim())
  );
});

function isMapTile(url) {
  return url.hostname.includes('basemap.nationalmap.gov');
}

function isDefinitionsFile(url) {
  return url.pathname.endsWith('/data/definitions.json');
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, response.clone()).catch(() => {});
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      cache.put(request, response.clone()).catch(() => {});
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch {
    return cache.match(request) || cache.match('./ride-map.html') || cache.match('./index.html');
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isDefinitionsFile(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isMapTile(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
