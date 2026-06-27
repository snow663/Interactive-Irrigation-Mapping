const DEFAULT_CENTER = [44.6714, -103.8522];
const DEFAULT_ZOOM = 13;
const STORAGE_KEY = 'interactive-irrigation-map-v1';
const MAX_TRACK_POINTS = 20000;
const MPS_TO_MPH = 2.2369362921;
const EARTH_RADIUS_METERS = 6371008.8;

const $ = (id) => document.getElementById(id);

const el = {
  status: $('connectionStatus'),
  installBtn: $('installBtn'),
  gpsBtn: $('gpsBtn'),
  followBtn: $('followBtn'),
  wakeBtn: $('wakeBtn'),
  waypointBtn: $('waypointBtn'),
  clearTrackBtn: $('clearTrackBtn'),
  exportGeoJsonBtn: $('exportGeoJsonBtn'),
  exportGpxBtn: $('exportGpxBtn'),
  geojsonInput: $('geojsonInput'),
  lat: $('latReadout'),
  lng: $('lngReadout'),
  accuracy: $('accuracyReadout'),
  speed: $('speedReadout'),
  heading: $('headingReadout'),
  altitude: $('altitudeReadout'),
  trackCount: $('trackCount'),
  waypointCount: $('waypointCount')
};

let state = loadState();
let followMode = true;
let watchId = null;
let lastPoint = null;
let wakeRequested = false;
let wakeLock = null;
let deferredInstallPrompt = null;
let saveTimer = null;

const map = L.map('map', { zoomControl: false, preferCanvas: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.control.scale({ imperial: true, metric: true }).addTo(map);

const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 20,
  attribution: '&copy; OpenStreetMap contributors'
});

const imageryLayer = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { maxZoom: 19, attribution: 'Tiles &copy; Esri' }
);

streetLayer.addTo(map);
L.control.layers({ Streets: streetLayer, Imagery: imageryLayer }, {}, { position: 'topright' }).addTo(map);

const trackLayer = L.polyline([], { weight: 4, opacity: 0.9, color: '#2563eb' }).addTo(map);
const waypointLayer = L.layerGroup().addTo(map);
const importedLayer = L.layerGroup().addTo(map);

const gpsIcon = L.divIcon({
  className: 'gps-location-icon',
  html: '<div class="gps-arrow"></div><div class="gps-dot"></div>',
  iconSize: [44, 44],
  iconAnchor: [22, 22]
});

const locationMarker = L.marker(DEFAULT_CENTER, { icon: gpsIcon, interactive: false });
const accuracyCircle = L.circle(DEFAULT_CENTER, {
  radius: 0,
  stroke: true,
  weight: 1,
  opacity: 0.7,
  fillOpacity: 0.12,
  color: '#0ea5e9',
  fillColor: '#0ea5e9'
});

