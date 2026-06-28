const DEFAULT_CENTER = [44.6714, -103.8522];
const DEFAULT_ZOOM = 13;
const STORAGE_KEY = 'interactive-irrigation-map-v7';
const LEGACY_KEYS = ['interactive-irrigation-map-v8','interactive-irrigation-map-v6','interactive-irrigation-map-v5','interactive-irrigation-map-v4','interactive-irrigation-map-v3','interactive-irrigation-map-v2','interactive-irrigation-map-v1'];
const MAX_TRACK_POINTS = 20000;
const MAX_RECENT_SAVES = 10;
const DEFAULT_FIELD_SPEED_MPH = 25;
const EARTH_RADIUS_METERS = 6371008.8;
const MPS_TO_MPH = 2.2369362921;
const COVERAGE_ZONE_ID = 'map-coverage';

const DEFAULT_COVERAGE_ZONE = {
  id: COVERAGE_ZONE_ID,
  name: 'Map Coverage Boundary',
  type: 'coverage',
  notes: 'Large admin-defined map coverage zone. Field map pan/zoom is constrained to this boundary.',
  boundary: [
    { lat: 44.900000, lng: -104.250000 },
    { lat: 44.900000, lng: -103.450000 },
    { lat: 44.450000, lng: -103.450000 },
    { lat: 44.450000, lng: -104.250000 }
  ]
};
const DEFAULT_WORK_ZONES = [['ride1','Ride 1'],['ride2','Ride 2'],['ride4','Ride 4'],['ride5','Ride 5'],['ride6','Ride 6'],['ride7','Ride 7'],['ride8','Ride 8'],['ride10','Ride 10']];
const ASSET_TYPES = [['head-gate','Head gate'],['valve','Valve'],['box','Box'],['check','Check'],['culvert','Culvert'],['crossing','Crossing'],['washout','Washout'],['spray-area','Spray area'],['hazard','Hazard'],['problem','Problem spot'],['poi','POI'],['note','Note']];
const WORK_TYPES = [['road-clearing','Road clearing'],['mowing','Mowing'],['spraying','Spraying'],['brush','Brush / POI / hazard cutting'],['scouting','Scouting / inspection'],['repair','Repair / maintenance'],['ditch-rider-support','Ditch rider support'],['drive-time','Drive time'],['other','Other']];
const DEFAULT_BRUSH_TYPES = new Set(['head-gate','check','valve','washout','hazard','problem','poi']);

const $ = (id) => document.getElementById(id);
const el = {
  status: $('connectionStatus'), installBtn: $('installBtn'), panelToggleBtn: $('panelToggleBtn'), legendToggleBtn: $('legendToggleBtn'), controlPanel: $('controlPanel'), legendPanel: $('legendPanel'),
  gpsBtn: $('gpsBtn'), followBtn: $('followBtn'), wakeBtn: $('wakeBtn'), clearTrackBtn: $('clearTrackBtn'),
  showMowingCheck: $('showMowingCheck'), showSprayingCheck: $('showSprayingCheck'), showBrushCheck: $('showBrushCheck'), showZonesCheck: $('showZonesCheck'),
  availableHoursInput: $('availableHoursInput'), planTypeSelect: $('planTypeSelect'), nearestOmBtn: $('nearestOmBtn'), planDayBtn: $('planDayBtn'), logisticsOutput: $('logisticsOutput'),
  zoneSelect: $('zoneSelect'), trailSelect: $('trailSelect'), workTypeSelect: $('workTypeSelect'), zoneSummary: $('zoneSummary'),
  markVisitedBtn: $('markVisitedBtn'), markCompleteBtn: $('markCompleteBtn'), startWorkBtn: $('startWorkBtn'), stopWorkBtn: $('stopWorkBtn'), addLogBtn: $('addLogBtn'), recentList: $('recentList'),
  lat: $('latReadout'), lng: $('lngReadout'), accuracy: $('accuracyReadout'), speed: $('speedReadout'), heading: $('headingReadout'), altitude: $('altitudeReadout'),
  trackCount: $('trackCount'), drawnCount: $('drawnCount'), assetCount: $('assetCount'), logCount: $('logCount')
};

let state = loadState();
let followMode = true;
let watchId = null;
let lastPoint = null;
let wakeRequested = false;
let wakeLock = null;
let deferredInstallPrompt = null;
let saveTimer = null;
let activeWork = null;
let applyingMapBounds = false;

const map = L.map('map', { zoomControl: false, preferCanvas: true, maxBoundsViscosity: 1.0 }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.control.scale({ imperial: true, metric: true }).addTo(map);
const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, attribution: '&copy; OpenStreetMap contributors' });
const imageryLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' });
streetLayer.addTo(map);
L.control.layers({ Streets: streetLayer, Imagery: imageryLayer }, {}, { position: 'topright' }).addTo(map);

