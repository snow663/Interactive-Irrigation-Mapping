const STORAGE_KEY = 'interactive-irrigation-map-v8';
const LEGACY_KEYS = ['interactive-irrigation-map-v7','interactive-irrigation-map-v6','interactive-irrigation-map-v5','interactive-irrigation-map-v4','interactive-irrigation-map-v3','interactive-irrigation-map-v2','interactive-irrigation-map-v1'];
const TOKEN_KEY = 'interactive-irrigation-github-token';
const MAX_RECENT_SAVES = 10;
const DEFAULT_CENTER = [44.6714, -103.8522];
const COVERAGE_ZONE_ID = 'map-coverage';
const DEFAULT_COVERAGE_ZONE = {
  id: COVERAGE_ZONE_ID,
  name: 'Map Coverage Boundary',
  type: 'coverage',
  notes: 'Large admin-defined map coverage zone. Field map pan/zoom is constrained to this boundary.',
  boundary: [
    { lat: 44.9, lng: -104.25 },
    { lat: 44.9, lng: -103.45 },
    { lat: 44.45, lng: -103.45 },
    { lat: 44.45, lng: -104.25 }
  ]
};
const DEFAULT_WORK_ZONES = [['ride1','Ride 1'],['ride2','Ride 2'],['ride4','Ride 4'],['ride5','Ride 5'],['ride6','Ride 6'],['ride7','Ride 7'],['ride8','Ride 8'],['ride10','Ride 10']];
const ASSET_TYPE_LIST = [['head-gate','Head gate'],['valve','Valve'],['box','Box'],['check','Check'],['culvert','Culvert'],['crossing','Crossing'],['washout','Washout'],['spray-area','Spray area'],['hazard','Hazard'],['problem','Problem spot'],['poi','POI'],['note','Note']];
const ASSET_TYPES = new Set(ASSET_TYPE_LIST.map(([id]) => id));
const DEFAULT_BRUSH_TYPES = new Set(['head-gate','check','valve','washout','hazard','problem','poi']);

const $ = (id) => document.getElementById(id);
const el = {
  repoInput: $('repoInput'), branchInput: $('branchInput'), pathInput: $('pathInput'), tokenInput: $('tokenInput'), saveTokenCheck: $('saveTokenCheck'), saveTokenBtn: $('saveTokenBtn'), forgetTokenBtn: $('forgetTokenBtn'), pullGithubBtn: $('pullGithubBtn'), pushGithubBtn: $('pushGithubBtn'), syncStatus: $('syncStatus'),
  zonesJson: $('zonesJson'), trailsJson: $('trailsJson'), markersJson: $('markersJson'), definitionStatus: $('definitionStatus'), saveDefinitionsBtn: $('saveDefinitionsBtn'), reloadDefinitionsBtn: $('reloadDefinitionsBtn'),
  adminDrawHelp: $('adminDrawHelp'), drawZoneBtn: $('drawZoneBtn'), drawTrailBtn: $('drawTrailBtn'), dropMarkerBtn: $('dropMarkerBtn'), undoAdminPointBtn: $('undoAdminPointBtn'), clearAdminDraftBtn: $('clearAdminDraftBtn'),
  zoneAdminSelect: $('zoneAdminSelect'), zoneIdInput: $('zoneIdInput'), zoneNameInput: $('zoneNameInput'), zoneNotesInput: $('zoneNotesInput'), loadZoneBtn: $('loadZoneBtn'), saveZoneBtn: $('saveZoneBtn'), deleteZoneBtn: $('deleteZoneBtn'),
  trailAdminSelect: $('trailAdminSelect'), trailIdInput: $('trailIdInput'), trailNameInput: $('trailNameInput'), trailZoneSelect: $('trailZoneSelect'), trailMinutesInput: $('trailMinutesInput'), trailNotesInput: $('trailNotesInput'), trailMowingAdminCheck: $('trailMowingAdminCheck'), trailSprayingAdminCheck: $('trailSprayingAdminCheck'), trailOmAdminCheck: $('trailOmAdminCheck'), trailDailyAdminCheck: $('trailDailyAdminCheck'), loadTrailBtn: $('loadTrailBtn'), saveTrailBtn: $('saveTrailBtn'), deleteTrailBtn: $('deleteTrailBtn'),
  markerAdminSelect: $('markerAdminSelect'), markerIdInput: $('markerIdInput'), markerNameInput: $('markerNameInput'), markerTypeSelect: $('markerTypeSelect'), markerZoneSelect: $('markerZoneSelect'), markerLatInput: $('markerLatInput'), markerLngInput: $('markerLngInput'), markerNotesInput: $('markerNotesInput'), markerBrushCheck: $('markerBrushCheck'), loadMarkerBtn: $('loadMarkerBtn'), saveMarkerBtn: $('saveMarkerBtn'), deleteMarkerBtn: $('deleteMarkerBtn'),
  recentAdminList: $('recentAdminList'), adminStatus: $('adminStatus'), clearRecentBtn: $('clearRecentBtn'), reloadAdminBtn: $('reloadAdminBtn')
};

