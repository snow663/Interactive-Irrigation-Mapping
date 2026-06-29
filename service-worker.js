const CACHE_VERSION = 'interactive-irrigation-map-v19';
const APP_SHELL = [
  './',
  './index.html',
  './admin.html',
  './admin-v2.html',
  './manifest.webmanifest',
  './assets/icon.svg',
  './data/definitions.json',
  './src/map-extent.js',
  './src/field-sync.js',
  './src/admin-backup.js',
  './src/admin-v2.js',
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

function isAdminV2Script(url) {
  return url.pathname.endsWith('/src/admin-v2.js');
}

function isFieldScript(url) {
  return url.pathname.endsWith('/src/app.js');
}

function patchCoverageDefaults(text) {
  return text
    .replaceAll('44.865000', '44.768000')
    .replaceAll('44.525000', '44.623000')
    .replaceAll('about ten miles north and south of the US 212 corridor', 'about five miles north and south of the US 212 corridor');
}

function patchAdminScript(text) {
  const patched = patchCoverageDefaults(text)
    .replace('}\\nfunction deleteMarker', '}\nfunction deleteMarker')
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
  return `${patched}\nimport './admin-backup.js';\n`;
}

function patchAdminV2Script(text) {
  return patchCoverageDefaults(text)
    .replace(
      "      featureType,\n      overlays: { mowing:",
      "      featureType,\n      color: String(trail.color || ''),\n      ditchRider: String(trail.ditchRider || ''),\n      overlays: { mowing:"
    )
    .replace(
      "function trailColor(trail, selected) {\n  if (selected) return '#facc15';",
      "function trailColor(trail, selected) {\n  if (selected) return '#facc15';\n  if (trail.color) return trail.color;"
    );
}

function patchFieldScript(text) {
  return patchCoverageDefaults(text)
    .replace(
      "return trails.map((t,i) => ({ id: String(t.id || `trail-${Date.now()}-${i}`), name: String(t.name || `Trail ${i + 1}`), zoneId: validZone.has(t.zoneId) ? t.zoneId : fallback, overlays: normalizeTrailOverlays(t), flags: normalizeTrailFlags(t), estimatedMinutes: Number.isFinite(Number(t.estimatedMinutes)) ? Number(t.estimatedMinutes) : null, notes: String(t.notes || ''), points: normalizeTrack(t.points || []) })).filter((t) => t.points.length >= 2);",
      "return trails.map((t,i) => ({ id: String(t.id || `trail-${Date.now()}-${i}`), name: String(t.name || `Trail ${i + 1}`), zoneId: validZone.has(t.zoneId) ? t.zoneId : fallback, featureType: String(t.featureType || t.kind || ''), color: String(t.color || ''), ditchRider: String(t.ditchRider || ''), overlays: normalizeTrailOverlays(t), flags: normalizeTrailFlags(t), estimatedMinutes: Number.isFinite(Number(t.estimatedMinutes)) ? Number(t.estimatedMinutes) : null, notes: String(t.notes || ''), points: normalizeTrack(t.points || []) })).filter((t) => t.points.length >= 2);"
    )
    .replace(
      "for (const trail of state.drawnTrails) {\n    const both = trail.overlays.mowing && trail.overlays.spraying;",
      "for (const trail of state.drawnTrails) {\n    if (trail.featureType === 'ride-track') addTrailLine(trail, flagLayer, { weight: 6, opacity: 0.95, color: trail.color || '#06b6d4' });\n    const both = trail.overlays.mowing && trail.overlays.spraying;"
    );
}

async function transformedScript(request, transformer) {
  const cache = await caches.open(CACHE_VERSION);
  let response;
  try {
    response = await fetch(request);
    cache.put(request, response.clone()).catch(() => {});
  } catch {
    response = await cache.match(request);
  }
  if (!response) return new Response('', { status: 404 });
  const text = transformer(await response.text());
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
    event.respondWith(transformedScript(request, patchAdminScript));
    return;
  }
  if (isAdminV2Script(url)) {
    event.respondWith(transformedScript(request, patchAdminV2Script));
    return;
  }
  if (isFieldScript(url)) {
    event.respondWith(transformedScript(request, patchFieldScript));
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