function setStatus(message, level = 'neutral') {
  el.status.textContent = message;
  el.status.dataset.level = level;
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

function distanceMeters(a, b) {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearingDegrees(a, b) {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function cleanNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function normalizePosition(position) {
  const coords = position.coords;
  const point = {
    lat: coords.latitude,
    lng: coords.longitude,
    accuracy: cleanNumber(coords.accuracy),
    altitude: cleanNumber(coords.altitude),
    altitudeAccuracy: cleanNumber(coords.altitudeAccuracy),
    heading: cleanNumber(coords.heading),
    speedMps: cleanNumber(coords.speed),
    timestamp: position.timestamp || Date.now()
  };

  if (lastPoint) {
    const dtSeconds = Math.max(0, (point.timestamp - lastPoint.timestamp) / 1000);
    const distance = distanceMeters(lastPoint, point);
    if (!Number.isFinite(point.speedMps) && dtSeconds > 0.5 && distance > 0.5) point.speedMps = distance / dtSeconds;
    if (!Number.isFinite(point.heading) && distance > 2) point.heading = bearingDegrees(lastPoint, point);
  }

  point.speedMph = Number.isFinite(point.speedMps) ? point.speedMps * MPS_TO_MPH : null;
  return point;
}

function formatNumber(value, digits = 2, suffix = '') {
  return Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : '--';
}

function updateReadouts(point) {
  el.lat.textContent = formatNumber(point.lat, 6);
  el.lng.textContent = formatNumber(point.lng, 6);
  el.accuracy.textContent = Number.isFinite(point.accuracy) ? `${(point.accuracy * 3.28084).toFixed(0)} ft` : '--';
  el.speed.textContent = formatNumber(point.speedMph, 1, ' mph');
  el.heading.textContent = Number.isFinite(point.heading) ? `${point.heading.toFixed(0)}°` : '--';
  el.altitude.textContent = Number.isFinite(point.altitude) ? `${(point.altitude * 3.28084).toFixed(0)} ft` : '--';
}

function updateCounts() {
  el.trackCount.textContent = `${state.track.length} track point${state.track.length === 1 ? '' : 's'}`;
  el.waypointCount.textContent = `${state.waypoints.length} waypoint${state.waypoints.length === 1 ? '' : 's'}`;
}

function ensureGpsLayers() {
  if (!map.hasLayer(accuracyCircle)) accuracyCircle.addTo(map);
  if (!map.hasLayer(locationMarker)) locationMarker.addTo(map);
}

function updateMapPosition(point, addTrackPoint = false) {
  ensureGpsLayers();
  const latLng = [point.lat, point.lng];
  locationMarker.setLatLng(latLng);
  accuracyCircle.setLatLng(latLng);
  accuracyCircle.setRadius(Number.isFinite(point.accuracy) ? point.accuracy : 0);

  const markerElement = locationMarker.getElement();
  if (markerElement) {
    markerElement.style.setProperty('--heading', `${Number.isFinite(point.heading) ? point.heading : 0}deg`);
    markerElement.classList.toggle('has-heading', Number.isFinite(point.heading));
  }

  if (addTrackPoint) trackLayer.addLatLng(latLng);
  if (followMode) map.setView(latLng, Math.max(map.getZoom(), 17), { animate: true });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveState(), 300);
}

function recordPoint(position) {
  const point = normalizePosition(position);
  lastPoint = point;
  state.track.push(point);

  if (state.track.length > MAX_TRACK_POINTS) {
    state.track = state.track.slice(-MAX_TRACK_POINTS);
    trackLayer.setLatLngs(state.track.map((p) => [p.lat, p.lng]));
  }

  updateMapPosition(point, true);
  updateReadouts(point);
  updateCounts();
  scheduleSave();
  setStatus('GPS active', 'ok');
}

function handleGpsError(error) {
  const messages = {
    1: 'Location permission was denied.',
    2: 'Location is unavailable. Move outside or enable device GPS.',
    3: 'GPS timed out before a fresh fix arrived.'
  };
  setStatus(messages[error.code] || error.message || 'GPS failed.', 'error');
}

function startGps() {
  if (!navigator.geolocation) {
    setStatus('GPS unavailable in this browser', 'error');
    return;
  }

  if (!window.isSecureContext) {
    setStatus('GPS needs HTTPS or localhost', 'error');
    return;
  }

  if (watchId !== null) return;
  setStatus('Waiting for GPS lock', 'warn');
  watchId = navigator.geolocation.watchPosition(recordPoint, handleGpsError, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 15000
  });
  el.gpsBtn.textContent = 'Stop GPS';
}

function stopGps() {
  if (watchId === null) return;
  navigator.geolocation.clearWatch(watchId);
  watchId = null;
  el.gpsBtn.textContent = 'Use My Location';
  setStatus('GPS stopped', 'warn');
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) {
    setStatus('Wake lock is not supported here', 'warn');
    return false;
  }
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      if (wakeRequested) el.wakeBtn.textContent = 'Keep Screen Awake';
    });
    el.wakeBtn.textContent = 'Screen Awake: On';
    return true;
  } catch (error) {
    setStatus(error.message || 'Wake lock failed', 'warn');
    return false;
  }
}

