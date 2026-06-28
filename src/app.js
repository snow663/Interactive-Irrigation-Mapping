const DEFAULT_CENTER = [44.6714, -103.8522];
const DEFAULT_ZOOM = 13;
const STORAGE_KEY = 'interactive-irrigation-map-v6';
const LEGACY_KEYS = ['interactive-irrigation-map-v5', 'interactive-irrigation-map-v4', 'interactive-irrigation-map-v3', 'interactive-irrigation-map-v2', 'interactive-irrigation-map-v1'];
const MAX_TRACK_POINTS = 20000;
const MAX_RECENT_SAVES = 10;
const MIN_DRAW_DISTANCE_METERS = 2;
const MPS_TO_MPH = 2.2369362921;
const EARTH_RADIUS_METERS = 6371008.8;
const DEFAULT_FIELD_SPEED_MPH = 25;

const ZONES = [['ride1','Ride 1'],['ride2','Ride 2'],['ride4','Ride 4'],['ride5','Ride 5'],['ride6','Ride 6'],['ride7','Ride 7'],['ride8','Ride 8'],['ride10','Ride 10']];
const ASSET_TYPES = [['head-gate','Head gate'],['valve','Valve'],['box','Box'],['check','Check'],['culvert','Culvert'],['crossing','Crossing'],['washout','Washout'],['spray-area','Spray area'],['hazard','Hazard'],['problem','Problem spot'],['poi','POI'],['note','Note']];
const WORK_TYPES = [['road-clearing','Road clearing'],['mowing','Mowing'],['spraying','Spraying'],['brush','Brush / POI / hazard cutting'],['scouting','Scouting / inspection'],['repair','Repair / maintenance'],['ditch-rider-support','Ditch rider support'],['drive-time','Drive time'],['other','Other']];
const DEFAULT_BRUSH_TYPES = new Set(['head-gate','check','valve','washout','hazard','problem','poi']);

const $ = (id) => document.getElementById(id);
const el = {
  status: $('connectionStatus'), installBtn: $('installBtn'), panelToggleBtn: $('panelToggleBtn'), legendToggleBtn: $('legendToggleBtn'),
  controlPanel: $('controlPanel'), legendPanel: $('legendPanel'), gpsBtn: $('gpsBtn'), followBtn: $('followBtn'), wakeBtn: $('wakeBtn'), waypointBtn: $('waypointBtn'), clearTrackBtn: $('clearTrackBtn'),
  showMowingCheck: $('showMowingCheck'), showSprayingCheck: $('showSprayingCheck'), showBrushCheck: $('showBrushCheck'),
  availableHoursInput: $('availableHoursInput'), planTypeSelect: $('planTypeSelect'), nearestOmBtn: $('nearestOmBtn'), planDayBtn: $('planDayBtn'), logisticsOutput: $('logisticsOutput'),
  zoneSelect: $('zoneSelect'), trailSelect: $('trailSelect'), assetTypeSelect: $('assetTypeSelect'), workTypeSelect: $('workTypeSelect'), assetNeedsBrushCheck: $('assetNeedsBrushCheck'), zoneSummary: $('zoneSummary'),
  addAssetBtn: $('addAssetBtn'), markVisitedBtn: $('markVisitedBtn'), markCompleteBtn: $('markCompleteBtn'), startWorkBtn: $('startWorkBtn'), stopWorkBtn: $('stopWorkBtn'), addLogBtn: $('addLogBtn'), recentList: $('recentList'),
  trailMowingCheck: $('trailMowingCheck'), trailSprayingCheck: $('trailSprayingCheck'), trailOmRoadCheck: $('trailOmRoadCheck'), trailDailyTravelCheck: $('trailDailyTravelCheck'),
  freehandBtn: $('freehandBtn'), pointDrawBtn: $('pointDrawBtn'), finishDrawBtn: $('finishDrawBtn'), undoDrawBtn: $('undoDrawBtn'), cancelDrawBtn: $('cancelDrawBtn'), clearDrawnBtn: $('clearDrawnBtn'), drawHelp: $('drawHelp'), geojsonInput: $('geojsonInput'),
  lat: $('latReadout'), lng: $('lngReadout'), accuracy: $('accuracyReadout'), speed: $('speedReadout'), heading: $('headingReadout'), altitude: $('altitudeReadout'),
  trackCount: $('trackCount'), drawnCount: $('drawnCount'), assetCount: $('assetCount'), logCount: $('logCount'), waypointCount: $('waypointCount')
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
const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, attribution: '&copy; OpenStreetMap contributors' });
const imageryLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' });
streetLayer.addTo(map);
L.control.layers({ Streets: streetLayer, Imagery: imageryLayer }, {}, { position: 'topright' }).addTo(map);

const trackLayer = L.polyline([], { weight: 4, opacity: 0.9, color: '#2563eb' }).addTo(map);
const waypointLayer = L.layerGroup().addTo(map);
const assetLayer = L.layerGroup().addTo(map);
const mowingLayer = L.layerGroup().addTo(map);
const sprayingLayer = L.layerGroup().addTo(map);
const flagLayer = L.layerGroup().addTo(map);
const brushLayer = L.layerGroup().addTo(map);
const untaggedTrailLayer = L.layerGroup().addTo(map);
const draftDrawLayer = L.layerGroup().addTo(map);
const importedLayer = L.layerGroup().addTo(map);
const logisticsLayer = L.layerGroup().addTo(map);

const gpsIcon = L.divIcon({ className: 'gps-location-icon', html: '<div class="gps-arrow"></div><div class="gps-dot"></div>', iconSize: [44,44], iconAnchor: [22,22] });
const locationMarker = L.marker(DEFAULT_CENTER, { icon: gpsIcon, interactive: false });
const accuracyCircle = L.circle(DEFAULT_CENTER, { radius: 0, stroke: true, weight: 1, opacity: 0.7, fillOpacity: 0.12, color: '#0ea5e9', fillColor: '#0ea5e9' });

function setStatus(message, level = 'neutral') { el.status.textContent = message; el.status.dataset.level = level; }
function toRadians(degrees) { return (degrees * Math.PI) / 180; }
function toDegrees(radians) { return (radians * 180) / Math.PI; }
function cleanNumber(value) { return Number.isFinite(value) ? value : null; }
function toLatLng(point) { return [point.lat, point.lng]; }
function pointFromLatLng(latLng) { return { lat: latLng.lat, lng: latLng.lng }; }
function sourcePoint() { return lastPoint || pointFromLatLng(map.getCenter()); }
function distanceMeters(a, b) {
  const lat1 = toRadians(a.lat), lat2 = toRadians(b.lat), dLat = toRadians(b.lat - a.lat), dLng = toRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}