const trackLayer = L.polyline([], { weight: 4, opacity: 0.9, color: '#2563eb' }).addTo(map);
const zoneLayer = L.layerGroup().addTo(map);
const markerLayer = L.layerGroup().addTo(map);
const mowingLayer = L.layerGroup().addTo(map);
const sprayingLayer = L.layerGroup().addTo(map);
const flagLayer = L.layerGroup().addTo(map);
const brushLayer = L.layerGroup().addTo(map);
const logisticsLayer = L.layerGroup().addTo(map);

const gpsIcon = L.divIcon({ className: 'gps-location-icon', html: '<div class="gps-arrow"></div><div class="gps-dot"></div>', iconSize: [44,44], iconAnchor: [22,22] });
const locationMarker = L.marker(DEFAULT_CENTER, { icon: gpsIcon, interactive: false });
const accuracyCircle = L.circle(DEFAULT_CENTER, { radius: 0, stroke: true, weight: 1, opacity: 0.7, fillOpacity: 0.12, color: '#0ea5e9', fillColor: '#0ea5e9' });

function setStatus(message, level = 'neutral') { el.status.textContent = message; el.status.dataset.level = level; }
function safeParse(json, fallback) { try { return JSON.parse(json) ?? fallback; } catch { return fallback; } }
function toRadians(degrees) { return (degrees * Math.PI) / 180; }
function toDegrees(radians) { return (radians * 180) / Math.PI; }
function toLatLng(point) { return [point.lat, point.lng]; }
function pointFromLatLng(latLng) { return { lat: latLng.lat, lng: latLng.lng }; }
function sourcePoint() { return lastPoint || pointFromLatLng(map.getCenter()); }
function isCoverageZone(zone) { return zone?.id === COVERAGE_ZONE_ID || zone?.type === 'coverage' || zone?.role === 'map-coverage'; }
function coverageZone() { return state.zones.find(isCoverageZone) || null; }
function workZones() { return state.zones.filter((zone) => !isCoverageZone(zone)); }
function escapeHtml(value) { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function labelFor(list, value) { return list.find(([id]) => id === value)?.[1] || value || 'None'; }
function zoneOptions() { const zones = workZones(); return zones.length ? zones.map((z) => [z.id, z.name]) : DEFAULT_WORK_ZONES; }
function zoneLabel(zoneId) { const zone = state.zones.find((z) => z.id === zoneId); return zone?.name || labelFor(zoneOptions(), zoneId); }
function selectedZoneId() { return el.zoneSelect.value || zoneOptions()[0]?.[0] || 'ride1'; }
function selectedTrailId() { return el.trailSelect.value || ''; }
function selectedWorkType() { return el.workTypeSelect.value || 'other'; }

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
function formatDistance(meters) { const feet = meters * 3.28084; return feet < 5280 ? `${feet.toFixed(0)} ft` : `${(feet / 5280).toFixed(2)} mi`; }
function minutesLabel(minutes) { if (!Number.isFinite(minutes)) return '--'; if (minutes < 60) return `${minutes.toFixed(0)} min`; const h = Math.floor(minutes / 60), m = Math.round(minutes % 60); return m ? `${h}h ${m}m` : `${h}h`; }
function daysAgo(timestamp) { if (!Number.isFinite(timestamp)) return 'never'; const d = Math.floor((Date.now() - timestamp) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; }
function average(values) { const clean = values.filter(Number.isFinite); return clean.length ? clean.reduce((s,v)=>s+v,0)/clean.length : null; }

function normalizePoint(point) { return point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)) ? { lat: Number(point.lat), lng: Number(point.lng), timestamp: Number.isFinite(point.timestamp) ? point.timestamp : Date.now() } : null; }
function normalizeTrack(points = []) { return points.map(normalizePoint).filter(Boolean).slice(-MAX_TRACK_POINTS); }
function normalizeZones(zones = []) {
  const source = zones.length ? zones : [DEFAULT_COVERAGE_ZONE, ...DEFAULT_WORK_ZONES.map(([id,name]) => ({ id, name, notes: '', boundary: [] }))];
  const seen = new Set();
  const normalized = source.map((z, i) => ({ id: String(z.id || `zone-${i + 1}`).trim(), name: String(z.name || z.label || `Zone ${i + 1}`).trim(), type: z.type || z.role || '', notes: String(z.notes || ''), boundary: normalizeTrack(z.boundary || z.points || []) })).filter((z) => z.id && z.name && !seen.has(z.id) && seen.add(z.id));
  if (!normalized.some(isCoverageZone)) normalized.unshift({ ...DEFAULT_COVERAGE_ZONE, boundary: normalizeTrack(DEFAULT_COVERAGE_ZONE.boundary) });
  return normalized;
}
function normalizeTrailOverlays(trail = {}) { const old = !trail.overlays && !('mowing' in trail) && !('spraying' in trail); return { mowing: Boolean(trail.overlays?.mowing ?? trail.mowing ?? old), spraying: Boolean(trail.overlays?.spraying ?? trail.spraying ?? false) }; }
function normalizeTrailFlags(trail = {}) { return { omRoad: Boolean(trail.flags?.omRoad ?? trail.omRoad ?? true), dailyTravel: Boolean(trail.flags?.dailyTravel ?? trail.dailyTravel ?? trail.overlays?.dailyTravel ?? false) }; }
function normalizeTrails(trails = [], zones = normalizeZones()) {
  const selectableZones = zones.filter((z) => !isCoverageZone(z));
  const validZone = new Set(selectableZones.map((z) => z.id));
  const fallback = selectableZones[0]?.id || 'ride1';
  return trails.map((t,i) => ({ id: String(t.id || `trail-${Date.now()}-${i}`), name: String(t.name || `Trail ${i + 1}`), zoneId: validZone.has(t.zoneId) ? t.zoneId : fallback, overlays: normalizeTrailOverlays(t), flags: normalizeTrailFlags(t), estimatedMinutes: Number.isFinite(Number(t.estimatedMinutes)) ? Number(t.estimatedMinutes) : null, notes: String(t.notes || ''), points: normalizeTrack(t.points || []) })).filter((t) => t.points.length >= 2);
}
function normalizeMarkers(markers = [], zones = normalizeZones()) {
  const selectableZones = zones.filter((z) => !isCoverageZone(z));
  const validZone = new Set(selectableZones.map((z) => z.id));
  const fallback = selectableZones[0]?.id || 'ride1';
  return markers.map((a,i) => {
    const point = normalizePoint(a);
    const type = ASSET_TYPES.some(([id]) => id === a.type) ? a.type : 'note';
    return point ? { id: String(a.id || `marker-${Date.now()}-${i}`), type, zoneId: validZone.has(a.zoneId) ? a.zoneId : fallback, name: String(a.name || `Marker ${i + 1}`), notes: String(a.notes || ''), needsBrush: Boolean(a.needsBrush ?? a.needsClearing ?? DEFAULT_BRUSH_TYPES.has(type)), lat: point.lat, lng: point.lng, timestamp: Number.isFinite(a.timestamp) ? a.timestamp : Date.now(), lastVisited: Number.isFinite(a.lastVisited) ? a.lastVisited : null } : null;
  }).filter(Boolean);
}
function normalizeLogs(logs = [], zones = normalizeZones()) { const validZone = new Set(zones.filter((z) => !isCoverageZone(z)).map((z) => z.id)); const fallback = [...validZone][0] || 'ride1'; return logs.map((l,i) => ({ id: l.id || `log-${Date.now()}-${i}`, timestamp: Number.isFinite(l.timestamp) ? l.timestamp : Date.now(), startTime: Number.isFinite(l.startTime) ? l.startTime : null, endTime: Number.isFinite(l.endTime) ? l.endTime : null, zoneId: validZone.has(l.zoneId) ? l.zoneId : fallback, trailId: l.trailId || '', markerId: l.markerId || l.assetId || '', workType: WORK_TYPES.some(([id]) => id === l.workType) ? l.workType : 'other', durationMinutes: Number.isFinite(Number(l.durationMinutes)) ? Number(l.durationMinutes) : null, completed: Boolean(l.completed), notes: String(l.notes || '') })); }
function normalizeZoneStatus(status = {}, zones = normalizeZones()) { const result = {}; for (const z of zones.filter((zone) => !isCoverageZone(zone))) { const v = status[z.id] || {}; result[z.id] = { lastVisited: Number.isFinite(v.lastVisited) ? v.lastVisited : null, lastCompleted: Number.isFinite(v.lastCompleted) ? v.lastCompleted : null, completedCount: Number.isFinite(v.completedCount) ? v.completedCount : 0 }; } return result; }
function normalizeRecentSaves(items = [], zones = normalizeZones()) { const validZone = new Set(zones.filter((z) => !isCoverageZone(z)).map((z) => z.id)); return items.map((x,i) => ({ id: x.id || `recent-${Date.now()}-${i}`, timestamp: Number.isFinite(x.timestamp) ? x.timestamp : Date.now(), type: String(x.type || 'Saved'), zoneId: validZone.has(x.zoneId) ? x.zoneId : '', title: String(x.title || 'Saved record'), details: String(x.details || '') })).sort((a,b) => b.timestamp - a.timestamp).slice(0, MAX_RECENT_SAVES); }
function loadState() {
  let saved = safeParse(localStorage.getItem(STORAGE_KEY), null);
  for (const key of LEGACY_KEYS) { if (saved) break; saved = safeParse(localStorage.getItem(key), null); }
  saved ||= {};
  const zones = normalizeZones(saved.zones);
  const trails = normalizeTrails(saved.drawnTrails || saved.trails || [], zones);
  const markers = normalizeMarkers(saved.assets || saved.markers || [], zones);
  return { zones, drawnTrails: trails, assets: markers, logs: normalizeLogs(saved.logs || [], zones), zoneStatus: normalizeZoneStatus(saved.zoneStatus || {}, zones), recentSaves: normalizeRecentSaves(saved.recentSaves || [], zones), track: normalizeTrack(saved.track || []) };
}
function saveState() {
  state.zones = normalizeZones(state.zones);
  state.drawnTrails = normalizeTrails(state.drawnTrails, state.zones);
  state.assets = normalizeMarkers(state.assets, state.zones);
  state.logs = normalizeLogs(state.logs, state.zones);
  state.zoneStatus = normalizeZoneStatus(state.zoneStatus, state.zones);
  state.recentSaves = normalizeRecentSaves(state.recentSaves, state.zones);
  state.track = normalizeTrack(state.track);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function saveRecord(type, title, details = '', zoneId = selectedZoneId()) { state.recentSaves.unshift({ id: `recent-${Date.now()}`, timestamp: Date.now(), type, zoneId, title, details }); state.recentSaves = normalizeRecentSaves(state.recentSaves, state.zones); saveState(); renderRecentSaves(); }

function setStatusDates(zoneId, completed = false) { state.zoneStatus[zoneId] ||= { lastVisited: null, lastCompleted: null, completedCount: 0 }; state.zoneStatus[zoneId].lastVisited = Date.now(); if (completed) { state.zoneStatus[zoneId].lastCompleted = Date.now(); state.zoneStatus[zoneId].completedCount += 1; } }
function populateSelect(select, options) { const previous = select.value; select.innerHTML = ''; for (const [value,label] of options) { const o = document.createElement('option'); o.value = value; o.textContent = label; select.append(o); } if ([...select.options].some((o) => o.value === previous)) select.value = previous; }
function overlayLabelList(overlays = {}) { const labels = []; if (overlays.mowing) labels.push('Mowing'); if (overlays.spraying) labels.push('Spraying'); return labels.length ? labels : ['No work overlay']; }
function flagLabelList(flags = {}) { const labels = []; if (flags.omRoad) labels.push('O/M road'); if (flags.dailyTravel) labels.push('Daily rider travel'); return labels; }
function trailById(id) { return state.drawnTrails.find((t) => t.id === id); }
function trailStats(id) { const logs = state.logs.filter((l) => l.trailId === id && Number.isFinite(l.durationMinutes)); return { averageMinutes: average(logs.map((l) => l.durationMinutes)), lastWorked: logs.length ? Math.max(...logs.map((l) => l.timestamp)) : null }; }
function populateControls() { populateSelect(el.zoneSelect, zoneOptions()); populateSelect(el.workTypeSelect, WORK_TYPES); updateTrailSelect(); }
function updateTrailSelect() { const zoneId = selectedZoneId(); el.trailSelect.innerHTML = ''; const g = document.createElement('option'); g.value = ''; g.textContent = `General ${zoneLabel(zoneId)} work`; el.trailSelect.append(g); for (const trail of state.drawnTrails.filter((t) => t.zoneId === zoneId)) { const o = document.createElement('option'); o.value = trail.id; o.textContent = `${trail.name} (${[...overlayLabelList(trail.overlays), ...flagLabelList(trail.flags)].join(' + ')})`; el.trailSelect.append(o); } }
function updateSummary() {
  const zoneId = selectedZoneId(), status = state.zoneStatus[zoneId] || {}, trails = state.drawnTrails.filter((t)=>t.zoneId===zoneId), markers = state.assets.filter((a)=>a.zoneId===zoneId), logs = state.logs.filter((l)=>l.zoneId===zoneId);
  const timed = logs.filter((l)=>Number.isFinite(l.durationMinutes));
  el.zoneSummary.innerHTML = [`<strong>${zoneLabel(zoneId)}</strong>`,`<span>Last visited: ${daysAgo(status.lastVisited)}</span>`,`<span>Last completed: ${daysAgo(status.lastCompleted)}</span>`,`<span>Completions: ${status.completedCount || 0}</span>`,`<span>O/M roads: ${trails.filter((t)=>t.flags.omRoad).length}</span>`,`<span>Daily travel: ${trails.filter((t)=>t.flags.dailyTravel).length}</span>`,`<span>Mowing stretches: ${trails.filter((t)=>t.overlays.mowing).length}</span>`,`<span>Spray stretches: ${trails.filter((t)=>t.overlays.spraying).length}</span>`,`<span>Brush/POI/hazard points: ${markers.filter((a)=>a.needsBrush).length}</span>`,`<span>Markers: ${markers.length}</span>`,`<span>Logs: ${logs.length}</span>`,`<span>Total logged: ${minutesLabel(timed.reduce((s,l)=>s+l.durationMinutes,0))}</span>`,`<span>Average job: ${minutesLabel(average(timed.map((l)=>l.durationMinutes)))}</span>`].join('');
}
function updateCounts() { el.trackCount.textContent = `${state.track.length} GPS point${state.track.length === 1 ? '' : 's'}`; el.drawnCount.textContent = `${state.drawnTrails.length} trail${state.drawnTrails.length === 1 ? '' : 's'}`; el.assetCount.textContent = `${state.assets.length} marker${state.assets.length === 1 ? '' : 's'}`; el.logCount.textContent = `${state.logs.length} log${state.logs.length === 1 ? '' : 's'}`; }
function renderRecentSaves() { el.recentList.innerHTML = ''; if (!state.recentSaves.length) { const e = document.createElement('li'); e.className = 'empty-recent'; e.textContent = 'No saved records yet.'; el.recentList.append(e); return; } for (const item of state.recentSaves) { const li = document.createElement('li'); li.innerHTML = [`<strong>${escapeHtml(item.type)}: ${escapeHtml(item.title)}</strong>`,`<span>${escapeHtml(item.zoneId ? zoneLabel(item.zoneId) : 'No zone')} • ${new Date(item.timestamp).toLocaleString()}</span>`,item.details ? `<small>${escapeHtml(item.details)}</small>` : ''].filter(Boolean).join(''); el.recentList.append(li); } }

function applyCoverageBounds({ fit = false } = {}) {
  const zone = coverageZone();
  if (!zone || zone.boundary.length < 3) { map.setMaxBounds(null); return; }
  const bounds = L.latLngBounds(zone.boundary.map(toLatLng));
  map.setMaxBounds(bounds.pad(0.02));
  map.options.minZoom = 10;
  if (fit) map.fitBounds(bounds, { padding: [24,24], maxZoom: 14 });
}
function drawZones() { zoneLayer.clearLayers(); if (!el.showZonesCheck.checked) return; for (const z of state.zones) { if (z.boundary.length >= 3) { const coverage = isCoverageZone(z); L.polygon(z.boundary.map(toLatLng), { color: coverage ? '#facc15' : '#38bdf8', weight: coverage ? 3 : 2, fillOpacity: coverage ? 0.02 : 0.05, dashArray: coverage ? '8 8' : null }).bindPopup(`<strong>${escapeHtml(z.name)}</strong><br>${escapeHtml(z.notes || '')}`).addTo(zoneLayer); } } }
function trailPopup(trail) { const stats = trailStats(trail.id); return [`<strong>${escapeHtml(trail.name)}</strong>`,`<span>${escapeHtml(zoneLabel(trail.zoneId))}</span>`,`<span>Overlays: ${escapeHtml(overlayLabelList(trail.overlays).join(' + '))}</span>`,`<span>Flags: ${escapeHtml(flagLabelList(trail.flags).join(' + ') || 'none')}</span>`,`<span>Estimated: ${minutesLabel(trail.estimatedMinutes)}</span>`,`<span>Average actual: ${minutesLabel(stats.averageMinutes)}</span>`,`<span>Last worked: ${daysAgo(stats.lastWorked)}</span>`,trail.notes ? `<span>${escapeHtml(trail.notes)}</span>` : ''].filter(Boolean).join('<br>'); }
function addTrailLine(trail, layer, options) { L.polyline(trail.points.map(toLatLng), options).bindPopup(trailPopup(trail)).addTo(layer); }
function drawTrails() {
  mowingLayer.clearLayers(); sprayingLayer.clearLayers(); flagLayer.clearLayers();
  for (const trail of state.drawnTrails) {
    const both = trail.overlays.mowing && trail.overlays.spraying;
    if (both && el.showMowingCheck.checked && el.showSprayingCheck.checked) addTrailLine(trail, mowingLayer, { weight: 9, opacity: 0.72, color: '#14b8a6' });
    else { if (trail.overlays.mowing && el.showMowingCheck.checked) addTrailLine(trail, mowingLayer, { weight: 8, opacity: 0.58, color: '#22c55e' }); if (trail.overlays.spraying && el.showSprayingCheck.checked) addTrailLine(trail, sprayingLayer, { weight: 5, opacity: 0.9, color: '#a855f7', dashArray: '10 7' }); }
    if (trail.flags.omRoad) addTrailLine(trail, flagLayer, { weight: 2, opacity: 0.92, color: '#ffffff' });
    if (trail.flags.dailyTravel) addTrailLine(trail, flagLayer, { weight: 3, opacity: 0.96, color: '#facc15', dashArray: '2 10' });
  }
}
function markerPopup(marker) { return [`<strong>${escapeHtml(marker.name)}</strong>`,`<span>${escapeHtml(labelFor(ASSET_TYPES, marker.type))}</span>`,`<span>${escapeHtml(zoneLabel(marker.zoneId))}</span>`,`<span>${marker.needsBrush ? 'Needs brush / hazard cutting' : 'No brush flag'}</span>`,marker.notes ? `<span>${escapeHtml(marker.notes)}</span>` : ''].filter(Boolean).join('<br>'); }
function drawMarkers() { markerLayer.clearLayers(); brushLayer.clearLayers(); for (const marker of state.assets) { const layer = marker.needsBrush && el.showBrushCheck.checked ? brushLayer : markerLayer; const opts = marker.needsBrush ? { radius: 10, weight: 3, color: '#ef4444', fillColor: '#f97316', fillOpacity: 0.86 } : { radius: 6, weight: 2, color: '#facc15', fillColor: '#facc15', fillOpacity: 0.8 }; if (!marker.needsBrush || el.showBrushCheck.checked) L.circleMarker([marker.lat, marker.lng], opts).bindPopup(markerPopup(marker)).addTo(layer); } }
function drawAll() { applyCoverageBounds(); drawZones(); drawTrails(); drawMarkers(); updateCounts(); updateSummary(); renderRecentSaves(); }

function ensureGpsLayers() { if (!map.hasLayer(accuracyCircle)) accuracyCircle.addTo(map); if (!map.hasLayer(locationMarker)) locationMarker.addTo(map); }
function updateMapPosition(point, addTrackPoint = false) { ensureGpsLayers(); const ll = toLatLng(point); locationMarker.setLatLng(ll); accuracyCircle.setLatLng(ll); accuracyCircle.setRadius(Number.isFinite(point.accuracy) ? point.accuracy : 0); const markerElement = locationMarker.getElement(); if (markerElement) { markerElement.style.setProperty('--heading', `${Number.isFinite(point.heading) ? point.heading : 0}deg`); markerElement.classList.toggle('has-heading', Number.isFinite(point.heading)); } if (addTrackPoint) trackLayer.addLatLng(ll); if (followMode) map.setView(ll, Math.max(map.getZoom(), 17), { animate: true }); }
function updateReadouts(point) { el.lat.textContent = Number.isFinite(point.lat) ? point.lat.toFixed(6) : '--'; el.lng.textContent = Number.isFinite(point.lng) ? point.lng.toFixed(6) : '--'; el.accuracy.textContent = Number.isFinite(point.accuracy) ? `${(point.accuracy * 3.28084).toFixed(0)} ft` : '--'; el.speed.textContent = Number.isFinite(point.speedMph) ? `${point.speedMph.toFixed(1)} mph` : '--'; el.heading.textContent = Number.isFinite(point.heading) ? `${point.heading.toFixed(0)}°` : '--'; el.altitude.textContent = Number.isFinite(point.altitude) ? `${(point.altitude * 3.28084).toFixed(0)} ft` : '--'; }
function normalizePosition(position) { const c = position.coords; const point = { lat: c.latitude, lng: c.longitude, accuracy: c.accuracy, altitude: c.altitude, heading: c.heading, speedMps: c.speed, timestamp: position.timestamp || Date.now() }; if (lastPoint) { const dt = Math.max(0, (point.timestamp - lastPoint.timestamp) / 1000), dist = distanceMeters(lastPoint, point); if (!Number.isFinite(point.speedMps) && dt > 0.5 && dist > 0.5) point.speedMps = dist / dt; if (!Number.isFinite(point.heading) && dist > 2) point.heading = bearingDegrees(lastPoint, point); } point.speedMph = Number.isFinite(point.speedMps) ? point.speedMps * MPS_TO_MPH : null; return point; }
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveState, 300); }
function recordPoint(position) { const point = normalizePosition(position); lastPoint = point; state.track.push(point); if (state.track.length > MAX_TRACK_POINTS) state.track = state.track.slice(-MAX_TRACK_POINTS); trackLayer.setLatLngs(state.track.map(toLatLng)); updateMapPosition(point, false); updateReadouts(point); updateCounts(); scheduleSave(); setStatus('GPS active', 'ok'); }
function handleGpsError(error) { const messages = {1:'Location permission was denied.',2:'Location is unavailable. Move outside or enable device GPS.',3:'GPS timed out before a fresh fix arrived.'}; setStatus(messages[error.code] || error.message || 'GPS failed.', 'error'); }
function startGps() { if (!navigator.geolocation) return setStatus('GPS unavailable in this browser', 'error'); if (!window.isSecureContext) return setStatus('GPS needs HTTPS or localhost', 'error'); if (watchId !== null) return; setStatus('Waiting for GPS lock', 'warn'); watchId = navigator.geolocation.watchPosition(recordPoint, handleGpsError, { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }); el.gpsBtn.textContent = 'Stop GPS'; }
function stopGps() { if (watchId === null) return; navigator.geolocation.clearWatch(watchId); watchId = null; el.gpsBtn.textContent = 'Use My Location'; setStatus('GPS stopped', 'warn'); }
async function requestWakeLock() { if (!('wakeLock' in navigator)) return setStatus('Wake lock is not supported here', 'warn'), false; try { wakeLock = await navigator.wakeLock.request('screen'); el.wakeBtn.textContent = 'Screen Awake: On'; return true; } catch (error) { setStatus(error.message || 'Wake lock failed', 'warn'); return false; } }
async function releaseWakeLock() { if (!wakeLock) return; const lock = wakeLock; wakeLock = null; await lock.release().catch(() => {}); el.wakeBtn.textContent = 'Keep Screen Awake'; }

