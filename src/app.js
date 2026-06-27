const DEFAULT_CENTER = [44.6714, -103.8522];
const DEFAULT_ZOOM = 13;
const STORAGE_KEY = 'interactive-irrigation-map-v2';
const LEGACY_STORAGE_KEY = 'interactive-irrigation-map-v1';
const MAX_TRACK_POINTS = 20000;
const MIN_DRAW_DISTANCE_METERS = 2;
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
  freehandBtn: $('freehandBtn'),
  pointDrawBtn: $('pointDrawBtn'),
  finishDrawBtn: $('finishDrawBtn'),
  undoDrawBtn: $('undoDrawBtn'),
  cancelDrawBtn: $('cancelDrawBtn'),
  clearDrawnBtn: $('clearDrawnBtn'),
  drawHelp: $('drawHelp'),
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
  drawnCount: $('drawnCount'),
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
let drawMode = null;
let activeDrawPoints = [];
let activeDrawLine = null;
let activeDrawMarkers = [];
let isFreehandDrawing = false;
let mapInteractionsLocked = false;

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
const drawnTrailLayer = L.layerGroup().addTo(map);
const draftDrawLayer = L.layerGroup().addTo(map);
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

function toLatLng(point) {
  return [point.lat, point.lng];
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
  el.trackCount.textContent = `${state.track.length} GPS point${state.track.length === 1 ? '' : 's'}`;
  el.drawnCount.textContent = `${state.drawnTrails.length} drawn trail${state.drawnTrails.length === 1 ? '' : 's'}`;
  el.waypointCount.textContent = `${state.waypoints.length} waypoint${state.waypoints.length === 1 ? '' : 's'}`;
}

function ensureGpsLayers() {
  if (!map.hasLayer(accuracyCircle)) accuracyCircle.addTo(map);
  if (!map.hasLayer(locationMarker)) locationMarker.addTo(map);
}

function updateMapPosition(point, addTrackPoint = false) {
  ensureGpsLayers();
  const latLng = toLatLng(point);
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
    trackLayer.setLatLngs(state.track.map(toLatLng));
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

function normalizeDrawnTrails(trails = []) {
  return trails
    .map((trail, index) => ({
      id: trail.id || `trail-${Date.now()}-${index}`,
      name: String(trail.name || `Drawn Trail ${index + 1}`),
      mode: trail.mode === 'freehand' ? 'freehand' : 'point',
      timestamp: Number.isFinite(trail.timestamp) ? trail.timestamp : Date.now(),
      points: normalizeTrack(trail.points || [])
    }))
    .filter((trail) => trail.points.length >= 2);
}

function loadState() {
  const saved = safeParse(localStorage.getItem(STORAGE_KEY), null) || safeParse(localStorage.getItem(LEGACY_STORAGE_KEY), {});
  return {
    track: normalizeTrack(saved.track),
    waypoints: normalizeWaypoints(saved.waypoints),
    drawnTrails: normalizeDrawnTrails(saved.drawnTrails)
  };
}

function saveState() {
  state = {
    track: normalizeTrack(state.track),
    waypoints: normalizeWaypoints(state.waypoints),
    drawnTrails: normalizeDrawnTrails(state.drawnTrails)
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function addWaypoint(waypoint) {
  const marker = L.marker([waypoint.lat, waypoint.lng]);
  marker.bindPopup(`<strong>${escapeHtml(waypoint.name)}</strong><br>${waypoint.lat.toFixed(6)}, ${waypoint.lng.toFixed(6)}<br>${new Date(waypoint.timestamp).toLocaleString()}`);
  marker.addTo(waypointLayer);
}

function addDrawnTrail(trail) {
  const line = L.polyline(trail.points.map(toLatLng), {
    weight: 5,
    opacity: 0.9,
    color: '#22c55e',
    dashArray: trail.mode === 'freehand' ? null : '8 6'
  });
  line.bindPopup(`<strong>${escapeHtml(trail.name)}</strong><br>${trail.mode === 'freehand' ? 'Freehand' : 'Point-to-point'}<br>${trail.points.length} points`);
  line.addTo(drawnTrailLayer);
}

function redrawDrawnTrails() {
  drawnTrailLayer.clearLayers();
  state.drawnTrails.forEach(addDrawnTrail);
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
      properties: { kind: 'gps-track', name: 'GPS Track', point_count: state.track.length },
      geometry: { type: 'LineString', coordinates: state.track.map(coordinateFromPoint) }
    });
  }

  for (const trail of state.drawnTrails) {
    features.push({
      type: 'Feature',
      properties: {
        kind: 'manual-trail',
        id: trail.id,
        name: trail.name,
        draw_mode: trail.mode,
        timestamp: new Date(trail.timestamp).toISOString(),
        point_count: trail.points.length
      },
      geometry: { type: 'LineString', coordinates: trail.points.map(coordinateFromPoint) }
    });
  }

  for (const waypoint of state.waypoints) {
    features.push({
      type: 'Feature',
      properties: { kind: 'waypoint', id: waypoint.id, name: waypoint.name, timestamp: new Date(waypoint.timestamp).toISOString() },
      geometry: { type: 'Point', coordinates: [waypoint.lng, waypoint.lat] }
    });
  }

  return { type: 'FeatureCollection', name: 'Interactive Irrigation Mapping Export', features };
}