function bearingDegrees(a, b) {
  const lat1 = toRadians(a.lat), lat2 = toRadians(b.lat), dLng = toRadians(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}
function formatNumber(value, digits = 2, suffix = '') { return Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : '--'; }
function formatDistance(meters) { const feet = meters * 3.28084; return feet < 5280 ? `${feet.toFixed(0)} ft` : `${(feet / 5280).toFixed(2)} mi`; }
function minutesLabel(minutes) { if (!Number.isFinite(minutes)) return '--'; if (minutes < 60) return `${minutes.toFixed(0)} min`; const h = Math.floor(minutes / 60), m = Math.round(minutes % 60); return m ? `${h}h ${m}m` : `${h}h`; }
function daysAgo(timestamp) { if (!Number.isFinite(timestamp)) return 'never'; const d = Math.floor((Date.now() - timestamp) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; }
function average(values) { const clean = values.filter(Number.isFinite); return clean.length ? clean.reduce((s,v)=>s+v,0)/clean.length : null; }

function normalizePosition(position) {
  const c = position.coords;
  const point = { lat: c.latitude, lng: c.longitude, accuracy: cleanNumber(c.accuracy), altitude: cleanNumber(c.altitude), altitudeAccuracy: cleanNumber(c.altitudeAccuracy), heading: cleanNumber(c.heading), speedMps: cleanNumber(c.speed), timestamp: position.timestamp || Date.now() };
  if (lastPoint) {
    const dt = Math.max(0, (point.timestamp - lastPoint.timestamp) / 1000), dist = distanceMeters(lastPoint, point);
    if (!Number.isFinite(point.speedMps) && dt > 0.5 && dist > 0.5) point.speedMps = dist / dt;
    if (!Number.isFinite(point.heading) && dist > 2) point.heading = bearingDegrees(lastPoint, point);
  }
  point.speedMph = Number.isFinite(point.speedMps) ? point.speedMps * MPS_TO_MPH : null;
  return point;
}
function updateReadouts(point) {
  el.lat.textContent = formatNumber(point.lat, 6); el.lng.textContent = formatNumber(point.lng, 6);
  el.accuracy.textContent = Number.isFinite(point.accuracy) ? `${(point.accuracy * 3.28084).toFixed(0)} ft` : '--';
  el.speed.textContent = formatNumber(point.speedMph, 1, ' mph'); el.heading.textContent = Number.isFinite(point.heading) ? `${point.heading.toFixed(0)}°` : '--';
  el.altitude.textContent = Number.isFinite(point.altitude) ? `${(point.altitude * 3.28084).toFixed(0)} ft` : '--';
}
function updateCounts() {
  el.trackCount.textContent = `${state.track.length} GPS point${state.track.length === 1 ? '' : 's'}`;
  el.drawnCount.textContent = `${state.drawnTrails.length} drawn trail${state.drawnTrails.length === 1 ? '' : 's'}`;
  el.assetCount.textContent = `${state.assets.length} asset${state.assets.length === 1 ? '' : 's'}`;
  el.logCount.textContent = `${state.logs.length} log${state.logs.length === 1 ? '' : 's'}`;
  el.waypointCount.textContent = `${state.waypoints.length} waypoint${state.waypoints.length === 1 ? '' : 's'}`;
}
function ensureGpsLayers() { if (!map.hasLayer(accuracyCircle)) accuracyCircle.addTo(map); if (!map.hasLayer(locationMarker)) locationMarker.addTo(map); }
function updateMapPosition(point, addTrackPoint = false) {
  ensureGpsLayers(); const latLng = toLatLng(point); locationMarker.setLatLng(latLng); accuracyCircle.setLatLng(latLng); accuracyCircle.setRadius(Number.isFinite(point.accuracy) ? point.accuracy : 0);
  const markerElement = locationMarker.getElement();
  if (markerElement) { markerElement.style.setProperty('--heading', `${Number.isFinite(point.heading) ? point.heading : 0}deg`); markerElement.classList.toggle('has-heading', Number.isFinite(point.heading)); }
  if (addTrackPoint) trackLayer.addLatLng(latLng);
  if (followMode) map.setView(latLng, Math.max(map.getZoom(), 17), { animate: true });
}
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveState, 300); }
function recordPoint(position) {
  const point = normalizePosition(position); lastPoint = point; state.track.push(point);
  if (state.track.length > MAX_TRACK_POINTS) { state.track = state.track.slice(-MAX_TRACK_POINTS); trackLayer.setLatLngs(state.track.map(toLatLng)); }
  updateMapPosition(point, true); updateReadouts(point); updateCounts(); scheduleSave(); setStatus('GPS active', 'ok');
}
function handleGpsError(error) { const messages = {1:'Location permission was denied.',2:'Location is unavailable. Move outside or enable device GPS.',3:'GPS timed out before a fresh fix arrived.'}; setStatus(messages[error.code] || error.message || 'GPS failed.', 'error'); }
function startGps() {
  if (!navigator.geolocation) return setStatus('GPS unavailable in this browser', 'error');
  if (!window.isSecureContext) return setStatus('GPS needs HTTPS or localhost', 'error');
  if (watchId !== null) return;
  setStatus('Waiting for GPS lock', 'warn'); watchId = navigator.geolocation.watchPosition(recordPoint, handleGpsError, { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }); el.gpsBtn.textContent = 'Stop GPS';
}
function stopGps() { if (watchId === null) return; navigator.geolocation.clearWatch(watchId); watchId = null; el.gpsBtn.textContent = 'Use My Location'; setStatus('GPS stopped', 'warn'); }
async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return setStatus('Wake lock is not supported here', 'warn'), false;
  try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { if (wakeRequested) el.wakeBtn.textContent = 'Keep Screen Awake'; }); el.wakeBtn.textContent = 'Screen Awake: On'; return true; }
  catch (error) { setStatus(error.message || 'Wake lock failed', 'warn'); return false; }
}
async function releaseWakeLock() { if (!wakeLock) return; const lock = wakeLock; wakeLock = null; await lock.release().catch(() => {}); el.wakeBtn.textContent = 'Keep Screen Awake'; }