function addLog(entry) { const log = { id: `log-${Date.now()}`, timestamp: Date.now(), startTime: null, endTime: null, zoneId: selectedZoneId(), trailId: '', workType: selectedWorkType(), durationMinutes: null, completed: false, notes: '', ...entry }; state.logs.push(log); saveState(); updateCounts(); updateSummary(); return log; }
function markVisited() { const zoneId = selectedZoneId(); setStatusDates(zoneId, false); addLog({ zoneId, workType: 'scouting', notes: 'Zone marked visited' }); saveRecord('Visited', zoneLabel(zoneId), 'Zone marked visited', zoneId); updateSummary(); }
function markComplete() { const zoneId = selectedZoneId(); const notes = window.prompt('Completion notes:', '') ?? ''; setStatusDates(zoneId, true); addLog({ zoneId, workType: selectedWorkType(), completed: true, notes: notes || 'Zone marked complete' }); saveRecord('Complete', zoneLabel(zoneId), notes || 'Zone marked complete', zoneId); updateSummary(); }
function startWorkTimer() { if (activeWork) return; activeWork = { startTime: Date.now(), zoneId: selectedZoneId(), trailId: selectedTrailId(), workType: selectedWorkType() }; el.startWorkBtn.disabled = true; el.stopWorkBtn.disabled = false; setStatus(`Timer running: ${zoneLabel(activeWork.zoneId)}`, 'warn'); }
function stopWorkTimer() { if (!activeWork) return; const endTime = Date.now(), durationMinutes = (endTime - activeWork.startTime) / 60000, trail = trailById(activeWork.trailId), notes = window.prompt('Work notes:', trail ? `Worked ${trail.name}` : '') ?? ''; setStatusDates(activeWork.zoneId, false); addLog({ timestamp: endTime, startTime: activeWork.startTime, endTime, zoneId: activeWork.zoneId, trailId: activeWork.trailId, workType: activeWork.workType, durationMinutes, notes }); saveRecord('Work', trail ? trail.name : labelFor(WORK_TYPES, activeWork.workType), `${labelFor(WORK_TYPES, activeWork.workType)} • ${minutesLabel(durationMinutes)}${notes ? ` • ${notes}` : ''}`, activeWork.zoneId); activeWork = null; el.startWorkBtn.disabled = false; el.stopWorkBtn.disabled = true; drawAll(); setStatus(`Work saved: ${minutesLabel(durationMinutes)}`, 'ok'); }
function addManualLogNote() { const notes = window.prompt('Log note:', '') ?? ''; if (!notes.trim()) return; const minutesText = window.prompt('Minutes spent, blank if not timed:', ''); const durationMinutes = minutesText.trim() === '' ? null : Number(minutesText); const zoneId = selectedZoneId(); setStatusDates(zoneId, false); addLog({ zoneId, trailId: selectedTrailId(), workType: selectedWorkType(), durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null, notes }); saveRecord('Log', labelFor(WORK_TYPES, selectedWorkType()), `${minutesLabel(durationMinutes)} • ${notes}`, zoneId); drawAll(); }

