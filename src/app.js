const DEFAULT_CENTER = [44.6714, -103.8522];
const DEFAULT_ZOOM = 13;
const STORAGE_KEY = 'interactive-irrigation-map-v4';
const LEGACY_KEYS = [
  'interactive-irrigation-map-v3',
  'interactive-irrigation-map-v2',
  'interactive-irrigation-map-v1'
];
const MAX_TRACK_POINTS = 20000;
const MAX_RECENT_SAVES = 10;
const MIN_DRAW_DISTANCE_METERS = 2;
const MPS_TO_MPH = 2.2369362921;
const EARTH_RADIUS_METERS = 6371008.8;

const ZONES = [
  ['ride1', 'Ride 1'],
  ['ride2', 'Ride 2'],
  ['ride4', 'Ride 4'],
  ['ride5', 'Ride 5'],
  ['ride6', 'Ride 6'],
  ['ride7', 'Ride 7'],
  ['ride8', 'Ride 8'],
  ['ride10', 'Ride 10']
];

const ASSET_TYPES = [
  ['head-gate', 'Head gate'],
  ['valve', 'Valve'],
  ['box', 'Box'],
  ['check', 'Check'],
  ['culvert', 'Culvert'],
  ['crossing', 'Crossing'],
  ['washout', 'Washout'],
  ['spray-area', 'Spray area'],
  ['problem', 'Problem spot'],
  ['note', 'Note']
];

const WORK_TYPES = [
  ['road-clearing', 'Road clearing'],
  ['spraying', 'Spraying'],
  ['scouting', 'Scouting / inspection'],
  ['repair', 'Repair / maintenance'],
  ['ditch-rider-support', 'Ditch rider support'],
  ['drive-time', 'Drive time'],
  ['other', 'Other']
];

const $ = (id) => document.getElementById(id);

const el = {
  status: $('connectionStatus'),
  installBtn: $('installBtn'),
  gpsBtn: $('gpsBtn'),
  followBtn: $('followBtn'),
  wakeBtn: $('wakeBtn'),
  waypointBtn: $('waypointBtn'),
  clearTrackBtn: $('clearTrackBtn'),
  zoneSelect: $('zoneSelect'),
  trailSelect: $('trailSelect'),
  assetTypeSelect: $('assetTypeSelect'),
  workTypeSelect: $('workTypeSelect'),
  zoneSummary: $('zoneSummary'),
  addAssetBtn: $('addAssetBtn'),
  markVisitedBtn: $('markVisitedBtn'),
  markCompleteBtn: $('markCompleteBtn'),
  startWorkBtn: $('startWorkBtn'),
  stopWorkBtn: $('stopWorkBtn'),
  addLogBtn: $('addLogBtn'),
  recentList: $('recentList'),
  freehandBtn: $('freehandBtn'),
  pointDrawBtn: $('pointDrawBtn'),
  finishDrawBtn: $('finishDrawBtn'),
  undoDrawBtn: $('undoDrawBtn'),
  cancelDrawBtn: $('cancelDrawBtn'),
  clearDrawnBtn: $('clearDrawnBtn'),
  drawHelp: $('drawHelp'),
  geojsonInput: $('geojsonInput'),
  lat: $('latReadout'),
  lng: $('lngReadout'),
  accuracy: $('accuracyReadout'),
  speed: $('speedReadout'),
  heading: $('headingReadout'),
  altitude: $('altitudeReadout'),
  trackCount: $('trackCount'),
  drawnCount: $('drawnCount'),
  assetCount: $('assetCount'),
  logCount: $('logCount'),
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
let activeWork = null;

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
const assetLayer = L.layerGroup().addTo(map);
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
  el.assetCount.textContent = `${state.assets.length} asset${state.assets.length === 1 ? '' : 's'}`;
  el.logCount.textContent = `${state.logs.length} log${state.logs.length === 1 ? '' : 's'}`;
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
      zoneId: zoneExists(trail.zoneId) ? trail.zoneId : 'ride1',
      estimatedMinutes: Number.isFinite(trail.estimatedMinutes) ? Number(trail.estimatedMinutes) : null,
      timestamp: Number.isFinite(trail.timestamp) ? trail.timestamp : Date.now(),
      points: normalizeTrack(trail.points || [])
    }))
    .filter((trail) => trail.points.length >= 2);
}