function safeParse(json, fallback) { try { return JSON.parse(json) ?? fallback; } catch { return fallback; } }
function zoneExists(zoneId) { return ZONES.some(([id]) => id === zoneId); }
function assetTypeExists(type) { return ASSET_TYPES.some(([id]) => id === type); }
function workTypeExists(type) { return WORK_TYPES.some(([id]) => id === type); }
function labelFor(list, value) { return list.find(([id]) => id === value)?.[1] || value || 'None'; }
function zoneLabel(zoneId) { return labelFor(ZONES, zoneId); }
function selectedZoneId() { return el.zoneSelect.value || 'ride1'; }
function selectedTrailId() { return el.trailSelect.value || ''; }
function selectedWorkType() { return el.workTypeSelect.value || 'other'; }

function normalizeTrack(points = []) {
  return points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)).map((p) => ({ lat: Number(p.lat), lng: Number(p.lng), accuracy: Number.isFinite(p.accuracy) ? p.accuracy : null, altitude: Number.isFinite(p.altitude) ? p.altitude : null, heading: Number.isFinite(p.heading) ? p.heading : null, speedMps: Number.isFinite(p.speedMps) ? p.speedMps : null, speedMph: Number.isFinite(p.speedMph) ? p.speedMph : null, timestamp: Number.isFinite(p.timestamp) ? p.timestamp : Date.now() })).slice(-MAX_TRACK_POINTS);
}
function normalizeWaypoints(points = []) { return points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)).map((p,i) => ({ id: p.id || `wp-${Date.now()}-${i}`, name: String(p.name || `Waypoint ${i+1}`), lat: Number(p.lat), lng: Number(p.lng), timestamp: Number.isFinite(p.timestamp) ? p.timestamp : Date.now() })); }
function normalizeTrailOverlays(trail = {}) { const old = !trail.overlays && !('mowing' in trail) && !('spraying' in trail); return { mowing: Boolean(trail.overlays?.mowing ?? trail.mowing ?? old), spraying: Boolean(trail.overlays?.spraying ?? trail.spraying ?? false) }; }
function normalizeTrailFlags(trail = {}) { return { omRoad: Boolean(trail.flags?.omRoad ?? trail.omRoad ?? true), dailyTravel: Boolean(trail.flags?.dailyTravel ?? trail.dailyTravel ?? trail.overlays?.dailyTravel ?? false) }; }
function normalizeDrawnTrails(trails = []) {
  return trails.map((t,i) => ({ id: t.id || `trail-${Date.now()}-${i}`, name: String(t.name || `Drawn Trail ${i+1}`), mode: t.mode === 'freehand' ? 'freehand' : 'point', zoneId: zoneExists(t.zoneId) ? t.zoneId : 'ride1', overlays: normalizeTrailOverlays(t), flags: normalizeTrailFlags(t), estimatedMinutes: Number.isFinite(t.estimatedMinutes) ? Number(t.estimatedMinutes) : null, timestamp: Number.isFinite(t.timestamp) ? t.timestamp : Date.now(), points: normalizeTrack(t.points || []) })).filter((t) => t.points.length >= 2);
}
function normalizeAssets(assets = []) {
  return assets.filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng)).map((a,i) => { const type = assetTypeExists(a.type) ? a.type : 'note'; return { id: a.id || `asset-${Date.now()}-${i}`, type, zoneId: zoneExists(a.zoneId) ? a.zoneId : 'ride1', name: String(a.name || `Asset ${i+1}`), notes: String(a.notes || ''), needsBrush: Boolean(a.needsBrush ?? a.needsClearing ?? DEFAULT_BRUSH_TYPES.has(type)), lat: Number(a.lat), lng: Number(a.lng), timestamp: Number.isFinite(a.timestamp) ? a.timestamp : Date.now(), lastVisited: Number.isFinite(a.lastVisited) ? a.lastVisited : null }; });
}
function normalizeLogs(logs = []) { return logs.map((l,i) => ({ id: l.id || `log-${Date.now()}-${i}`, timestamp: Number.isFinite(l.timestamp) ? l.timestamp : Date.now(), startTime: Number.isFinite(l.startTime) ? l.startTime : null, endTime: Number.isFinite(l.endTime) ? l.endTime : null, zoneId: zoneExists(l.zoneId) ? l.zoneId : 'ride1', trailId: l.trailId || '', assetId: l.assetId || '', workType: workTypeExists(l.workType) ? l.workType : 'other', durationMinutes: Number.isFinite(l.durationMinutes) ? Number(l.durationMinutes) : null, completed: Boolean(l.completed), notes: String(l.notes || '') })); }
function normalizeZoneStatus(status = {}) { const r = {}; for (const [z] of ZONES) { const v = status[z] || {}; r[z] = { lastVisited: Number.isFinite(v.lastVisited) ? v.lastVisited : null, lastCompleted: Number.isFinite(v.lastCompleted) ? v.lastCompleted : null, completedCount: Number.isFinite(v.completedCount) ? v.completedCount : 0 }; } return r; }
function normalizeRecentSaves(items = []) { return items.map((x,i) => ({ id: x.id || `recent-${Date.now()}-${i}`, timestamp: Number.isFinite(x.timestamp) ? x.timestamp : Date.now(), type: String(x.type || 'Saved'), zoneId: zoneExists(x.zoneId) ? x.zoneId : '', title: String(x.title || 'Saved record'), details: String(x.details || '') })).sort((a,b) => b.timestamp - a.timestamp).slice(0, MAX_RECENT_SAVES); }
function loadState() {
  let saved = safeParse(localStorage.getItem(STORAGE_KEY), null);
  for (const key of LEGACY_KEYS) { if (saved) break; saved = safeParse(localStorage.getItem(key), null); }
  saved ||= {};
  return { track: normalizeTrack(saved.track), waypoints: normalizeWaypoints(saved.waypoints), drawnTrails: normalizeDrawnTrails(saved.drawnTrails), assets: normalizeAssets(saved.assets), logs: normalizeLogs(saved.logs), zoneStatus: normalizeZoneStatus(saved.zoneStatus), recentSaves: normalizeRecentSaves(saved.recentSaves) };
}
function saveState() {
  state = { track: normalizeTrack(state.track), waypoints: normalizeWaypoints(state.waypoints), drawnTrails: normalizeDrawnTrails(state.drawnTrails), assets: normalizeAssets(state.assets), logs: normalizeLogs(state.logs), zoneStatus: normalizeZoneStatus(state.zoneStatus), recentSaves: normalizeRecentSaves(state.recentSaves) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function saveRecord(type, title, details = '', zoneId = selectedZoneId()) { state.recentSaves.unshift({ id: `recent-${Date.now()}`, timestamp: Date.now(), type, zoneId, title, details }); state.recentSaves = normalizeRecentSaves(state.recentSaves); saveState(); renderRecentSaves(); }
function renderRecentSaves() {
  el.recentList.innerHTML = '';
  if (!state.recentSaves.length) { const empty = document.createElement('li'); empty.className = 'empty-recent'; empty.textContent = 'No saved records yet.'; el.recentList.append(empty); return; }
  for (const item of state.recentSaves.slice(0, MAX_RECENT_SAVES)) { const li = document.createElement('li'); li.innerHTML = [`<strong>${escapeHtml(item.type)}: ${escapeHtml(item.title)}</strong>`, `<span>${escapeHtml(item.zoneId ? zoneLabel(item.zoneId) : 'No zone')} • ${new Date(item.timestamp).toLocaleString()}</span>`, item.details ? `<small>${escapeHtml(item.details)}</small>` : ''].filter(Boolean).join(''); el.recentList.append(li); }
}

function populateSelect(select, options) { select.innerHTML = ''; for (const [value,label] of options) { const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option); } }
function overlayLabelList(overlays = {}) { const labels = []; if (overlays.mowing) labels.push('Mowing'); if (overlays.spraying) labels.push('Spraying'); return labels.length ? labels : ['No work overlay']; }
function flagLabelList(flags = {}) { const labels = []; if (flags.omRoad) labels.push('O/M road'); if (flags.dailyTravel) labels.push('Daily rider travel'); return labels; }
function selectedTrailOverlays() { const overlays = { mowing: Boolean(el.trailMowingCheck.checked), spraying: Boolean(el.trailSprayingCheck.checked) }; if (!overlays.mowing && !overlays.spraying) overlays.mowing = true; return overlays; }
function selectedTrailFlags() { return { omRoad: Boolean(el.trailOmRoadCheck.checked), dailyTravel: Boolean(el.trailDailyTravelCheck.checked) }; }
function populateStaticControls() { populateSelect(el.zoneSelect, ZONES); populateSelect(el.assetTypeSelect, ASSET_TYPES); populateSelect(el.workTypeSelect, WORK_TYPES); updateTrailSelect(); }
function updateTrailSelect() {
  const zoneId = selectedZoneId(); el.trailSelect.innerHTML = '';
  const general = document.createElement('option'); general.value = ''; general.textContent = `General ${zoneLabel(zoneId)} work`; el.trailSelect.append(general);
  for (const trail of state.drawnTrails.filter((t) => t.zoneId === zoneId)) { const option = document.createElement('option'); option.value = trail.id; option.textContent = `${trail.name} (${[...overlayLabelList(trail.overlays), ...flagLabelList(trail.flags)].join(' + ')})`; el.trailSelect.append(option); }
}

function addLog(entry) { const log = { id: `log-${Date.now()}`, timestamp: Date.now(), startTime: null, endTime: null, zoneId: selectedZoneId(), trailId: '', assetId: '', workType: selectedWorkType(), durationMinutes: null, completed: false, notes: '', ...entry }; state.logs.push(log); saveState(); updateCounts(); updateZoneSummary(); return log; }
function trailById(id) { return state.drawnTrails.find((t) => t.id === id); }
function trailStats(id) { const logs = state.logs.filter((l) => l.trailId === id && Number.isFinite(l.durationMinutes)); return { logs, averageMinutes: average(logs.map((l) => l.durationMinutes)), lastWorked: logs.length ? Math.max(...logs.map((l) => l.timestamp)) : null }; }
function updateZoneSummary() {
  const zoneId = selectedZoneId(), status = state.zoneStatus[zoneId] || {}, zoneLogs = state.logs.filter((l)=>l.zoneId===zoneId), zoneTrails = state.drawnTrails.filter((t)=>t.zoneId===zoneId), zoneAssets = state.assets.filter((a)=>a.zoneId===zoneId);
  const durationLogs = zoneLogs.filter((l)=>Number.isFinite(l.durationMinutes)); const avg = average(durationLogs.map((l)=>l.durationMinutes)); const total = durationLogs.reduce((s,l)=>s+l.durationMinutes,0);
  const mowing = zoneTrails.filter((t)=>t.overlays.mowing).length, spraying = zoneTrails.filter((t)=>t.overlays.spraying).length, daily = zoneTrails.filter((t)=>t.flags.dailyTravel).length, om = zoneTrails.filter((t)=>t.flags.omRoad).length, brush = zoneAssets.filter((a)=>a.needsBrush).length;
  el.zoneSummary.innerHTML = [`<strong>${zoneLabel(zoneId)}</strong>`,`<span>Last visited: ${daysAgo(status.lastVisited)}</span>`,`<span>Last completed: ${daysAgo(status.lastCompleted)}</span>`,`<span>Completions: ${status.completedCount || 0}</span>`,`<span>O/M roads: ${om}</span>`,`<span>Daily travel: ${daily}</span>`,`<span>Mowing stretches: ${mowing}</span>`,`<span>Spray stretches: ${spraying}</span>`,`<span>Brush/POI/hazard points: ${brush}</span>`,`<span>Assets: ${zoneAssets.length}</span>`,`<span>Logs: ${zoneLogs.length}</span>`,`<span>Total logged time: ${minutesLabel(total)}</span>`,`<span>Average logged job: ${minutesLabel(avg)}</span>`].join('');
}
function setZoneVisited(zoneId, timestamp = Date.now()) { state.zoneStatus[zoneId] ||= { lastVisited: null, lastCompleted: null, completedCount: 0 }; state.zoneStatus[zoneId].lastVisited = timestamp; }
function setZoneComplete(zoneId, timestamp = Date.now()) { state.zoneStatus[zoneId] ||= { lastVisited: null, lastCompleted: null, completedCount: 0 }; state.zoneStatus[zoneId].lastVisited = timestamp; state.zoneStatus[zoneId].lastCompleted = timestamp; state.zoneStatus[zoneId].completedCount += 1; }

function addWaypointMarker(wp) { const m = L.marker([wp.lat, wp.lng]); m.bindPopup(`<strong>${escapeHtml(wp.name)}</strong><br>${wp.lat.toFixed(6)}, ${wp.lng.toFixed(6)}<br>${new Date(wp.timestamp).toLocaleString()}`); m.addTo(waypointLayer); }
function assetPopup(asset) { return [`<strong>${escapeHtml(asset.name)}</strong>`,`<span>${escapeHtml(labelFor(ASSET_TYPES, asset.type))}</span>`,`<span>${escapeHtml(zoneLabel(asset.zoneId))}</span>`,`<span>${asset.needsBrush ? 'Needs brush / hazard cutting' : 'No brush flag'}</span>`,`<span>Last visited: ${daysAgo(asset.lastVisited)}</span>`, asset.notes ? `<span>${escapeHtml(asset.notes)}</span>` : ''].filter(Boolean).join('<br>'); }
function addAssetMarker(asset) { const marker = L.circleMarker([asset.lat, asset.lng], { radius: 6, weight: 2, color: '#facc15', fillColor: '#facc15', fillOpacity: 0.8 }); marker.bindPopup(assetPopup(asset)); marker.addTo(assetLayer); }
function addBrushMarker(asset) { const marker = L.circleMarker([asset.lat, asset.lng], { radius: 10, weight: 3, color: '#ef4444', fillColor: '#f97316', fillOpacity: 0.86 }); marker.bindPopup(assetPopup(asset)); marker.addTo(brushLayer); }
function redrawAssets() { assetLayer.clearLayers(); brushLayer.clearLayers(); for (const asset of state.assets) { if (asset.needsBrush && el.showBrushCheck.checked) addBrushMarker(asset); else if (!asset.needsBrush) addAssetMarker(asset); } }

function trailPopup(trail) { const stats = trailStats(trail.id); return [`<strong>${escapeHtml(trail.name)}</strong>`,`<span>${escapeHtml(zoneLabel(trail.zoneId))}</span>`,`<span>Overlays: ${escapeHtml(overlayLabelList(trail.overlays).join(' + '))}</span>`,`<span>Flags: ${escapeHtml(flagLabelList(trail.flags).join(' + ') || 'none')}</span>`,`<span>${trail.mode === 'freehand' ? 'Freehand' : 'Point-to-point'}</span>`,`<span>${trail.points.length} points</span>`,`<span>Estimated: ${minutesLabel(trail.estimatedMinutes)}</span>`,`<span>Average actual: ${minutesLabel(stats.averageMinutes)}</span>`,`<span>Last worked: ${daysAgo(stats.lastWorked)}</span>`].join('<br>'); }
function addTrailLine(trail, layer, options) { const line = L.polyline(trail.points.map(toLatLng), options); line.bindPopup(trailPopup(trail)); line.addTo(layer); }
function redrawWorkOverlays() {
  mowingLayer.clearLayers(); sprayingLayer.clearLayers(); flagLayer.clearLayers(); untaggedTrailLayer.clearLayers();
  for (const trail of state.drawnTrails) {
    const both = trail.overlays.mowing && trail.overlays.spraying;
    let visible = false;
    if (both && el.showMowingCheck.checked && el.showSprayingCheck.checked) { addTrailLine(trail, mowingLayer, { weight: 9, opacity: 0.72, color: '#14b8a6' }); visible = true; }
    else {
      if (trail.overlays.mowing && el.showMowingCheck.checked) { addTrailLine(trail, mowingLayer, { weight: 8, opacity: 0.58, color: '#22c55e' }); visible = true; }
      if (trail.overlays.spraying && el.showSprayingCheck.checked) { addTrailLine(trail, sprayingLayer, { weight: 5, opacity: 0.9, color: '#a855f7', dashArray: '10 7' }); visible = true; }
    }
    if (trail.flags.omRoad) addTrailLine(trail, flagLayer, { weight: 2, opacity: 0.92, color: '#ffffff' });
    if (trail.flags.dailyTravel) addTrailLine(trail, flagLayer, { weight: 3, opacity: 0.96, color: '#facc15', dashArray: '2 10' });
    if (!visible && !trail.overlays.mowing && !trail.overlays.spraying) addTrailLine(trail, untaggedTrailLayer, { weight: 4, opacity: 0.75, color: '#94a3b8' });
  }
}
function escapeHtml(value) { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function importGeoJson(geojson, name = 'Imported GeoJSON') { const layer = L.geoJSON(geojson, { style: { color: '#f97316', weight: 4, opacity: 0.85 }, pointToLayer: (_f,ll) => L.circleMarker(ll,{radius:6,color:'#f97316',fillColor:'#f97316',fillOpacity:0.75}), onEachFeature: (feature, layer) => { const props = feature.properties || {}; layer.bindPopup(`<strong>${escapeHtml(props.name || props.title || name)}</strong>`); } }); layer.addTo(importedLayer); try { map.fitBounds(layer.getBounds(), { padding: [24,24] }); } catch {} }
function initSavedLayers() { trackLayer.setLatLngs(state.track.map(toLatLng)); state.waypoints.forEach(addWaypointMarker); redrawAssets(); redrawWorkOverlays(); const latLngs = [...state.track.map(toLatLng), ...state.waypoints.map(toLatLng), ...state.assets.map(toLatLng), ...state.drawnTrails.flatMap((t)=>t.points.map(toLatLng))]; if (latLngs.length) map.fitBounds(L.latLngBounds(latLngs), { padding: [24,24], maxZoom: 17 }); updateCounts(); updateZoneSummary(); renderRecentSaves(); }

function setFollowMode(value) { followMode = value; el.followBtn.textContent = `Follow: ${followMode ? 'On' : 'Off'}`; el.followBtn.classList.toggle('active', followMode); }
function lockMapInteractions(lock) { if (lock === mapInteractionsLocked) return; mapInteractionsLocked = lock; const method = lock ? 'disable' : 'enable'; map.dragging[method](); map.touchZoom[method](); map.doubleClickZoom[method](); map.scrollWheelZoom[method](); map.boxZoom[method](); map.keyboard[method](); }
function clearDraft() { activeDrawPoints = []; activeDrawLine = null; activeDrawMarkers = []; draftDrawLayer.clearLayers(); updateDrawButtons(); }
function createDraftLine() { if (activeDrawLine) return activeDrawLine; activeDrawLine = L.polyline([], { weight: 5, opacity: 0.95, color: '#22c55e', dashArray: drawMode === 'point' ? '8 6' : null }).addTo(draftDrawLayer); return activeDrawLine; }
function appendDraftPoint(point, showMarker = false) { const last = activeDrawPoints.at(-1); if (last && distanceMeters(last, point) < MIN_DRAW_DISTANCE_METERS && drawMode === 'freehand') return; activeDrawPoints.push(point); createDraftLine().setLatLngs(activeDrawPoints.map(toLatLng)); if (showMarker) { const marker = L.circleMarker(toLatLng(point), { radius: 5, weight: 2, color: '#bbf7d0', fillColor: '#22c55e', fillOpacity: 0.9 }).addTo(draftDrawLayer); activeDrawMarkers.push(marker); } updateDrawButtons(); }
function updateDrawButtons() { const active = drawMode !== null, enough = activeDrawPoints.length >= 2; el.freehandBtn.classList.toggle('active', drawMode === 'freehand'); el.pointDrawBtn.classList.toggle('active', drawMode === 'point'); el.finishDrawBtn.disabled = !enough; el.undoDrawBtn.disabled = !active || !activeDrawPoints.length; el.cancelDrawBtn.disabled = !active; el.clearDrawnBtn.disabled = !state.drawnTrails.length; el.drawHelp.textContent = !active ? 'Draw trails without driving them. Use freehand to sketch, or point mode to tap corners.' : drawMode === 'freehand' ? (activeDrawPoints.length ? `${activeDrawPoints.length} sketch points. Release your finger, then Save Trail or Cancel Draw.` : 'Drag on the map to sketch a trail. Map panning is locked while freehand mode is active.') : (activeDrawPoints.length ? `${activeDrawPoints.length} route points. Tap more corners, Undo Point, or Save Trail.` : 'Tap the map at each corner or bend in the trail, then Save Trail.'); }
function startDrawMode(mode) { if (drawMode === mode) return cancelDrawMode(); clearDraft(); drawMode = mode; setFollowMode(false); map.getContainer().classList.add('drawing-map'); lockMapInteractions(mode === 'freehand'); if (mode === 'point') { map.on('click', handlePointDrawClick); setStatus('Point drawing: tap trail corners', 'warn'); } else setStatus('Freehand drawing: drag on map', 'warn'); updateDrawButtons(); }
function cancelDrawMode() { if (drawMode === 'point') map.off('click', handlePointDrawClick); drawMode = null; isFreehandDrawing = false; lockMapInteractions(false); map.getContainer().classList.remove('drawing-map'); clearDraft(); setStatus('Drawing canceled', 'warn'); }
function finishDrawMode() {
  if (activeDrawPoints.length < 2) return setStatus('A trail needs at least two points', 'warn');
  const defaultName = `${zoneLabel(selectedZoneId())} Trail ${state.drawnTrails.length + 1}`;
  const name = window.prompt('Trail / road stretch name:', defaultName); if (name === null) return;
  const estimateText = window.prompt('Estimated minutes to clear/drive/work this stretch:', '');
  const estimatedMinutes = estimateText === null || estimateText.trim() === '' ? null : Number(estimateText);
  const trail = { id: `trail-${Date.now()}`, name: name.trim() || defaultName, mode: drawMode || 'point', zoneId: selectedZoneId(), overlays: selectedTrailOverlays(), flags: selectedTrailFlags(), estimatedMinutes: Number.isFinite(estimatedMinutes) ? estimatedMinutes : null, timestamp: Date.now(), points: normalizeTrack(activeDrawPoints) };
  state.drawnTrails.push(trail); redrawWorkOverlays(); updateTrailSelect(); updateCounts(); updateZoneSummary(); saveRecord('Trail', trail.name, `${[...overlayLabelList(trail.overlays), ...flagLabelList(trail.flags)].join(' + ')} • Estimated ${minutesLabel(trail.estimatedMinutes)} • ${trail.points.length} points`, trail.zoneId); cancelDrawMode(); setStatus('Drawn trail saved', 'ok');
}
function undoDrawPoint() { if (!activeDrawPoints.length) return; activeDrawPoints.pop(); const marker = activeDrawMarkers.pop(); if (marker) draftDrawLayer.removeLayer(marker); if (activeDrawLine) activeDrawLine.setLatLngs(activeDrawPoints.map(toLatLng)); updateDrawButtons(); }
function handlePointDrawClick(event) { if (drawMode !== 'point') return; appendDraftPoint({ lat: event.latlng.lat, lng: event.latlng.lng, timestamp: Date.now() }, true); }
function pointFromPointerEvent(event) { const latLng = map.mouseEventToLatLng(event); return { lat: latLng.lat, lng: latLng.lng, timestamp: Date.now() }; }
function handleFreehandPointerDown(event) { if (drawMode !== 'freehand') return; if (event.pointerType === 'mouse' && event.button !== 0) return; event.preventDefault(); event.stopPropagation(); isFreehandDrawing = true; map.getContainer().setPointerCapture?.(event.pointerId); appendDraftPoint(pointFromPointerEvent(event), false); }
function handleFreehandPointerMove(event) { if (drawMode !== 'freehand' || !isFreehandDrawing) return; event.preventDefault(); event.stopPropagation(); appendDraftPoint(pointFromPointerEvent(event), false); }
function handleFreehandPointerUp(event) { if (drawMode !== 'freehand') return; event.preventDefault(); event.stopPropagation(); isFreehandDrawing = false; map.getContainer().releasePointerCapture?.(event.pointerId); updateDrawButtons(); }

function addAssetAtCurrentLocation() { const point = sourcePoint(), type = el.assetTypeSelect.value, defaultName = `${labelFor(ASSET_TYPES, type)} ${state.assets.length + 1}`; const name = window.prompt('Asset marker name:', defaultName); if (name === null) return; const notes = window.prompt('Notes for this marker:', '') ?? ''; const asset = { id: `asset-${Date.now()}`, type, zoneId: selectedZoneId(), name: name.trim() || defaultName, notes, needsBrush: Boolean(el.assetNeedsBrushCheck.checked), lat: point.lat, lng: point.lng, timestamp: Date.now(), lastVisited: null }; state.assets.push(asset); redrawAssets(); updateCounts(); updateZoneSummary(); saveRecord('Asset', asset.name, `${labelFor(ASSET_TYPES, asset.type)}${asset.needsBrush ? ' • Needs brush/hazard cutting' : ''}${asset.notes ? ` • ${asset.notes}` : ''}`, asset.zoneId); setStatus('Asset marker saved', 'ok'); }
function markZoneVisited() { const zoneId = selectedZoneId(), now = Date.now(); setZoneVisited(zoneId, now); addLog({ timestamp: now, zoneId, workType: 'scouting', notes: 'Zone marked visited' }); saveRecord('Visited', zoneLabel(zoneId), 'Zone marked visited', zoneId); updateZoneSummary(); setStatus(`${zoneLabel(zoneId)} marked visited`, 'ok'); }
function markZoneComplete() { const zoneId = selectedZoneId(), now = Date.now(), notes = window.prompt('Completion notes:', '') ?? ''; setZoneComplete(zoneId, now); addLog({ timestamp: now, zoneId, workType: selectedWorkType(), completed: true, notes: notes || 'Zone marked complete' }); saveRecord('Complete', zoneLabel(zoneId), notes || 'Zone marked complete', zoneId); updateZoneSummary(); setStatus(`${zoneLabel(zoneId)} marked complete`, 'ok'); }
function startWorkTimer() { if (activeWork) return; activeWork = { startTime: Date.now(), zoneId: selectedZoneId(), trailId: selectedTrailId(), workType: selectedWorkType() }; el.startWorkBtn.disabled = true; el.stopWorkBtn.disabled = false; setStatus(`Timer running: ${zoneLabel(activeWork.zoneId)}`, 'warn'); }
function stopWorkTimer() { if (!activeWork) return; const endTime = Date.now(), durationMinutes = (endTime - activeWork.startTime) / 60000, trail = trailById(activeWork.trailId), notes = window.prompt('Work notes:', trail ? `Worked ${trail.name}` : '') ?? ''; setZoneVisited(activeWork.zoneId, endTime); addLog({ timestamp: endTime, startTime: activeWork.startTime, endTime, zoneId: activeWork.zoneId, trailId: activeWork.trailId, workType: activeWork.workType, durationMinutes, notes }); saveRecord('Work', trail ? trail.name : labelFor(WORK_TYPES, activeWork.workType), `${labelFor(WORK_TYPES, activeWork.workType)} • ${minutesLabel(durationMinutes)}${notes ? ` • ${notes}` : ''}`, activeWork.zoneId); activeWork = null; el.startWorkBtn.disabled = false; el.stopWorkBtn.disabled = true; redrawWorkOverlays(); updateZoneSummary(); setStatus(`Work saved: ${minutesLabel(durationMinutes)}`, 'ok'); }
function addManualLogNote() { const notes = window.prompt('Log note:', '') ?? ''; if (!notes.trim()) return; const minutesText = window.prompt('Minutes spent, blank if not timed:', ''); const durationMinutes = minutesText.trim() === '' ? null : Number(minutesText); const zoneId = selectedZoneId(), timestamp = Date.now(); setZoneVisited(zoneId, timestamp); addLog({ timestamp, zoneId, trailId: selectedTrailId(), workType: selectedWorkType(), durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null, notes }); redrawWorkOverlays(); saveRecord('Log', labelFor(WORK_TYPES, selectedWorkType()), `${minutesLabel(durationMinutes)} • ${notes}`, zoneId); setStatus('Log note saved', 'ok'); }

function trailEntryCandidates() { const candidates = []; for (const trail of state.drawnTrails.filter((t)=>t.flags.omRoad && t.points.length >= 2)) { const first = trail.points[0], last = trail.points.at(-1); candidates.push({ trail, point: first, label: 'start' }, { trail, point: last, label: 'end' }); } return candidates; }
function nearestOmEntry(from = sourcePoint()) { let best = null; for (const c of trailEntryCandidates()) { const d = distanceMeters(from, c.point); if (!best || d < best.distanceMeters) best = { ...c, distanceMeters: d }; } return best; }
function showNearestOmEntry() { const from = sourcePoint(), best = nearestOmEntry(from); logisticsLayer.clearLayers(); if (!best) { el.logisticsOutput.textContent = 'No O/M road entries are saved yet. Save a trail with the O/M road flag first.'; return; } L.polyline([toLatLng(from), toLatLng(best.point)], { color: '#38bdf8', weight: 4, dashArray: '6 8' }).addTo(logisticsLayer); L.circleMarker(toLatLng(best.point), { radius: 9, weight: 3, color: '#38bdf8', fillColor: '#0ea5e9', fillOpacity: 0.9 }).bindPopup(`Nearest O/M entry<br><strong>${escapeHtml(best.trail.name)}</strong><br>${escapeHtml(best.label)} • ${formatDistance(best.distanceMeters)}`).addTo(logisticsLayer); map.fitBounds(L.latLngBounds([toLatLng(from), toLatLng(best.point)]), { padding: [32,32], maxZoom: 17 }); el.logisticsOutput.innerHTML = `<strong>Nearest O/M entry:</strong> ${escapeHtml(best.trail.name)} (${best.label})<br>${formatDistance(best.distanceMeters)} away in ${escapeHtml(zoneLabel(best.trail.zoneId))}.`; }
function avgOrEstimateMinutes(trail) { const stats = trailStats(trail.id); return stats.averageMinutes || trail.estimatedMinutes || 30; }
function driveMinutes(from, to) { return (distanceMeters(from, to) / 1609.344) / DEFAULT_FIELD_SPEED_MPH * 60; }
function planWorkDay() {
  const type = el.planTypeSelect.value, hours = Number(el.availableHoursInput.value) || 6, available = hours * 60, from = sourcePoint(); logisticsLayer.clearLayers();
  let items = [];
  if (type === 'brush') {
    items = state.assets.filter((a)=>a.needsBrush).map((asset)=>({ kind:'brush', title: asset.name, zoneId: asset.zoneId, point: asset, minutes: 20, distanceMeters: distanceMeters(from, asset), details: labelFor(ASSET_TYPES, asset.type) })).sort((a,b)=>a.distanceMeters-b.distanceMeters);
  } else {
    items = state.drawnTrails.filter((t)=>t.flags.omRoad && t.overlays[type]).map((trail)=>{ const entry = [trail.points[0], trail.points.at(-1)].map((p)=>({p,d:distanceMeters(from,p)})).sort((a,b)=>a.d-b.d)[0]; return { kind:type, title: trail.name, zoneId: trail.zoneId, point: entry.p, trail, minutes: avgOrEstimateMinutes(trail), distanceMeters: entry.d, details: `${flagLabelList(trail.flags).join(' + ') || 'trail'}` }; }).sort((a,b)=>a.distanceMeters-b.distanceMeters);
  }
  if (!items.length) { el.logisticsOutput.textContent = `No ${type} items found for planning.`; return; }
  const chosen = []; let used = 0, current = from;
  for (const item of items) { const travel = driveMinutes(current, item.point); const total = travel + item.minutes; if (chosen.length && used + total > available) continue; if (!chosen.length && total > available) { chosen.push({ ...item, travelMinutes: travel, totalMinutes: total }); used += total; break; } chosen.push({ ...item, travelMinutes: travel, totalMinutes: total }); used += total; current = item.point; if (used >= available) break; }
  for (const item of chosen) { if (item.trail) addTrailLine(item.trail, logisticsLayer, { color: '#38bdf8', weight: 6, opacity: 0.95 }); else L.circleMarker(toLatLng(item.point), { radius: 10, weight: 3, color: '#38bdf8', fillColor: '#ef4444', fillOpacity: 0.85 }).bindPopup(item.title).addTo(logisticsLayer); }
  if (chosen.length) map.fitBounds(L.latLngBounds([toLatLng(from), ...chosen.map((x)=>toLatLng(x.point))]), { padding: [32,32], maxZoom: 14 });
  el.logisticsOutput.innerHTML = `<strong>Plan: ${escapeHtml(labelFor(WORK_TYPES, type) || type)}</strong><br>${minutesLabel(used)} planned of ${minutesLabel(available)} available.<ol>${chosen.map((x)=>`<li>${escapeHtml(x.title)} — ${escapeHtml(zoneLabel(x.zoneId))}, ${formatDistance(x.distanceMeters)} away, work ${minutesLabel(x.minutes)}, travel est. ${minutesLabel(x.travelMinutes)}</li>`).join('')}</ol>`;
}

el.panelToggleBtn.addEventListener('click', () => el.controlPanel.classList.toggle('collapsed'));
el.legendToggleBtn.addEventListener('click', () => { el.legendPanel.hidden = !el.legendPanel.hidden; });
el.gpsBtn.addEventListener('click', () => watchId === null ? startGps() : stopGps());
el.followBtn.addEventListener('click', () => { setFollowMode(!followMode); if (followMode && lastPoint) updateMapPosition(lastPoint, false); });
el.wakeBtn.addEventListener('click', async () => { wakeRequested = !wakeRequested; if (wakeRequested) { const ok = await requestWakeLock(); if (!ok) wakeRequested = false; } else await releaseWakeLock(); });
el.waypointBtn.addEventListener('click', () => { const p = sourcePoint(), defaultName = `Waypoint ${state.waypoints.length + 1}`, name = window.prompt('Waypoint name:', defaultName); if (name === null) return; const wp = { id: `wp-${Date.now()}`, name: name.trim() || defaultName, lat: p.lat, lng: p.lng, timestamp: Date.now() }; state.waypoints.push(wp); addWaypointMarker(wp); updateCounts(); saveRecord('Waypoint', wp.name, `${wp.lat.toFixed(6)}, ${wp.lng.toFixed(6)}`, selectedZoneId()); setStatus('Waypoint saved','ok'); });
el.clearTrackBtn.addEventListener('click', () => { if (!state.track.length) return; if (!window.confirm('Clear the recorded GPS track from this browser? Waypoints, assets, logs, and drawn trails will stay.')) return; state.track = []; trackLayer.setLatLngs([]); updateCounts(); saveState(); setStatus('GPS track cleared','warn'); });
[el.showMowingCheck, el.showSprayingCheck].forEach((c)=>c.addEventListener('change', redrawWorkOverlays));
el.showBrushCheck.addEventListener('change', redrawAssets);
el.nearestOmBtn.addEventListener('click', showNearestOmEntry);
el.planDayBtn.addEventListener('click', planWorkDay);
el.zoneSelect.addEventListener('change', () => { updateTrailSelect(); updateZoneSummary(); });
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
el.clearDrawnBtn.addEventListener('click', () => { if (!state.drawnTrails.length) return; if (!window.confirm('Clear all manually drawn trails from this browser? GPS track, assets, logs, and waypoints will stay.')) return; state.drawnTrails = []; redrawWorkOverlays(); updateTrailSelect(); updateCounts(); saveState(); updateDrawButtons(); updateZoneSummary(); setStatus('Drawn trails cleared','warn'); });
el.geojsonInput.addEventListener('change', async (event) => { const [file] = event.target.files; if (!file) return; try { importGeoJson(JSON.parse(await file.text()), file.name); setStatus(`Imported ${file.name}`, 'ok'); } catch (error) { setStatus(`Import failed: ${error.message}`, 'error'); } finally { el.geojsonInput.value = ''; } });

const mapContainer = map.getContainer();
mapContainer.addEventListener('pointerdown', handleFreehandPointerDown, { passive: false });
mapContainer.addEventListener('pointermove', handleFreehandPointerMove, { passive: false });
mapContainer.addEventListener('pointerup', handleFreehandPointerUp, { passive: false });
mapContainer.addEventListener('pointercancel', handleFreehandPointerUp, { passive: false });
window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstallPrompt = event; el.installBtn.hidden = false; });
el.installBtn.addEventListener('click', async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; el.installBtn.hidden = true; });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && wakeRequested && !wakeLock) requestWakeLock(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch((error)=>console.warn('Service worker failed:', error));

populateStaticControls();
if (!window.isSecureContext) setStatus('GPS needs HTTPS or localhost', 'error'); else if (!navigator.geolocation) setStatus('GPS unavailable in this browser', 'error'); else setStatus('Ready', 'ok');
setFollowMode(true);
initSavedLayers();
updateDrawButtons();