function trailEntryCandidates() { const list = []; for (const trail of state.drawnTrails.filter((t)=>t.flags.omRoad && t.points.length >= 2)) { list.push({ trail, point: trail.points[0], label: 'start' }, { trail, point: trail.points.at(-1), label: 'end' }); } return list; }
function nearestOmEntry(from = sourcePoint()) { let best = null; for (const c of trailEntryCandidates()) { const d = distanceMeters(from, c.point); if (!best || d < best.distanceMeters) best = { ...c, distanceMeters: d }; } return best; }
function showNearestOmEntry() { const from = sourcePoint(), best = nearestOmEntry(from); logisticsLayer.clearLayers(); if (!best) { el.logisticsOutput.textContent = 'No O/M road entries are defined yet. Add O/M road trails in Admin.'; return; } L.polyline([toLatLng(from), toLatLng(best.point)], { color: '#38bdf8', weight: 4, dashArray: '6 8' }).addTo(logisticsLayer); L.circleMarker(toLatLng(best.point), { radius: 9, weight: 3, color: '#38bdf8', fillColor: '#0ea5e9', fillOpacity: 0.9 }).bindPopup(`Nearest O/M entry<br><strong>${escapeHtml(best.trail.name)}</strong><br>${best.label} • ${formatDistance(best.distanceMeters)}`).addTo(logisticsLayer); map.fitBounds(L.latLngBounds([toLatLng(from), toLatLng(best.point)]), { padding: [32,32], maxZoom: 17 }); el.logisticsOutput.innerHTML = `<strong>Nearest O/M entry:</strong> ${escapeHtml(best.trail.name)} (${best.label})<br>${formatDistance(best.distanceMeters)} away in ${escapeHtml(zoneLabel(best.trail.zoneId))}.`; }
function avgOrEstimateMinutes(trail) { const stats = trailStats(trail.id); return stats.averageMinutes || trail.estimatedMinutes || 30; }
function driveMinutes(from, to) { return (distanceMeters(from, to) / 1609.344) / DEFAULT_FIELD_SPEED_MPH * 60; }
function planWorkDay() { const type = el.planTypeSelect.value, available = (Number(el.availableHoursInput.value) || 6) * 60, from = sourcePoint(); logisticsLayer.clearLayers(); let items = []; if (type === 'brush') items = state.assets.filter((a)=>a.needsBrush).map((a)=>({ title: a.name, zoneId: a.zoneId, point: a, minutes: 20, distanceMeters: distanceMeters(from,a), details: labelFor(ASSET_TYPES,a.type) })).sort((a,b)=>a.distanceMeters-b.distanceMeters); else items = state.drawnTrails.filter((t)=>t.flags.omRoad && t.overlays[type]).map((trail)=>{ const entry = [trail.points[0], trail.points.at(-1)].map((p)=>({p,d:distanceMeters(from,p)})).sort((a,b)=>a.d-b.d)[0]; return { title: trail.name, zoneId: trail.zoneId, point: entry.p, trail, minutes: avgOrEstimateMinutes(trail), distanceMeters: entry.d, details: flagLabelList(trail.flags).join(' + ') }; }).sort((a,b)=>a.distanceMeters-b.distanceMeters); if (!items.length) { el.logisticsOutput.textContent = `No ${type} items are defined yet.`; return; } const chosen = []; let used = 0, current = from; for (const item of items) { const travel = driveMinutes(current, item.point), total = travel + item.minutes; if (chosen.length && used + total > available) continue; chosen.push({ ...item, travelMinutes: travel, totalMinutes: total }); used += total; current = item.point; if (used >= available) break; } for (const item of chosen) { if (item.trail) addTrailLine(item.trail, logisticsLayer, { color: '#38bdf8', weight: 6, opacity: 0.95 }); else L.circleMarker(toLatLng(item.point), { radius: 10, weight: 3, color: '#38bdf8', fillColor: '#ef4444', fillOpacity: 0.85 }).bindPopup(item.title).addTo(logisticsLayer); } if (chosen.length) map.fitBounds(L.latLngBounds([toLatLng(from), ...chosen.map((x)=>toLatLng(x.point))]), { padding: [32,32], maxZoom: 14 }); el.logisticsOutput.innerHTML = `<strong>Plan: ${escapeHtml(type)}</strong><br>${minutesLabel(used)} planned of ${minutesLabel(available)} available.<ol>${chosen.map((x)=>`<li>${escapeHtml(x.title)} — ${escapeHtml(zoneLabel(x.zoneId))}, ${formatDistance(x.distanceMeters)} away, work ${minutesLabel(x.minutes)}, travel est. ${minutesLabel(x.travelMinutes)}</li>`).join('')}</ol>`; }