function normalizeAssets(assets = []) {
  return assets
    .filter((asset) => Number.isFinite(asset.lat) && Number.isFinite(asset.lng))
    .map((asset, index) => ({
      id: asset.id || `asset-${Date.now()}-${index}`,
      type: assetTypeExists(asset.type) ? asset.type : 'note',
      zoneId: zoneExists(asset.zoneId) ? asset.zoneId : 'ride1',
      name: String(asset.name || `Asset ${index + 1}`),
      notes: String(asset.notes || ''),
      lat: Number(asset.lat),
      lng: Number(asset.lng),
      timestamp: Number.isFinite(asset.timestamp) ? asset.timestamp : Date.now(),
      lastVisited: Number.isFinite(asset.lastVisited) ? asset.lastVisited : null
    }));
}

function normalizeLogs(logs = []) {
  return logs.map((log, index) => ({
    id: log.id || `log-${Date.now()}-${index}`,
    timestamp: Number.isFinite(log.timestamp) ? log.timestamp : Date.now(),
    startTime: Number.isFinite(log.startTime) ? log.startTime : null,
    endTime: Number.isFinite(log.endTime) ? log.endTime : null,
    zoneId: zoneExists(log.zoneId) ? log.zoneId : 'ride1',
    trailId: log.trailId || '',
    assetId: log.assetId || '',
    workType: workTypeExists(log.workType) ? log.workType : 'other',
    durationMinutes: Number.isFinite(log.durationMinutes) ? Number(log.durationMinutes) : null,
    completed: Boolean(log.completed),
    notes: String(log.notes || '')
  }));
}

function normalizeZoneStatus(status = {}) {
  const result = {};
  for (const [zoneId] of ZONES) {
    const value = status[zoneId] || {};
    result[zoneId] = {
      lastVisited: Number.isFinite(value.lastVisited) ? value.lastVisited : null,
      lastCompleted: Number.isFinite(value.lastCompleted) ? value.lastCompleted : null,
      completedCount: Number.isFinite(value.completedCount) ? value.completedCount : 0
    };
  }
  return result;
}

function normalizeRecentSaves(items = []) {
  return items
    .map((item, index) => ({
      id: item.id || `recent-${Date.now()}-${index}`,
      timestamp: Number.isFinite(item.timestamp) ? item.timestamp : Date.now(),
      type: String(item.type || 'Saved'),
      zoneId: zoneExists(item.zoneId) ? item.zoneId : '',
      title: String(item.title || 'Saved record'),
      details: String(item.details || '')
    }))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_RECENT_SAVES);
}

function loadState() {
  let saved = safeParse(localStorage.getItem(STORAGE_KEY), null);
  for (const key of LEGACY_KEYS) {
    if (saved) break;
    saved = safeParse(localStorage.getItem(key), null);
  }
  saved ||= {};
  return {
    track: normalizeTrack(saved.track),
    waypoints: normalizeWaypoints(saved.waypoints),
    drawnTrails: normalizeDrawnTrails(saved.drawnTrails),
    assets: normalizeAssets(saved.assets),
    logs: normalizeLogs(saved.logs),
    zoneStatus: normalizeZoneStatus(saved.zoneStatus),
    recentSaves: normalizeRecentSaves(saved.recentSaves)
  };
}

