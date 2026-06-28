const CACHE_VERSION = 'interactive-irrigation-map-v14';
const APP_SHELL = [
  './',
  './index.html',
  './admin.html',
  './manifest.webmanifest',
  './assets/icon.svg',
  './data/definitions.json',
  './src/map-extent.js',
  './src/field-sync.js',
  './src/app.js',
  './src/admin.js',
  './src/style.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isMapTile(url) {
  return url.hostname.includes('tile.openstreetmap.org') || url.hostname.includes('arcgisonline.com') || url.hostname.includes('basemap.nationalmap.gov');
}

function isDefinitionsFile(url) {
  return url.pathname.endsWith('/data/definitions.json');
}

function isAdminScript(url) {
  return url.pathname.endsWith('/src/admin.js');
}

function patchAdminScript(text) {
  return text
    .replace(
      "L.polygon(zone.boundary.map((p) => [p.lat, p.lng]), { color: coverage ? '#facc15' : '#38bdf8',",
      "L.polygon(zone.boundary.map((p) => [p.lat, p.lng]), { interactive: !activeTool, bubblingMouseEvents: true, color: coverage ? '#facc15' : '#38bdf8',"
    )
    .replace(
      "L.polyline(trail.points.map((p) => [p.lat, p.lng]), { color,",
      "L.polyline(trail.points.map((p) => [p.lat, p.lng]), { interactive: !activeTool, bubblingMouseEvents: true, color,"
    )
    .replace(
      "L.circleMarker([marker.lat, marker.lng], { radius:",
      "L.circleMarker([marker.lat, marker.lng], { interactive: !activeTool, bubblingMouseEvents: true, radius:"
    );
}

async function patchedAdminScript(request) {
  const cache = await caches.open(CACHE_VERSION);
  let response;
  try {
    response = await fetch(request);
    cache.put(request, response.clone()).catch(() => {});
  } catch {
    response = await cache.match(request);
  }
  if (!response) return new Response('', { status: 404 });
  const text = patchAdminScript(await response.text());
  return new Response(text, { headers: { 'Content-Type': 'application/javascript; charset=utf-8' } });
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  const cache = await caches.open(CACHE_VERSION);
  cache.put(request, response.clone()).catch(() => {});
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
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
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch {
    return cache.match(request) || cache.match('./index.html');
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
  if (isAdminScript(url)) {
    event.respondWith(patchedAdminScript(request));
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