function gpxTrack(name, points) {
  if (!points.length) return '';
  const trackPoints = points
    .map((point) => {
      const ele = Number.isFinite(point.altitude) ? `<ele>${point.altitude.toFixed(2)}</ele>` : '';
      return `      <trkpt lat="${point.lat}" lon="${point.lng}">${ele}<time>${new Date(point.timestamp || Date.now()).toISOString()}</time></trkpt>`;
    })
    .join('\n');

  return `  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>`;
}

function toGpx() {
  const waypoints = state.waypoints
    .map((point) => `  <wpt lat="${point.lat}" lon="${point.lng}"><name>${escapeXml(point.name)}</name><time>${new Date(point.timestamp).toISOString()}</time></wpt>`)
    .join('\n');
  const gpsTrack = gpxTrack('GPS Track', state.track);
  const drawnTracks = state.drawnTrails.map((trail) => gpxTrack(trail.name, trail.points)).filter(Boolean).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Interactive Irrigation Mapping" xmlns="http://www.topografix.com/GPX/1/1">
${waypoints}
${gpsTrack}
${drawnTracks}
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
  trackLayer.setLatLngs(state.track.map(toLatLng));
  state.waypoints.forEach(addWaypoint);
  redrawDrawnTrails();
  const latLngs = [
    ...state.track.map(toLatLng),
    ...state.waypoints.map(toLatLng),
    ...state.drawnTrails.flatMap((trail) => trail.points.map(toLatLng))
  ];
  if (latLngs.length) map.fitBounds(L.latLngBounds(latLngs), { padding: [24, 24], maxZoom: 17 });
  updateCounts();
}

function setFollowMode(value) {
  followMode = value;
  el.followBtn.textContent = `Follow: ${followMode ? 'On' : 'Off'}`;
  el.followBtn.classList.toggle('active', followMode);
}

function lockMapInteractions(lock) {
  if (lock === mapInteractionsLocked) return;
  mapInteractionsLocked = lock;
  const method = lock ? 'disable' : 'enable';
  map.dragging[method]();
  map.touchZoom[method]();
  map.doubleClickZoom[method]();
  map.scrollWheelZoom[method]();
  map.boxZoom[method]();
  map.keyboard[method]();
}

function clearDraft() {
  activeDrawPoints = [];
  activeDrawLine = null;
  activeDrawMarkers = [];
  draftDrawLayer.clearLayers();
  updateDrawButtons();
}

function createDraftLine() {
  if (activeDrawLine) return activeDrawLine;
  activeDrawLine = L.polyline([], {
    weight: 5,
    opacity: 0.95,
    color: '#22c55e',
    dashArray: drawMode === 'point' ? '8 6' : null
  }).addTo(draftDrawLayer);
  return activeDrawLine;
}

function appendDraftPoint(point, showMarker = false) {
  const last = activeDrawPoints[activeDrawPoints.length - 1];
  if (last && distanceMeters(last, point) < MIN_DRAW_DISTANCE_METERS && drawMode === 'freehand') return;

  activeDrawPoints.push(point);
  createDraftLine().setLatLngs(activeDrawPoints.map(toLatLng));

  if (showMarker) {
    const marker = L.circleMarker(toLatLng(point), {
      radius: 5,
      weight: 2,
      color: '#bbf7d0',
      fillColor: '#22c55e',
      fillOpacity: 0.9
    }).addTo(draftDrawLayer);
    activeDrawMarkers.push(marker);
  }

  updateDrawButtons();
}

function updateDrawButtons() {
  const active = drawMode !== null;
  const enoughPoints = activeDrawPoints.length >= 2;

  el.freehandBtn.classList.toggle('active', drawMode === 'freehand');
  el.pointDrawBtn.classList.toggle('active', drawMode === 'point');
  el.finishDrawBtn.disabled = !enoughPoints;
  el.undoDrawBtn.disabled = !active || activeDrawPoints.length === 0;
  el.cancelDrawBtn.disabled = !active;
  el.clearDrawnBtn.disabled = state.drawnTrails.length === 0;

  if (!active) {
    el.drawHelp.textContent = 'Draw trails without driving them. Use freehand to sketch, or point mode to tap corners.';
  } else if (drawMode === 'freehand') {
    el.drawHelp.textContent = activeDrawPoints.length
      ? `${activeDrawPoints.length} sketch points. Release your finger, then Save Trail or Cancel Draw.`
      : 'Drag on the map to sketch a trail. Map panning is locked while freehand mode is active.';
  } else {
    el.drawHelp.textContent = activeDrawPoints.length
      ? `${activeDrawPoints.length} route points. Tap more corners, Undo Point, or Save Trail.`
      : 'Tap the map at each corner or bend in the trail, then Save Trail.';
  }
}