function saveState() {
  state = {
    track: normalizeTrack(state.track),
    waypoints: normalizeWaypoints(state.waypoints),
    drawnTrails: normalizeDrawnTrails(state.drawnTrails),
    assets: normalizeAssets(state.assets),
    logs: normalizeLogs(state.logs),
    zoneStatus: normalizeZoneStatus(state.zoneStatus),
    recentSaves: normalizeRecentSaves(state.recentSaves)
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveRecord(type, title, details = '', zoneId = selectedZoneId()) {
  state.recentSaves.unshift({
    id: `recent-${Date.now()}`,
    timestamp: Date.now(),
    type,
    zoneId,
    title,
    details
  });
  state.recentSaves = normalizeRecentSaves(state.recentSaves);
  saveState();
  renderRecentSaves();
}

function renderRecentSaves() {
  el.recentList.innerHTML = '';
  if (!state.recentSaves.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-recent';
    empty.textContent = 'No saved records yet.';
    el.recentList.append(empty);
    return;
  }

  for (const item of state.recentSaves.slice(0, MAX_RECENT_SAVES)) {
    const li = document.createElement('li');
    li.innerHTML = [
      `<strong>${escapeHtml(item.type)}: ${escapeHtml(item.title)}</strong>`,
      `<span>${escapeHtml(item.zoneId ? zoneLabel(item.zoneId) : 'No zone')} • ${new Date(item.timestamp).toLocaleString()}</span>`,
      item.details ? `<small>${escapeHtml(item.details)}</small>` : ''
    ].filter(Boolean).join('');
    el.recentList.append(li);
  }
}

function zoneExists(zoneId) {
  return ZONES.some(([id]) => id === zoneId);
}

function assetTypeExists(type) {
  return ASSET_TYPES.some(([id]) => id === type);
}

function workTypeExists(type) {
  return WORK_TYPES.some(([id]) => id === type);
}

function labelFor(list, value) {
  return list.find(([id]) => id === value)?.[1] || value || 'None';
}

function zoneLabel(zoneId) {
  return labelFor(ZONES, zoneId);
}

function selectedZoneId() {
  return el.zoneSelect.value || 'ride1';
}

function selectedTrailId() {
  return el.trailSelect.value || '';
}

function selectedWorkType() {
  return el.workTypeSelect.value || 'other';
}

function populateSelect(select, options) {
  select.innerHTML = '';
  for (const [value, label] of options) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
}

function populateStaticControls() {
  populateSelect(el.zoneSelect, ZONES);
  populateSelect(el.assetTypeSelect, ASSET_TYPES);
  populateSelect(el.workTypeSelect, WORK_TYPES);
  updateTrailSelect();
}

function updateTrailSelect() {
  const zoneId = selectedZoneId();
  el.trailSelect.innerHTML = '';
  const general = document.createElement('option');
  general.value = '';
  general.textContent = `General ${zoneLabel(zoneId)} work`;
  el.trailSelect.append(general);

  for (const trail of state.drawnTrails.filter((item) => item.zoneId === zoneId)) {
    const option = document.createElement('option');
    option.value = trail.id;
    option.textContent = trail.name;
    el.trailSelect.append(option);
  }
}

function addLog(entry) {
  const log = {
    id: `log-${Date.now()}`,
    timestamp: Date.now(),
    startTime: null,
    endTime: null,
    zoneId: selectedZoneId(),
    trailId: '',
    assetId: '',
    workType: selectedWorkType(),
    durationMinutes: null,
    completed: false,
    notes: '',
    ...entry
  };
  state.logs.push(log);
  saveState();
  updateCounts();
  updateZoneSummary();
  return log;
}

function daysAgo(timestamp) {
  if (!Number.isFinite(timestamp)) return 'never';
  const days = Math.floor((Date.now() - timestamp) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function minutesLabel(minutes) {
  if (!Number.isFinite(minutes)) return '--';
  if (minutes < 60) return `${minutes.toFixed(0)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function trailById(id) {
  return state.drawnTrails.find((trail) => trail.id === id);
}

function trailStats(trailId) {
  const logs = state.logs.filter((log) => log.trailId === trailId && Number.isFinite(log.durationMinutes));
  return {
    logs,
    averageMinutes: average(logs.map((log) => log.durationMinutes)),
    lastWorked: logs.length ? Math.max(...logs.map((log) => log.timestamp)) : null
  };
}

function updateZoneSummary() {
  const zoneId = selectedZoneId();
  const status = state.zoneStatus[zoneId] || {};
  const zoneLogs = state.logs.filter((log) => log.zoneId === zoneId);
  const zoneTrails = state.drawnTrails.filter((trail) => trail.zoneId === zoneId);
  const zoneAssets = state.assets.filter((asset) => asset.zoneId === zoneId);
  const durationLogs = zoneLogs.filter((log) => Number.isFinite(log.durationMinutes));
  const avg = average(durationLogs.map((log) => log.durationMinutes));
  const total = durationLogs.reduce((sum, log) => sum + log.durationMinutes, 0);

  el.zoneSummary.innerHTML = [
    `<strong>${zoneLabel(zoneId)}</strong>`,
    `<span>Last visited: ${daysAgo(status.lastVisited)}</span>`,
    `<span>Last completed: ${daysAgo(status.lastCompleted)}</span>`,
    `<span>Completions: ${status.completedCount || 0}</span>`,
    `<span>Drawn road/trail stretches: ${zoneTrails.length}</span>`,
    `<span>Assets: ${zoneAssets.length}</span>`,
    `<span>Logs: ${zoneLogs.length}</span>`,
    `<span>Total logged time: ${minutesLabel(total)}</span>`,
    `<span>Average logged job: ${minutesLabel(avg)}</span>`
  ].join('');
}

function setZoneVisited(zoneId, timestamp = Date.now()) {
  state.zoneStatus[zoneId] ||= { lastVisited: null, lastCompleted: null, completedCount: 0 };
  state.zoneStatus[zoneId].lastVisited = timestamp;
}

function setZoneComplete(zoneId, timestamp = Date.now()) {
  state.zoneStatus[zoneId] ||= { lastVisited: null, lastCompleted: null, completedCount: 0 };
  state.zoneStatus[zoneId].lastVisited = timestamp;
  state.zoneStatus[zoneId].lastCompleted = timestamp;
  state.zoneStatus[zoneId].completedCount += 1;
}

function addWaypointMarker(waypoint) {
  const marker = L.marker([waypoint.lat, waypoint.lng]);
  marker.bindPopup(`<strong>${escapeHtml(waypoint.name)}</strong><br>${waypoint.lat.toFixed(6)}, ${waypoint.lng.toFixed(6)}<br>${new Date(waypoint.timestamp).toLocaleString()}`);
  marker.addTo(waypointLayer);
}

function addAssetMarker(asset) {
  const marker = L.circleMarker([asset.lat, asset.lng], {
    radius: 8,
    weight: 2,
    color: '#facc15',
    fillColor: '#facc15',
    fillOpacity: 0.85
  });
  marker.bindPopup([
    `<strong>${escapeHtml(asset.name)}</strong>`,
    `<span>${escapeHtml(labelFor(ASSET_TYPES, asset.type))}</span>`,
    `<span>${escapeHtml(zoneLabel(asset.zoneId))}</span>`,
    `<span>Last visited: ${daysAgo(asset.lastVisited)}</span>`,
    asset.notes ? `<span>${escapeHtml(asset.notes)}</span>` : ''
  ].filter(Boolean).join('<br>'));
  marker.addTo(assetLayer);
}

function redrawAssets() {
  assetLayer.clearLayers();
  state.assets.forEach(addAssetMarker);
}

function addDrawnTrail(trail) {
  const stats = trailStats(trail.id);
  const line = L.polyline(trail.points.map(toLatLng), {
    weight: 5,
    opacity: 0.9,
    color: '#22c55e',
    dashArray: trail.mode === 'freehand' ? null : '8 6'
  });
  line.bindPopup([
    `<strong>${escapeHtml(trail.name)}</strong>`,
    `<span>${escapeHtml(zoneLabel(trail.zoneId))}</span>`,
    `<span>${trail.mode === 'freehand' ? 'Freehand' : 'Point-to-point'}</span>`,
    `<span>${trail.points.length} points</span>`,
    `<span>Estimated: ${minutesLabel(trail.estimatedMinutes)}</span>`,
    `<span>Average actual: ${minutesLabel(stats.averageMinutes)}</span>`,
    `<span>Last worked: ${daysAgo(stats.lastWorked)}</span>`
  ].join('<br>'));
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
  state.waypoints.forEach(addWaypointMarker);
  redrawAssets();
  redrawDrawnTrails();
  const latLngs = [
    ...state.track.map(toLatLng),
    ...state.waypoints.map(toLatLng),
    ...state.assets.map(toLatLng),
    ...state.drawnTrails.flatMap((trail) => trail.points.map(toLatLng))
  ];
  if (latLngs.length) map.fitBounds(L.latLngBounds(latLngs), { padding: [24, 24], maxZoom: 17 });
  updateCounts();
  updateZoneSummary();
  renderRecentSaves();
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
    setStatus('Point drawing: tap trail corners', 'warn');
  } else {
    setStatus('Freehand drawing: drag on map', 'warn');
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

  const defaultName = `${zoneLabel(selectedZoneId())} Trail ${state.drawnTrails.length + 1}`;
  const name = window.prompt('Trail / road stretch name:', defaultName);
  if (name === null) return;

  const estimateText = window.prompt('Estimated minutes to clear/drive/work this stretch:', '');
  const estimatedMinutes = estimateText === null || estimateText.trim() === '' ? null : Number(estimateText);

  const trail = {
    id: `trail-${Date.now()}`,
    name: name.trim() || defaultName,
    mode: drawMode || 'point',
    zoneId: selectedZoneId(),
    estimatedMinutes: Number.isFinite(estimatedMinutes) ? estimatedMinutes : null,
    timestamp: Date.now(),
    points: normalizeTrack(activeDrawPoints)
  };

  state.drawnTrails.push(trail);
  addDrawnTrail(trail);
  updateTrailSelect();
  updateCounts();
  updateZoneSummary();
  saveRecord('Trail', trail.name, `Estimated ${minutesLabel(trail.estimatedMinutes)} • ${trail.points.length} points`, trail.zoneId);
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

function addAssetAtCurrentLocation() {
  const source = lastPoint || map.getCenter();
  const point = Array.isArray(source) ? { lat: source[0], lng: source[1] } : { lat: source.lat, lng: source.lng };
  const type = el.assetTypeSelect.value;
  const defaultName = `${labelFor(ASSET_TYPES, type)} ${state.assets.length + 1}`;
  const name = window.prompt('Asset marker name:', defaultName);
  if (name === null) return;
  const notes = window.prompt('Notes for this marker:', '') ?? '';

  const asset = {
    id: `asset-${Date.now()}`,
    type,
    zoneId: selectedZoneId(),
    name: name.trim() || defaultName,
    notes,
    lat: point.lat,
    lng: point.lng,
    timestamp: Date.now(),
    lastVisited: null
  };

  state.assets.push(asset);
  addAssetMarker(asset);
  updateCounts();
  updateZoneSummary();
  saveRecord('Asset', asset.name, `${labelFor(ASSET_TYPES, asset.type)}${asset.notes ? ` • ${asset.notes}` : ''}`, asset.zoneId);
  setStatus('Asset marker saved', 'ok');
}

function markZoneVisited() {
  const zoneId = selectedZoneId();
  const now = Date.now();
  setZoneVisited(zoneId, now);
  addLog({ timestamp: now, zoneId, workType: 'scouting', notes: 'Zone marked visited' });
  saveRecord('Visited', zoneLabel(zoneId), 'Zone marked visited', zoneId);
  updateZoneSummary();
  setStatus(`${zoneLabel(zoneId)} marked visited`, 'ok');
}

function markZoneComplete() {
  const zoneId = selectedZoneId();
  const now = Date.now();
  const notes = window.prompt('Completion notes:', '') ?? '';
  setZoneComplete(zoneId, now);
  addLog({ timestamp: now, zoneId, workType: selectedWorkType(), completed: true, notes: notes || 'Zone marked complete' });
  saveRecord('Complete', zoneLabel(zoneId), notes || 'Zone marked complete', zoneId);
  updateZoneSummary();
  setStatus(`${zoneLabel(zoneId)} marked complete`, 'ok');
}

function startWorkTimer() {
  if (activeWork) return;
  activeWork = {
    startTime: Date.now(),
    zoneId: selectedZoneId(),
    trailId: selectedTrailId(),
    workType: selectedWorkType()
  };
  el.startWorkBtn.disabled = true;
  el.stopWorkBtn.disabled = false;
  setStatus(`Timer running: ${zoneLabel(activeWork.zoneId)}`, 'warn');
}

function stopWorkTimer() {
  if (!activeWork) return;
  const endTime = Date.now();
  const durationMinutes = (endTime - activeWork.startTime) / 60000;
  const trail = trailById(activeWork.trailId);
  const notes = window.prompt('Work notes:', trail ? `Worked ${trail.name}` : '') ?? '';
  setZoneVisited(activeWork.zoneId, endTime);

  addLog({
    timestamp: endTime,
    startTime: activeWork.startTime,
    endTime,
    zoneId: activeWork.zoneId,
    trailId: activeWork.trailId,
    workType: activeWork.workType,
    durationMinutes,
    notes
  });

  saveRecord(
    'Work',
    trail ? trail.name : labelFor(WORK_TYPES, activeWork.workType),
    `${labelFor(WORK_TYPES, activeWork.workType)} • ${minutesLabel(durationMinutes)}${notes ? ` • ${notes}` : ''}`,
    activeWork.zoneId
  );

  activeWork = null;
  el.startWorkBtn.disabled = false;
  el.stopWorkBtn.disabled = true;
  redrawDrawnTrails();
  updateZoneSummary();
  setStatus(`Work saved: ${minutesLabel(durationMinutes)}`, 'ok');
}

function addManualLogNote() {
  const notes = window.prompt('Log note:', '') ?? '';
  if (!notes.trim()) return;
  const minutesText = window.prompt('Minutes spent, blank if not timed:', '');
  const durationMinutes = minutesText.trim() === '' ? null : Number(minutesText);
  const zoneId = selectedZoneId();
  const timestamp = Date.now();
  setZoneVisited(zoneId, timestamp);
  addLog({
    timestamp,
    zoneId,
    trailId: selectedTrailId(),
    workType: selectedWorkType(),
    durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
    notes
  });
  redrawDrawnTrails();
  saveRecord('Log', labelFor(WORK_TYPES, selectedWorkType()), `${minutesLabel(durationMinutes)} • ${notes}`, zoneId);
  setStatus('Log note saved', 'ok');
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
  addWaypointMarker(waypoint);
  updateCounts();
  saveRecord('Waypoint', waypoint.name, `${waypoint.lat.toFixed(6)}, ${waypoint.lng.toFixed(6)}`, selectedZoneId());
  setStatus('Waypoint saved', 'ok');
});

el.clearTrackBtn.addEventListener('click', () => {
  if (!state.track.length) return;
  if (!window.confirm('Clear the recorded GPS track from this browser? Waypoints, assets, logs, and drawn trails will stay.')) return;
  state.track = [];
  trackLayer.setLatLngs([]);
  updateCounts();
  saveState();
  setStatus('GPS track cleared', 'warn');
});

el.zoneSelect.addEventListener('change', () => {
  updateTrailSelect();
  updateZoneSummary();
});
el.trailSelect.addEventListener('change', updateZoneSummary);
el.addAssetBtn.addEventListener('click', addAssetAtCurrentLocation);
el.markVisitedBtn.addEventListener('click', markZoneVisited);
el.markCompleteBtn.addEventListener('click', markZoneComplete);
el.startWorkBtn.addEventListener('click', startWorkTimer);
el.stopWorkBtn.addEventListener('click', stopWorkTimer);
el.addLogBtn.addEventListener('click', addManualLogNote);

el.freehandBtn.addEventListener('click', () => startDrawMode('freehand'));
el.pointDrawBtn.addEventListener('click', () => startDrawMode('point'));
el.finishDrawBtn.addEventListener('click', finishDrawMode);
el.undoDrawBtn.addEventListener('click', undoDrawPoint);
el.cancelDrawBtn.addEventListener('click', cancelDrawMode);
el.clearDrawnBtn.addEventListener('click', () => {
  if (!state.drawnTrails.length) return;
  if (!window.confirm('Clear all manually drawn trails from this browser? GPS track, assets, logs, and waypoints will stay.')) return;
  state.drawnTrails = [];
  drawnTrailLayer.clearLayers();
  updateTrailSelect();
  updateCounts();
  saveState();
  updateDrawButtons();
  updateZoneSummary();
  setStatus('Drawn trails cleared', 'warn');
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

populateStaticControls();
if (!window.isSecureContext) setStatus('GPS needs HTTPS or localhost', 'error');
else if (!navigator.geolocation) setStatus('GPS unavailable in this browser', 'error');
else setStatus('Ready', 'ok');

setFollowMode(true);
initSavedLayers();
updateDrawButtons();
