const CACHE_VERSION = 'interactive-irrigation-map-v24';
const APP_SHELL = [
  './', './index.html', './login.html', './ride-map.html', './admin.html', './admin-v2.html',
  './manifest.webmanifest', './assets/icon.svg', './data/definitions.json',
  './src/map-extent.js', './src/field-sync.js', './src/admin-backup.js', './src/user-session.js', './src/usgs-key.js',
  './src/ride-map.js', './src/admin-v2.js', './src/app.js', './src/admin.js', './src/style.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

function isMapTile(url) { return url.hostname.includes('basemap.nationalmap.gov'); }
function isDefinitionsFile(url) { return url.pathname.endsWith('/data/definitions.json'); }
function isAdminScript(url) { return url.pathname.endsWith('/src/admin.js'); }
function isAdminV2Script(url) { return url.pathname.endsWith('/src/admin-v2.js'); }
function isFieldScript(url) { return url.pathname.endsWith('/src/app.js'); }
function isRideMapScript(url) { return url.pathname.endsWith('/src/ride-map.js'); }
function isLoginPage(url) { return url.pathname.endsWith('/login.html'); }

function patchCoverageDefaults(text) {
  return text
    .replaceAll('44.865000', '44.768000')
    .replaceAll('44.525000', '44.623000')
    .replaceAll('-103.950000', '-104.030000')
    .replaceAll('-103.950', '-104.030')
    .replaceAll('-103.95', '-104.03')
    .replaceAll('-103.315000', '-103.235000')
    .replaceAll('-103.315', '-103.235')
    .replaceAll('about ten miles north and south of the US 212 corridor', 'about five miles north and south of the US 212 corridor')
    .replaceAll('Default page edge: Belle Fourche to roughly five miles east of Newell. South edge extended to include Ride 8.', 'Default page edge: widened east/west for UI panel clearance and south edge extended to include Ride 8.');
}

function usgsLayerBlock(topoName = 'usgsTopoLayer', imageryName = 'usgsImageryTopoLayer') {
  return `const ${topoName} = L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'USGS The National Map' });\nconst ${imageryName} = L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'USGS The National Map' });`;
}

function patchBasemapChoices(text) {
  return text
    .replace(
      "const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, attribution: '&copy; OpenStreetMap contributors' });\nconst imageryLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' });\nstreetLayer.addTo(map);\nL.control.layers({ Streets: streetLayer, Imagery: imageryLayer }, {}, { position: 'topright' }).addTo(map);",
      `${usgsLayerBlock('usgsTopoLayer', 'usgsImageryTopoLayer')}\nusgsTopoLayer.addTo(map);\nL.control.layers({ 'USGS Topo': usgsTopoLayer, 'USGS Imagery Topo': usgsImageryTopoLayer }, {}, { position: 'topright' }).addTo(map);`
    )
    .replace(
      "const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, attribution: '&copy; OpenStreetMap contributors' });\nconst usgsTopo = L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'USGS The National Map' });\nconst usgsImageryTopo = L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'USGS The National Map' });\nconst imagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' });\nstreets.addTo(map);\nL.control.layers({ Streets: streets, 'USGS Topo': usgsTopo, 'USGS Imagery Topo': usgsImageryTopo, Imagery: imagery }, {}, { position: 'topright' }).addTo(map);",
      `${usgsLayerBlock('usgsTopo', 'usgsImageryTopo')}\nusgsTopo.addTo(map);\nL.control.layers({ 'USGS Topo': usgsTopo, 'USGS Imagery Topo': usgsImageryTopo }, {}, { position: 'topright' }).addTo(map);`
    )
    .replace(
      "const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, attribution: '&copy; OpenStreetMap contributors' });\nconst usgsTopo = L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'USGS The National Map' });\nconst usgsImageryTopo = L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'USGS The National Map' });\nconst esriImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' });\nosm.addTo(map);\nL.control.layers({ Streets: osm, 'USGS Topo': usgsTopo, 'USGS Imagery Topo': usgsImageryTopo, Imagery: esriImagery }, {}, { position: 'topright' }).addTo(map);",
      `${usgsLayerBlock('usgsTopo', 'usgsImageryTopo')}\nusgsTopo.addTo(map);\nL.control.layers({ 'USGS Topo': usgsTopo, 'USGS Imagery Topo': usgsImageryTopo }, {}, { position: 'topright' }).addTo(map);`
    )
    .replace(
      "L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, attribution: '&copy; OpenStreetMap contributors' }).addTo(adminMap);",
      `${usgsLayerBlock('adminUsgsTopo', 'adminUsgsImageryTopo')}\nadminUsgsTopo.addTo(adminMap);\nL.control.layers({ 'USGS Topo': adminUsgsTopo, 'USGS Imagery Topo': adminUsgsImageryTopo }, {}, { position: 'topright' }).addTo(adminMap);`
    );
}

function patchAdminScript(text) {
  const patched = patchBasemapChoices(patchCoverageDefaults(text))
    .replace('}\\nfunction deleteMarker', '}\nfunction deleteMarker')
    .replace("L.polygon(zone.boundary.map((p) => [p.lat, p.lng]), { color: coverage ? '#facc15' : '#38bdf8',", "L.polygon(zone.boundary.map((p) => [p.lat, p.lng]), { interactive: !activeTool, bubblingMouseEvents: true, color: coverage ? '#facc15' : '#38bdf8',")
    .replace("L.polyline(trail.points.map((p) => [p.lat, p.lng]), { color,", "L.polyline(trail.points.map((p) => [p.lat, p.lng]), { interactive: !activeTool, bubblingMouseEvents: true, color,")
    .replace("L.circleMarker([marker.lat, marker.lng], { radius:", "L.circleMarker([marker.lat, marker.lng], { interactive: !activeTool, bubblingMouseEvents: true, radius:");
  return `${patched}\nimport './admin-backup.js';\n`;
}

function patchAdminV2Script(text) {
  return patchBasemapChoices(patchCoverageDefaults(text))
    .replace("      featureType,\n      overlays: { mowing:", "      featureType,\n      color: String(trail.color || ''),\n      ditchRider: String(trail.ditchRider || ''),\n      overlays: { mowing:")
    .replace("function trailColor(trail, selected) {\n  if (selected) return '#facc15';", "function trailColor(trail, selected) {\n  if (selected) return '#facc15';\n  if (trail.color) return trail.color;");
}

function patchFieldScript(text) {
  return patchBasemapChoices(patchCoverageDefaults(text))
    .replace("return trails.map((t,i) => ({ id: String(t.id || `trail-${Date.now()}-${i}`), name: String(t.name || `Trail ${i + 1}`), zoneId: validZone.has(t.zoneId) ? t.zoneId : fallback, overlays: normalizeTrailOverlays(t), flags: normalizeTrailFlags(t), estimatedMinutes: Number.isFinite(Number(t.estimatedMinutes)) ? Number(t.estimatedMinutes) : null, notes: String(t.notes || ''), points: normalizeTrack(t.points || []) })).filter((t) => t.points.length >= 2);", "return trails.map((t,i) => ({ id: String(t.id || `trail-${Date.now()}-${i}`), name: String(t.name || `Trail ${i + 1}`), zoneId: validZone.has(t.zoneId) ? t.zoneId : fallback, featureType: String(t.featureType || t.kind || ''), color: String(t.color || ''), ditchRider: String(t.ditchRider || ''), overlays: normalizeTrailOverlays(t), flags: normalizeTrailFlags(t), estimatedMinutes: Number.isFinite(Number(t.estimatedMinutes)) ? Number(t.estimatedMinutes) : null, notes: String(t.notes || ''), points: normalizeTrack(t.points || []) })).filter((t) => t.points.length >= 2);")
    .replace("for (const trail of state.drawnTrails) {\n    const both = trail.overlays.mowing && trail.overlays.spraying;", "for (const trail of state.drawnTrails) {\n    if (trail.featureType === 'ride-track') addTrailLine(trail, flagLayer, { weight: 6, opacity: 0.95, color: trail.color || '#06b6d4' });\n    const both = trail.overlays.mowing && trail.overlays.spraying;")
    .replace("function saveRecord(type, title, details = '', zoneId = selectedZoneId()) { state.recentSaves.unshift({ id: `recent-${Date.now()}`, timestamp: Date.now(), type, zoneId, title, details }); state.recentSaves = normalizeRecentSaves(state.recentSaves, state.zones); saveState(); renderRecentSaves(); }", "function saveRecord(type, title, details = '', zoneId = selectedZoneId()) { const recordUser = window.IrrigationUser?.current?.() || null; state.recentSaves.unshift({ id: `recent-${Date.now()}`, timestamp: Date.now(), type, userId: recordUser?.id || '', userName: recordUser?.name || '', zoneId, title, details }); state.recentSaves = normalizeRecentSaves(state.recentSaves, state.zones); saveState(); renderRecentSaves(); }")
    .replace("function addLog(entry) { const log = { id: `log-${Date.now()}`, timestamp: Date.now(), startTime: null, endTime: null, zoneId: selectedZoneId(), trailId: '', workType: selectedWorkType(), durationMinutes: null, completed: false, notes: '', ...entry }; state.logs.push(log); saveState(); updateCounts(); updateSummary(); return log; }", "function addLog(entry) { const recordUser = window.IrrigationUser?.current?.() || null; const log = { id: `log-${Date.now()}`, timestamp: Date.now(), startTime: null, endTime: null, userId: recordUser?.id || '', userName: recordUser?.name || '', zoneId: selectedZoneId(), trailId: '', workType: selectedWorkType(), durationMinutes: null, completed: false, notes: '', ...entry }; state.logs.push(log); saveState(); updateCounts(); updateSummary(); return log; }");
}

function patchRideMapScript(text) {
  return patchBasemapChoices(patchCoverageDefaults(text))
    .replace('map.setMaxBounds(bounds.pad(0.2));', 'map.setMaxBounds(bounds.pad(0.75));')
    .replace('map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });', "map.fitBounds(bounds, { paddingTopLeft: [160, 60], paddingBottomRight: [80, 120], maxZoom: 16 });");
}

function patchHtml(text, url) {
  if (isLoginPage(url)) return text;
  const sessionScript = '<script type="module" src="./src/user-session.js"></script>';
  const keyScript = '<script src="./src/usgs-key.js"></script>';
  let patched = text.includes('src="./src/user-session.js"') ? text : text.replace('</body>', `${sessionScript}\n  </body>`);
  patched = patched.includes('src="./src/usgs-key.js"') ? patched : patched.replace('</body>', `${keyScript}\n  </body>`);
  return patched;
}

function widenCoverage(definitions) {
  if (!definitions || !Array.isArray(definitions.zones)) return definitions;
  for (const zone of definitions.zones) {
    if (zone.id === 'map-coverage' || zone.type === 'coverage') {
      zone.notes = 'Default page edge: widened east/west for UI panel clearance and south edge extended to include Ride 8.';
      zone.boundary = [
        { lat: 44.768, lng: -104.03 },
        { lat: 44.768, lng: -103.235 },
        { lat: 44.555, lng: -103.235 },
        { lat: 44.555, lng: -104.03 }
      ];
      break;
    }
  }
  return definitions;
}

async function transformedScript(request, transformer) {
  const cache = await caches.open(CACHE_VERSION);
  let response;
  try { response = await fetch(request); cache.put(request, response.clone()).catch(() => {}); } catch { response = await cache.match(request); }
  if (!response) return new Response('', { status: 404 });
  return new Response(transformer(await response.text()), { headers: { 'Content-Type': 'application/javascript; charset=utf-8' } });
}

async function transformedHtml(request, url) {
  const response = await networkFirst(request);
  return new Response(patchHtml(await response.text(), url), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function transformedDefinitions(request) {
  const response = await networkFirst(request);
  try {
    const definitions = widenCoverage(JSON.parse(await response.clone().text()));
    return new Response(JSON.stringify(definitions), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  } catch {
    return new Response(patchCoverageDefaults(await response.text()), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
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
  const network = fetch(request).then((response) => { cache.put(request, response.clone()).catch(() => {}); return response; }).catch(() => cached);
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
  if (request.mode === 'navigate') { event.respondWith(transformedHtml(request, url)); return; }
  if (isAdminScript(url)) { event.respondWith(transformedScript(request, patchAdminScript)); return; }
  if (isAdminV2Script(url)) { event.respondWith(transformedScript(request, patchAdminV2Script)); return; }
  if (isFieldScript(url)) { event.respondWith(transformedScript(request, patchFieldScript)); return; }
  if (isRideMapScript(url)) { event.respondWith(transformedScript(request, patchRideMapScript)); return; }
  if (isDefinitionsFile(url)) { event.respondWith(transformedDefinitions(request)); return; }
  if (isMapTile(url)) { event.respondWith(cacheFirst(request)); return; }
  event.respondWith(staleWhileRevalidate(request));
});