function startDrawMode(mode) {
  if (drawMode === mode) {
    cancelDrawMode();
    return;
  }

  clearDraft();
  drawMode = mode;
  setFollowMode(false);
  map.getContainer().classList.add('drawing-map');
  lockMapInteractions(mode === 'freehand');

  if (mode === 'point') {
    map.on('click', handlePointDrawClick);
    setStatus('Point drawing: tap the trail corners', 'warn');
  } else {
    setStatus('Freehand drawing: drag on the map', 'warn');
  }

  updateDrawButtons();
}

function cancelDrawMode() {
  if (drawMode === 'point') map.off('click', handlePointDrawClick);
  drawMode = null;
  isFreehandDrawing = false;
  lockMapInteractions(false);
  map.getContainer().classList.remove('drawing-map');
  clearDraft();
  setStatus('Drawing canceled', 'warn');
}

function finishDrawMode() {
  if (activeDrawPoints.length < 2) {
    setStatus('A trail needs at least two points', 'warn');
    return;
  }

  const defaultName = `Drawn Trail ${state.drawnTrails.length + 1}`;
  const name = window.prompt('Trail name:', defaultName);
  if (name === null) return;

  const trail = {
    id: `trail-${Date.now()}`,
    name: name.trim() || defaultName,
    mode: drawMode || 'point',
    timestamp: Date.now(),
    points: normalizeTrack(activeDrawPoints)
  };

  state.drawnTrails.push(trail);
  addDrawnTrail(trail);
  saveState();
  updateCounts();
  cancelDrawMode();
  setStatus('Drawn trail saved', 'ok');
}

function undoDrawPoint() {
  if (!activeDrawPoints.length) return;
  activeDrawPoints.pop();

  const marker = activeDrawMarkers.pop();
  if (marker) draftDrawLayer.removeLayer(marker);

  if (activeDrawLine) activeDrawLine.setLatLngs(activeDrawPoints.map(toLatLng));
  updateDrawButtons();
}

function handlePointDrawClick(event) {
  if (drawMode !== 'point') return;
  appendDraftPoint({ lat: event.latlng.lat, lng: event.latlng.lng, timestamp: Date.now() }, true);
}

function pointFromPointerEvent(event) {
  const latLng = map.mouseEventToLatLng(event);
  return { lat: latLng.lat, lng: latLng.lng, timestamp: Date.now() };
}

function handleFreehandPointerDown(event) {
  if (drawMode !== 'freehand') return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;

  event.preventDefault();
  event.stopPropagation();
  isFreehandDrawing = true;
  map.getContainer().setPointerCapture?.(event.pointerId);
  appendDraftPoint(pointFromPointerEvent(event), false);
}

function handleFreehandPointerMove(event) {
  if (drawMode !== 'freehand' || !isFreehandDrawing) return;
  event.preventDefault();
  event.stopPropagation();
  appendDraftPoint(pointFromPointerEvent(event), false);
}

function handleFreehandPointerUp(event) {
  if (drawMode !== 'freehand') return;
  event.preventDefault();
  event.stopPropagation();
  isFreehandDrawing = false;
  map.getContainer().releasePointerCapture?.(event.pointerId);
  updateDrawButtons();
}

el.gpsBtn.addEventListener('click', () => {
  if (watchId === null) startGps();
  else stopGps();
});

el.followBtn.addEventListener('click', () => {
  setFollowMode(!followMode);
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
  if (!window.confirm('Clear the recorded GPS track from this browser? Waypoints and drawn trails will stay.')) return;
  state.track = [];
  trackLayer.setLatLngs([]);
  updateCounts();
  saveState();
  setStatus('GPS track cleared', 'warn');
});

el.freehandBtn.addEventListener('click', () => startDrawMode('freehand'));
el.pointDrawBtn.addEventListener('click', () => startDrawMode('point'));
el.finishDrawBtn.addEventListener('click', finishDrawMode);
el.undoDrawBtn.addEventListener('click', undoDrawPoint);
el.cancelDrawBtn.addEventListener('click', cancelDrawMode);
el.clearDrawnBtn.addEventListener('click', () => {
  if (!state.drawnTrails.length) return;
  if (!window.confirm('Clear all manually drawn trails from this browser? GPS track and waypoints will stay.')) return;
  state.drawnTrails = [];
  drawnTrailLayer.clearLayers();
  updateCounts();
  saveState();
  updateDrawButtons();
  setStatus('Drawn trails cleared', 'warn');
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

const mapContainer = map.getContainer();
mapContainer.addEventListener('pointerdown', handleFreehandPointerDown, { passive: false });
mapContainer.addEventListener('pointermove', handleFreehandPointerMove, { passive: false });
mapContainer.addEventListener('pointerup', handleFreehandPointerUp, { passive: false });
mapContainer.addEventListener('pointercancel', handleFreehandPointerUp, { passive: false });

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

setFollowMode(true);
initSavedLayers();
updateDrawButtons();