let state = loadState().state;
let activeTool = null;
let draftPoints = [];
let definitionSha = '';

const adminMap = L.map('adminMap', { preferCanvas: true, zoomSnap: 0.25, tapTolerance: 24 }).setView(DEFAULT_CENTER, 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, attribution: '&copy; OpenStreetMap contributors' }).addTo(adminMap);
const zoneLayer = L.layerGroup().addTo(adminMap);
const trailLayer = L.layerGroup().addTo(adminMap);
const markerLayer = L.layerGroup().addTo(adminMap);
const draftLayer = L.layerGroup().addTo(adminMap);

const handleIcon = (index) => L.divIcon({
  className: 'admin-draft-handle-icon',
  html: `<span>${index + 1}</span>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17]
});

function safeParse(json, fallback) { try { return JSON.parse(json) ?? fallback; } catch { return fallback; } }
function escapeHtml(value) { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function pretty(value) { return JSON.stringify(value, null, 2); }
function slug(value, fallback) { return String(value || fallback || 'item').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback; }
function pointFromLatLng(latLng) { return { lat: Number(latLng.lat.toFixed(6)), lng: Number(latLng.lng.toFixed(6)) }; }
function normalizePoint(point) { return point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)) ? { lat: Number(point.lat), lng: Number(point.lng) } : null; }
function normalizePointList(points = []) { return points.map(normalizePoint).filter(Boolean); }
function isCoverageZone(zone) { return zone?.id === COVERAGE_ZONE_ID || zone?.type === 'coverage' || zone?.role === 'map-coverage'; }
function workZones() { return state.zones.filter((zone) => !isCoverageZone(zone)); }
function normalizeZones(zones = []) {
  const source = zones.length ? zones : [DEFAULT_COVERAGE_ZONE, ...DEFAULT_WORK_ZONES.map(([id,name]) => ({ id, name, type: '', notes: '', boundary: [] }))];
  const seen = new Set();
  const normalized = source.map((z, i) => {
    const type = isCoverageZone(z) ? 'coverage' : String(z.type || z.role || '');
    return { id: String(z.id || `zone-${i + 1}`).trim(), name: String(z.name || z.label || `Zone ${i + 1}`).trim(), type, notes: String(z.notes || ''), boundary: normalizePointList(z.boundary || z.points || []) };
  }).filter((z) => z.id && z.name && !seen.has(z.id) && seen.add(z.id));
  if (!normalized.some(isCoverageZone)) normalized.unshift({ ...DEFAULT_COVERAGE_ZONE, boundary: normalizePointList(DEFAULT_COVERAGE_ZONE.boundary) });
  return normalized;
}
function normalizeTrailOverlays(t = {}) { return { mowing: Boolean(t.overlays?.mowing ?? t.mowing ?? true), spraying: Boolean(t.overlays?.spraying ?? t.spraying ?? false) }; }
function normalizeTrailFlags(t = {}) { return { omRoad: Boolean(t.flags?.omRoad ?? t.omRoad ?? true), dailyTravel: Boolean(t.flags?.dailyTravel ?? t.dailyTravel ?? false) }; }
function normalizeTrails(trails = [], zones = normalizeZones()) {
  const validWorkZones = new Set(zones.filter((z) => !isCoverageZone(z)).map((z) => z.id));
  const fallback = [...validWorkZones][0] || 'ride1';
  return trails.map((t, i) => ({ id: String(t.id || `trail-${Date.now()}-${i}`), name: String(t.name || `Trail ${i + 1}`).trim(), zoneId: validWorkZones.has(t.zoneId) ? t.zoneId : fallback, overlays: normalizeTrailOverlays(t), flags: normalizeTrailFlags(t), estimatedMinutes: Number.isFinite(Number(t.estimatedMinutes)) ? Number(t.estimatedMinutes) : null, notes: String(t.notes || ''), points: normalizePointList(t.points || []) })).filter((t) => t.name && t.points.length >= 2);
}
function normalizeMarkers(markers = [], zones = normalizeZones()) {
  const validWorkZones = new Set(zones.filter((z) => !isCoverageZone(z)).map((z) => z.id));
  const fallback = [...validWorkZones][0] || 'ride1';
  return markers.map((m, i) => { const point = normalizePoint(m); const type = ASSET_TYPES.has(m.type) ? m.type : 'note'; return point ? { id: String(m.id || `marker-${Date.now()}-${i}`), name: String(m.name || `Marker ${i + 1}`).trim(), type, zoneId: validWorkZones.has(m.zoneId) ? m.zoneId : fallback, lat: point.lat, lng: point.lng, needsBrush: Boolean(m.needsBrush ?? m.needsClearing ?? DEFAULT_BRUSH_TYPES.has(type)), notes: String(m.notes || '') } : null; }).filter((m) => m.id && m.name);
}
function normalizeRecentSaves(items = [], zones = normalizeZones()) {
  const validWorkZones = new Set(zones.filter((z) => !isCoverageZone(z)).map((z) => z.id));
  return items.map((item, index) => ({ id: item.id || `recent-${Date.now()}-${index}`, timestamp: Number.isFinite(item.timestamp) ? item.timestamp : Date.now(), type: String(item.type || 'Saved'), zoneId: validWorkZones.has(item.zoneId) ? item.zoneId : '', title: String(item.title || 'Saved record'), details: String(item.details || '') })).sort((a,b) => b.timestamp - a.timestamp).slice(0, MAX_RECENT_SAVES);
}
function normalizeState(raw = {}) {
  const zones = normalizeZones(raw.zones);
  return { zones, drawnTrails: normalizeTrails(raw.drawnTrails || raw.trails || [], zones), assets: normalizeMarkers(raw.assets || raw.markers || [], zones), logs: Array.isArray(raw.logs) ? raw.logs : [], zoneStatus: raw.zoneStatus || {}, recentSaves: normalizeRecentSaves(raw.recentSaves || [], zones), track: Array.isArray(raw.track) ? raw.track : [] };
}
function loadState() {
  let key = STORAGE_KEY;
  let raw = safeParse(localStorage.getItem(STORAGE_KEY), null);
  for (const legacyKey of LEGACY_KEYS) {
    if (raw) break;
    const legacy = safeParse(localStorage.getItem(legacyKey), null);
    if (legacy) { raw = legacy; key = legacyKey; }
  }
  return { key, state: normalizeState(raw || {}) };
}
function saveState(nextState = state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(nextState))); }
function definitionsPayload() { return { version: 1, updatedAt: new Date().toISOString(), zones: state.zones, drawnTrails: state.drawnTrails, assets: state.assets }; }
function applyDefinitions(definitions) {
  const normalized = normalizeState({ ...state, zones: definitions.zones || [], drawnTrails: definitions.drawnTrails || definitions.trails || [], assets: definitions.assets || definitions.markers || [] });
  state = { ...state, zones: normalized.zones, drawnTrails: normalized.drawnTrails, assets: normalized.assets };
  syncAllViews();
}
function setDefinitionStatus(message) { el.definitionStatus.innerHTML = message; }
function setSyncStatus(message, isError = false) { el.syncStatus.innerHTML = isError ? `<strong>Sync error:</strong> ${escapeHtml(message)}` : message; }

function populateSelect(select, options, emptyText = '') {
  const previous = select.value;
  select.innerHTML = '';
  if (emptyText) { const empty = document.createElement('option'); empty.value = ''; empty.textContent = emptyText; select.append(empty); }
  for (const [value, label] of options) { const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option); }
  if ([...select.options].some((o) => o.value === previous)) select.value = previous;
}
function zoneLabel(zoneId) { return state.zones.find((z) => z.id === zoneId)?.name || zoneId || 'No zone'; }
function zoneOptionLabel(zone) { return isCoverageZone(zone) ? `${zone.name} — map limit` : zone.name; }
function refreshSelects() {
  const assignableZones = workZones();
  populateSelect(el.zoneAdminSelect, state.zones.map((z) => [z.id, zoneOptionLabel(z)]), 'New zone');
  populateSelect(el.trailAdminSelect, state.drawnTrails.map((t) => [t.id, t.name]), 'New trail');
  populateSelect(el.markerAdminSelect, state.assets.map((m) => [m.id, m.name]), 'New marker');
  populateSelect(el.trailZoneSelect, assignableZones.map((z) => [z.id, z.name]));
  populateSelect(el.markerZoneSelect, assignableZones.map((z) => [z.id, z.name]));
  populateSelect(el.markerTypeSelect, ASSET_TYPE_LIST);
}
function syncJsonEditors() {
  el.zonesJson.value = pretty(state.zones);
  el.trailsJson.value = pretty(state.drawnTrails);
  el.markersJson.value = pretty(state.assets);
  setDefinitionStatus(`Local definitions: <strong>${state.zones.length}</strong> zones including coverage, <strong>${state.drawnTrails.length}</strong> trails, <strong>${state.assets.length}</strong> markers.`);
}
function syncAllViews() { state = normalizeState(state); saveState(state); refreshSelects(); syncJsonEditors(); drawDefinitions(); renderRecent(); }

function drawDefinitions() {
  zoneLayer.clearLayers(); trailLayer.clearLayers(); markerLayer.clearLayers(); draftLayer.clearLayers();
  for (const zone of state.zones) if (zone.boundary.length >= 3) { const coverage = isCoverageZone(zone); L.polygon(zone.boundary.map((p) => [p.lat, p.lng]), { color: coverage ? '#facc15' : '#38bdf8', weight: coverage ? 3 : 2, fillOpacity: coverage ? 0.02 : 0.06, dashArray: coverage ? '8 8' : null }).bindPopup(`<strong>${escapeHtml(zone.name)}</strong><br>${coverage ? 'Map scroll/zoom boundary<br>' : ''}${escapeHtml(zone.notes || '')}`).addTo(zoneLayer); }
  for (const trail of state.drawnTrails) {
    const color = trail.overlays.mowing && trail.overlays.spraying ? '#14b8a6' : trail.overlays.spraying ? '#a855f7' : '#22c55e';
    L.polyline(trail.points.map((p) => [p.lat, p.lng]), { color, weight: 5, opacity: 0.86, dashArray: trail.flags.dailyTravel ? '4 8' : null }).bindPopup(`<strong>${escapeHtml(trail.name)}</strong><br>${escapeHtml(zoneLabel(trail.zoneId))}`).addTo(trailLayer);
  }
  for (const marker of state.assets) L.circleMarker([marker.lat, marker.lng], { radius: marker.needsBrush ? 9 : 6, weight: 3, color: marker.needsBrush ? '#ef4444' : '#facc15', fillColor: marker.needsBrush ? '#f97316' : '#facc15', fillOpacity: 0.85 }).bindPopup(`<strong>${escapeHtml(marker.name)}</strong><br>${escapeHtml(marker.type)}<br>${escapeHtml(zoneLabel(marker.zoneId))}`).addTo(markerLayer);
  drawDraft();
}
function updateDraftPoint(index, latLng) {
  draftPoints[index] = pointFromLatLng(latLng);
  drawDraft();
}
function drawDraftHandles() {
  draftPoints.forEach((point, index) => {
    const marker = L.marker([point.lat, point.lng], { icon: handleIcon(index), draggable: true, keyboard: false, title: `Point ${index + 1}` });
    marker.on('dragstart', () => adminMap.dragging.disable());
    marker.on('dragend', (event) => { adminMap.dragging.enable(); updateDraftPoint(index, event.target.getLatLng()); });
    marker.on('click', (event) => L.DomEvent.stop(event));
    marker.addTo(draftLayer);
  });
}
function drawDraft() {
  draftLayer.clearLayers();
  if (activeTool === 'marker') {
    const lat = Number(el.markerLatInput.value), lng = Number(el.markerLngInput.value);
    if (Number.isFinite(lat) && Number.isFinite(lng)) L.circleMarker([lat, lng], { radius: 14, color: '#38bdf8', fillColor: '#38bdf8', fillOpacity: 0.55 }).addTo(draftLayer);
    return;
  }
  if (!draftPoints.length) return;
  const latLngs = draftPoints.map((p) => [p.lat, p.lng]);
  if (activeTool === 'zone') L.polygon(latLngs, { color: '#facc15', weight: 4, fillOpacity: 0.08 }).addTo(draftLayer);
  else L.polyline(latLngs, { color: '#facc15', weight: 6, dashArray: '8 6' }).addTo(draftLayer);
  drawDraftHandles();
}
function fitDefinedBounds() {
  const coverage = state.zones.find(isCoverageZone);
  const source = coverage?.boundary?.length >= 3 ? coverage.boundary : [...state.zones.flatMap((z) => z.boundary), ...state.drawnTrails.flatMap((t) => t.points), ...state.assets.map((m) => ({ lat: m.lat, lng: m.lng }))];
  const latLngs = source.map((p) => [p.lat, p.lng]);
  if (latLngs.length) adminMap.fitBounds(L.latLngBounds(latLngs), { padding: [24,24], maxZoom: 15 });
}
function setActiveTool(tool, { clearDraft = true, toggle = false } = {}) {
  const nextTool = toggle && activeTool === tool ? null : tool;
  activeTool = nextTool;
  if (clearDraft) draftPoints = [];
  el.drawZoneBtn.classList.toggle('active', activeTool === 'zone');
  el.drawTrailBtn.classList.toggle('active', activeTool === 'trail');
  el.dropMarkerBtn.classList.toggle('active', activeTool === 'marker');
  el.adminDrawHelp.textContent = activeTool === 'zone' ? 'Tap the map to add boundary points. Drag numbered handles to resize. Undo removes the last point. Save Zone when finished. Select “Map Coverage Boundary” to edit the outer map limit.' : activeTool === 'trail' ? 'Tap the map to add road points. Drag numbered handles to adjust the road. Undo removes the last point. Save Trail when finished.' : activeTool === 'marker' ? 'Tap the marker location, then Save Marker.' : 'Select a tool, then tap the map.';
  drawDefinitions();
}
adminMap.on('click', (event) => {
  if (!activeTool) return;
  const point = pointFromLatLng(event.latlng);
  if (activeTool === 'marker') { el.markerLatInput.value = point.lat; el.markerLngInput.value = point.lng; drawDraft(); return; }
  draftPoints.push(point);
  drawDraft();
});

function selectedZone() { return state.zones.find((z) => z.id === el.zoneAdminSelect.value); }
function selectedTrail() { return state.drawnTrails.find((t) => t.id === el.trailAdminSelect.value); }
function selectedMarker() { return state.assets.find((m) => m.id === el.markerAdminSelect.value); }
function loadZone(zone = selectedZone()) {
  if (!zone) { el.zoneIdInput.value = ''; el.zoneNameInput.value = ''; el.zoneNotesInput.value = ''; draftPoints = []; setActiveTool('zone', { clearDraft: false }); return; }
  el.zoneIdInput.value = zone.id; el.zoneNameInput.value = zone.name; el.zoneNotesInput.value = zone.notes || ''; draftPoints = [...zone.boundary]; setActiveTool('zone', { clearDraft: false });
}
function saveZone() {
  const existingId = el.zoneAdminSelect.value;
  const existing = state.zones.find((z) => z.id === existingId);
  const id = isCoverageZone(existing) ? COVERAGE_ZONE_ID : slug(el.zoneIdInput.value, `zone-${state.zones.length + 1}`);
  const name = el.zoneNameInput.value.trim() || (id === COVERAGE_ZONE_ID ? 'Map Coverage Boundary' : id);
  const matched = state.zones.find((z) => z.id === existingId || z.id === id);
  const coverage = isCoverageZone(existing) || id === COVERAGE_ZONE_ID;
  const zone = { id, name, type: coverage ? 'coverage' : '', notes: el.zoneNotesInput.value.trim(), boundary: draftPoints.length >= 3 ? [...draftPoints] : (matched?.boundary || []) };
  state.zones = state.zones.filter((z) => z.id !== existingId && z.id !== id);
  state.zones.push(zone);
  syncAllViews(); el.zoneAdminSelect.value = id; loadZone(zone);
}
function deleteZone() {
  const zone = selectedZone();
  if (!zone) return;
  if (isCoverageZone(zone)) return alert('The map coverage boundary cannot be deleted. Edit its boundary instead.');
  if (!window.confirm(`Delete zone ${zone.name}? Trails/markers assigned to it will move to the first remaining zone.`)) return;
  state.zones = state.zones.filter((z) => z.id !== zone.id);
  state = normalizeState(state); draftPoints = []; syncAllViews();
}
function loadTrail(trail = selectedTrail()) {
  if (!trail) { el.trailIdInput.value = ''; el.trailNameInput.value = ''; el.trailMinutesInput.value = ''; el.trailNotesInput.value = ''; draftPoints = []; setActiveTool('trail', { clearDraft: false }); return; }
  el.trailIdInput.value = trail.id; el.trailNameInput.value = trail.name; el.trailZoneSelect.value = trail.zoneId; el.trailMinutesInput.value = Number.isFinite(trail.estimatedMinutes) ? trail.estimatedMinutes : ''; el.trailNotesInput.value = trail.notes || '';
  el.trailMowingAdminCheck.checked = trail.overlays.mowing; el.trailSprayingAdminCheck.checked = trail.overlays.spraying; el.trailOmAdminCheck.checked = trail.flags.omRoad; el.trailDailyAdminCheck.checked = trail.flags.dailyTravel;
  draftPoints = [...trail.points]; setActiveTool('trail', { clearDraft: false });
}
function saveTrail() {
  const existingId = el.trailAdminSelect.value;
  const id = slug(el.trailIdInput.value || el.trailNameInput.value, `trail-${state.drawnTrails.length + 1}`);
  const name = el.trailNameInput.value.trim() || id;
  const existing = state.drawnTrails.find((t) => t.id === existingId || t.id === id);
  const points = draftPoints.length >= 2 ? [...draftPoints] : (existing?.points || []);
  if (points.length < 2) return alert('A trail needs at least two map points.');
  const trail = { id, name, zoneId: el.trailZoneSelect.value || workZones()[0]?.id || 'ride1', overlays: { mowing: el.trailMowingAdminCheck.checked, spraying: el.trailSprayingAdminCheck.checked }, flags: { omRoad: el.trailOmAdminCheck.checked, dailyTravel: el.trailDailyAdminCheck.checked }, estimatedMinutes: Number.isFinite(Number(el.trailMinutesInput.value)) ? Number(el.trailMinutesInput.value) : null, notes: el.trailNotesInput.value.trim(), points };
  state.drawnTrails = state.drawnTrails.filter((t) => t.id !== existingId && t.id !== id);
  state.drawnTrails.push(trail);
  syncAllViews(); el.trailAdminSelect.value = id; loadTrail(trail);
}
function deleteTrail() { const trail = selectedTrail(); if (!trail) return; if (!window.confirm(`Delete trail ${trail.name}?`)) return; state.drawnTrails = state.drawnTrails.filter((t) => t.id !== trail.id); draftPoints = []; syncAllViews(); }
function loadMarker(marker = selectedMarker()) {
  if (!marker) { el.markerIdInput.value = ''; el.markerNameInput.value = ''; el.markerLatInput.value = ''; el.markerLngInput.value = ''; el.markerNotesInput.value = ''; setActiveTool('marker', { clearDraft: true }); return; }
  el.markerIdInput.value = marker.id; el.markerNameInput.value = marker.name; el.markerTypeSelect.value = marker.type; el.markerZoneSelect.value = marker.zoneId; el.markerLatInput.value = marker.lat; el.markerLngInput.value = marker.lng; el.markerBrushCheck.checked = marker.needsBrush; el.markerNotesInput.value = marker.notes || ''; setActiveTool('marker', { clearDraft: false });
}
function saveMarker() {
  const lat = Number(el.markerLatInput.value), lng = Number(el.markerLngInput.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return alert('A marker needs latitude and longitude. Use Drop Marker and tap the map, or type coordinates.');
  const existingId = el.markerAdminSelect.value;
  const id = slug(el.markerIdInput.value || el.markerNameInput.value, `marker-${state.assets.length + 1}`);
  const marker = { id, name: el.markerNameInput.value.trim() || id, type: el.markerTypeSelect.value || 'note', zoneId: el.markerZoneSelect.value || workZones()[0]?.id || 'ride1', lat, lng, needsBrush: el.markerBrushCheck.checked, notes: el.markerNotesInput.value.trim() };
  state.assets = state.assets.filter((m) => m.id !== existingId && m.id !== id);
  state.assets.push(marker);
  syncAllViews(); el.markerAdminSelect.value = id; loadMarker(marker);
}
function deleteMarker() { const marker = selectedMarker(); if (!marker) return; if (!window.confirm(`Delete marker ${marker.name}?`)) return; state.assets = state.assets.filter((m) => m.id !== marker.id); syncAllViews(); }

function parseEditor(text, label) { const value = JSON.parse(text || '[]'); if (!Array.isArray(value)) throw new Error(`${label} must be a JSON array.`); return value; }
function saveDefinitionsFromJson() {
  try {
    state = { ...state, zones: normalizeZones(parseEditor(el.zonesJson.value, 'Zones')) };
    state.drawnTrails = normalizeTrails(parseEditor(el.trailsJson.value, 'Trails'), state.zones);
    state.assets = normalizeMarkers(parseEditor(el.markersJson.value, 'Markers'), state.zones);
    syncAllViews(); setDefinitionStatus('Definitions saved from JSON backup editor.');
  } catch (error) { setDefinitionStatus(`<strong>Definition save failed:</strong> ${escapeHtml(error.message)}`); }
}

function getToken() { return el.tokenInput.value.trim() || localStorage.getItem(TOKEN_KEY) || ''; }
function saveToken() { const token = el.tokenInput.value.trim(); if (!token) return setSyncStatus('No token entered.', true); if (el.saveTokenCheck.checked) { localStorage.setItem(TOKEN_KEY, token); setSyncStatus('Token saved locally on this device.'); } else setSyncStatus('Token is loaded for this page session only. Check “Keep token” to store it locally.'); }
function forgetToken() { localStorage.removeItem(TOKEN_KEY); el.tokenInput.value = ''; el.saveTokenCheck.checked = false; setSyncStatus('Token removed from this browser.'); }
function githubApiUrl() { const repo = el.repoInput.value.trim(); const path = el.pathInput.value.trim().replace(/^\/+/, ''); const branch = encodeURIComponent(el.branchInput.value.trim() || 'main'); return `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`; }
function githubPutUrl() { const repo = el.repoInput.value.trim(); const path = el.pathInput.value.trim().replace(/^\/+/, ''); return `https://api.github.com/repos/${repo}/contents/${path}`; }
function githubHeaders(requireToken = false) { const headers = { Accept: 'application/vnd.github+json' }; const token = getToken(); if (token) headers.Authorization = `Bearer ${token}`; if (requireToken && !token) throw new Error('A GitHub token is required to push.'); return headers; }
function decodeBase64Unicode(value) { const binary = atob(value.replace(/\s/g, '')); const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0)); return new TextDecoder().decode(bytes); }
function encodeBase64Unicode(value) { const bytes = new TextEncoder().encode(value); let binary = ''; for (const b of bytes) binary += String.fromCharCode(b); return btoa(binary); }
async function pullFromGithub() {
  try {
    setSyncStatus('Pulling definitions from GitHub...');
    const response = await fetch(githubApiUrl(), { headers: githubHeaders(false) });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const file = await response.json(); definitionSha = file.sha || '';
    const definitions = JSON.parse(decodeBase64Unicode(file.content || ''));
    applyDefinitions(definitions); fitDefinedBounds();
    setSyncStatus(`Pulled <strong>${escapeHtml(el.pathInput.value)}</strong> from GitHub. SHA ${escapeHtml(definitionSha.slice(0, 7))}.`);
  } catch (error) { setSyncStatus(error.message, true); }
}
async function pushToGithub() {
  try {
    if (!getToken()) throw new Error('Paste a GitHub token first.');
    saveState(state); setSyncStatus('Preparing push to GitHub...');
    const getResponse = await fetch(githubApiUrl(), { headers: githubHeaders(false) });
    let sha = definitionSha;
    if (getResponse.ok) sha = (await getResponse.json()).sha;
    const payload = { message: 'Update irrigation map definitions', branch: el.branchInput.value.trim() || 'main', content: encodeBase64Unicode(pretty(definitionsPayload())) };
    if (sha) payload.sha = sha;
    const putResponse = await fetch(githubPutUrl(), { method: 'PUT', headers: { ...githubHeaders(true), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!putResponse.ok) throw new Error(`${putResponse.status} ${putResponse.statusText}: ${await putResponse.text()}`);
    const result = await putResponse.json(); definitionSha = result.content?.sha || '';
    setSyncStatus(`Pushed definitions to GitHub. Commit <strong>${escapeHtml((result.commit?.sha || '').slice(0, 7))}</strong>.`);
  } catch (error) { setSyncStatus(error.message, true); }
}

function renderRecent() {
  el.adminStatus.innerHTML = `${state.recentSaves.length} recent record${state.recentSaves.length === 1 ? '' : 's'} found.`;
  el.recentAdminList.innerHTML = '';
  if (!state.recentSaves.length) { el.recentAdminList.innerHTML = '<p class="empty-recent">No recent saved records on this device.</p>'; return; }
  state.recentSaves.forEach((item, index) => {
    const row = document.createElement('article'); row.className = 'admin-row';
    row.innerHTML = `<div class="admin-row-head"><strong>${index + 1}. ${escapeHtml(item.type)} — ${escapeHtml(item.title)}</strong><span>${new Date(item.timestamp).toLocaleString()}</span></div><label>Type<input data-field="type" data-index="${index}" value="${escapeHtml(item.type)}" /></label><label>Title<input data-field="title" data-index="${index}" value="${escapeHtml(item.title)}" /></label><label>Zone<input data-field="zoneId" data-index="${index}" value="${escapeHtml(item.zoneId)}" /></label><label>Details<textarea data-field="details" data-index="${index}">${escapeHtml(item.details)}</textarea></label><div class="controls"><button data-action="save" data-index="${index}" class="primary">Save Edit</button><button data-action="delete" data-index="${index}" class="danger">Delete Entry</button></div>`;
    el.recentAdminList.append(row);
  });
}
function updateRecentEntry(index) { const item = state.recentSaves[index]; if (!item) return; for (const field of ['type','title','zoneId','details']) { const input = document.querySelector(`[data-field="${field}"][data-index="${index}"]`); if (input) item[field] = input.value; } syncAllViews(); }
function deleteRecentEntry(index) { if (!state.recentSaves[index]) return; if (!window.confirm('Delete this Last 10 saved entry? Map definitions and logs are not deleted.')) return; state.recentSaves.splice(index, 1); syncAllViews(); }

el.drawZoneBtn.addEventListener('click', () => setActiveTool('zone', { toggle: true }));
el.drawTrailBtn.addEventListener('click', () => setActiveTool('trail', { toggle: true }));
el.dropMarkerBtn.addEventListener('click', () => setActiveTool('marker', { toggle: true }));
el.undoAdminPointBtn.addEventListener('click', () => { draftPoints.pop(); drawDraft(); });
el.clearAdminDraftBtn.addEventListener('click', () => { draftPoints = []; drawDraft(); });
el.loadZoneBtn.addEventListener('click', () => loadZone()); el.saveZoneBtn.addEventListener('click', saveZone); el.deleteZoneBtn.addEventListener('click', deleteZone);
el.loadTrailBtn.addEventListener('click', () => loadTrail()); el.saveTrailBtn.addEventListener('click', saveTrail); el.deleteTrailBtn.addEventListener('click', deleteTrail);
el.loadMarkerBtn.addEventListener('click', () => loadMarker()); el.saveMarkerBtn.addEventListener('click', saveMarker); el.deleteMarkerBtn.addEventListener('click', deleteMarker);
el.saveDefinitionsBtn.addEventListener('click', saveDefinitionsFromJson); el.reloadDefinitionsBtn.addEventListener('click', syncJsonEditors);
el.saveTokenBtn.addEventListener('click', saveToken); el.forgetTokenBtn.addEventListener('click', forgetToken); el.pullGithubBtn.addEventListener('click', pullFromGithub); el.pushGithubBtn.addEventListener('click', pushToGithub);
el.recentAdminList.addEventListener('click', (event) => { const button = event.target.closest('button[data-action]'); if (!button) return; const index = Number(button.dataset.index); if (button.dataset.action === 'save') updateRecentEntry(index); if (button.dataset.action === 'delete') deleteRecentEntry(index); });
el.clearRecentBtn.addEventListener('click', () => { if (!window.confirm('Clear the entire Last 10 saved list? Map definitions and logs are not deleted.')) return; state.recentSaves = []; syncAllViews(); });
el.reloadAdminBtn.addEventListener('click', renderRecent);

const savedToken = localStorage.getItem(TOKEN_KEY);
if (savedToken) { el.tokenInput.value = savedToken; el.saveTokenCheck.checked = true; }
refreshSelects(); syncJsonEditors(); drawDefinitions(); renderRecent(); fitDefinedBounds();
setTimeout(() => adminMap.invalidateSize(), 100);
setSyncStatus('Sync idle. Pull before editing on a different device; push when definitions are ready to publish.');