el.panelToggleBtn.addEventListener('click', () => el.controlPanel.classList.toggle('collapsed'));
el.legendToggleBtn.addEventListener('click', () => { el.legendPanel.hidden = !el.legendPanel.hidden; });
el.gpsBtn.addEventListener('click', () => watchId === null ? startGps() : stopGps());
el.followBtn.addEventListener('click', () => { followMode = !followMode; el.followBtn.textContent = `Follow: ${followMode ? 'On' : 'Off'}`; el.followBtn.classList.toggle('active', followMode); if (followMode && lastPoint) updateMapPosition(lastPoint, false); });
el.wakeBtn.addEventListener('click', async () => { wakeRequested = !wakeRequested; if (wakeRequested) { const ok = await requestWakeLock(); if (!ok) wakeRequested = false; } else await releaseWakeLock(); });
el.clearTrackBtn.addEventListener('click', () => { if (!state.track.length) return; if (!window.confirm('Clear the recorded GPS track from this browser? Map definitions and logs will stay.')) return; state.track = []; trackLayer.setLatLngs([]); saveState(); updateCounts(); });
[el.showMowingCheck, el.showSprayingCheck].forEach((c)=>c.addEventListener('change', drawTrails));
el.showBrushCheck.addEventListener('change', drawMarkers);
el.showZonesCheck.addEventListener('change', drawZones);
el.nearestOmBtn.addEventListener('click', showNearestOmEntry);
el.planDayBtn.addEventListener('click', planWorkDay);
el.zoneSelect.addEventListener('change', () => { updateTrailSelect(); updateSummary(); });
el.trailSelect.addEventListener('change', updateSummary);
el.markVisitedBtn.addEventListener('click', markVisited);
el.markCompleteBtn.addEventListener('click', markComplete);
el.startWorkBtn.addEventListener('click', startWorkTimer);
el.stopWorkBtn.addEventListener('click', stopWorkTimer);
el.addLogBtn.addEventListener('click', addManualLogNote);
window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstallPrompt = event; el.installBtn.hidden = false; });
el.installBtn.addEventListener('click', async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; el.installBtn.hidden = true; });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && wakeRequested && !wakeLock) requestWakeLock(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch((error)=>console.warn('Service worker failed:', error));

populateControls();
trackLayer.setLatLngs(state.track.map(toLatLng));
drawAll();
const definedLatLngs = [...state.zones.flatMap((z)=>z.boundary.map(toLatLng)), ...state.drawnTrails.flatMap((t)=>t.points.map(toLatLng)), ...state.assets.map(toLatLng)];
const coverage = coverageZone();
if (coverage?.boundary?.length >= 3) applyCoverageBounds({ fit: true });
else if (definedLatLngs.length) map.fitBounds(L.latLngBounds(definedLatLngs), { padding: [24,24], maxZoom: 15 });
if (!window.isSecureContext) setStatus('GPS needs HTTPS or localhost', 'error'); else if (!navigator.geolocation) setStatus('GPS unavailable in this browser', 'error'); else setStatus('Ready', 'ok');
el.followBtn.classList.toggle('active', followMode);