async function releaseWakeLock() {
  if (!wakeLock) return;
  const lock = wakeLock;
  wakeLock = null;
  await lock.release().catch(() => {});
  el.wakeBtn.textContent = 'Keep Screen Awake';
}

function safeParse(json, fallback) {
  try {
    return JSON.parse(json) ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeTrack(points = []) {
  return points
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    .map((point) => ({
      lat: Number(point.lat),
      lng: Number(point.lng),
      accuracy: Number.isFinite(point.accuracy) ? point.accuracy : null,
      altitude: Number.isFinite(point.altitude) ? point.altitude : null,
      heading: Number.isFinite(point.heading) ? point.heading : null,
      speedMps: Number.isFinite(point.speedMps) ? point.speedMps : null,
      speedMph: Number.isFinite(point.speedMph) ? point.speedMph : null,
      timestamp: Number.isFinite(point.timestamp) ? point.timestamp : Date.now()
    }))
    .slice(-MAX_TRACK_POINTS);
}

function normalizeWaypoints(points = []) {
  return points
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    .map((point, index) => ({
      id: point.id || `wp-${Date.now()}-${index}`,
      name: String(point.name || `Waypoint ${index + 1}`),
      lat: Number(point.lat),
      lng: Number(point.lng),
      timestamp: Number.isFinite(point.timestamp) ? point.timestamp : Date.now()
    }));
}

function loadState() {
  const saved = safeParse(localStorage.getItem(STORAGE_KEY), {});
  return { track: normalizeTrack(saved.track), waypoints: normalizeWaypoints(saved.waypoints) };
}

function saveState() {
  state = { track: normalizeTrack(state.track), waypoints: normalizeWaypoints(state.waypoints) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function addWaypoint(waypoint) {
  const marker = L.marker([waypoint.lat, waypoint.lng]);
  marker.bindPopup(`<strong>${escapeHtml(waypoint.name)}</strong><br>${waypoint.lat.toFixed(6)}, ${waypoint.lng.toFixed(6)}<br>${new Date(waypoint.timestamp).toLocaleString()}`);
  marker.addTo(waypointLayer);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function coordinateFromPoint(point) {
  const coordinate = [point.lng, point.lat];
  if (Number.isFinite(point.altitude)) coordinate.push(point.altitude);
  return coordinate;
}

function toGeoJson() {
  const features = [];
  if (state.track.length) {
    features.push({
      type: 'Feature',
      properties: { name: 'GPS Track', point_count: state.track.length },
      geometry: { type: 'LineString', coordinates: state.track.map(coordinateFromPoint) }
    });
  }
  for (const waypoint of state.waypoints) {
    features.push({
      type: 'Feature',
      properties: { id: waypoint.id, name: waypoint.name, timestamp: new Date(waypoint.timestamp).toISOString() },
      geometry: { type: 'Point', coordinates: [waypoint.lng, waypoint.lat] }
    });
  }
  return { type: 'FeatureCollection', name: 'Interactive Irrigation Mapping Export', features };
}

function toGpx() {
  const waypoints = state.waypoints
    .map((point) => `  <wpt lat="${point.lat}" lon="${point.lng}"><name>${escapeXml(point.name)}</name><time>${new Date(point.timestamp).toISOString()}</time></wpt>`)
    .join('\n');
  const trackPoints = state.track
    .map((point) => {
      const ele = Number.isFinite(point.altitude) ? `<ele>${point.altitude.toFixed(2)}</ele>` : '';
      return `      <trkpt lat="${point.lat}" lon="${point.lng}">${ele}<time>${new Date(point.timestamp).toISOString()}</time></trkpt>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Interactive Irrigation Mapping" xmlns="http://www.topografix.com/GPX/1/1">
${waypoints}
  <trk>
    <name>GPS Track</name>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>`;
}

function downloadText(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function timestampedFilename(prefix, extension) {
  const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('-', '').slice(0, 15);
  return `${prefix}-${stamp}.${extension}`;
}

function importGeoJson(geojson, name = 'Imported GeoJSON') {
  const layer = L.geoJSON(geojson, {
    style: { color: '#f97316', weight: 4, opacity: 0.85 },
    pointToLayer: (_feature, latLng) => L.circleMarker(latLng, {
      radius: 6,
      color: '#f97316',
      fillColor: '#f97316',
      fillOpacity: 0.75
    }),
    onEachFeature: (feature, layer) => {
      const props = feature.properties || {};
      layer.bindPopup(`<strong>${escapeHtml(props.name || props.title || name)}</strong>`);
    }
  });
  layer.addTo(importedLayer);
  try {
    map.fitBounds(layer.getBounds(), { padding: [24, 24] });
  } catch {
    // Empty GeoJSON has no bounds.
  }
}

function initSavedLayers() {
  trackLayer.setLatLngs(state.track.map((point) => [point.lat, point.lng]));
  state.waypoints.forEach(addWaypoint);
  const latLngs = [...state.track.map((p) => [p.lat, p.lng]), ...state.waypoints.map((p) => [p.lat, p.lng])];
  if (latLngs.length) map.fitBounds(L.latLngBounds(latLngs), { padding: [24, 24], maxZoom: 17 });
  updateCounts();
}

el.gpsBtn.addEventListener('click', () => {
  if (watchId === null) startGps();
  else stopGps();
});

el.followBtn.addEventListener('click', () => {
  followMode = !followMode;
  el.followBtn.textContent = `Follow: ${followMode ? 'On' : 'Off'}`;
  el.followBtn.classList.toggle('active', followMode);
  if (followMode && lastPoint) updateMapPosition(lastPoint, false);
});

el.wakeBtn.addEventListener('click', async () => {
  wakeRequested = !wakeRequested;
  if (wakeRequested) {
    const ok = await requestWakeLock();
    if (!ok) wakeRequested = false;
  } else {
    await releaseWakeLock();
  }
});

el.waypointBtn.addEventListener('click', () => {
  const source = lastPoint || map.getCenter();
  const point = Array.isArray(source) ? { lat: source[0], lng: source[1] } : { lat: source.lat, lng: source.lng };
  const defaultName = `Waypoint ${state.waypoints.length + 1}`;
  const name = window.prompt('Waypoint name:', defaultName);
  if (name === null) return;
  const waypoint = { id: `wp-${Date.now()}`, name: name.trim() || defaultName, lat: point.lat, lng: point.lng, timestamp: Date.now() };
  state.waypoints.push(waypoint);
  addWaypoint(waypoint);
  updateCounts();
  saveState();
  setStatus('Waypoint saved', 'ok');
});

el.clearTrackBtn.addEventListener('click', () => {
  if (!state.track.length) return;
  if (!window.confirm('Clear the recorded track from this browser? Waypoints will stay.')) return;
  state.track = [];
  trackLayer.setLatLngs([]);
  updateCounts();
  saveState();
  setStatus('Track cleared', 'warn');
});

el.exportGeoJsonBtn.addEventListener('click', () => {
  downloadText(timestampedFilename('irrigation-map-export', 'geojson'), JSON.stringify(toGeoJson(), null, 2), 'application/geo+json');
});

el.exportGpxBtn.addEventListener('click', () => {
  downloadText(timestampedFilename('irrigation-map-track', 'gpx'), toGpx(), 'application/gpx+xml');
});

el.geojsonInput.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    importGeoJson(JSON.parse(await file.text()), file.name);
    setStatus(`Imported ${file.name}`, 'ok');
  } catch (error) {
    setStatus(`Import failed: ${error.message}`, 'error');
  } finally {
    el.geojsonInput.value = '';
  }
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  el.installBtn.hidden = false;
});

el.installBtn.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  el.installBtn.hidden = true;
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeRequested && !wakeLock) requestWakeLock();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch((error) => console.warn('Service worker failed:', error));
}

if (!window.isSecureContext) setStatus('GPS needs HTTPS or localhost', 'error');
else if (!navigator.geolocation) setStatus('GPS unavailable in this browser', 'error');
else setStatus('Ready', 'ok');

el.followBtn.classList.add('active');
initSavedLayers();
