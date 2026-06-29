const STORAGE_KEY = 'interactive-irrigation-map-v8';
const FIELD_STORAGE_KEY = 'interactive-irrigation-map-v7';
const DEFAULT_CENTER = [44.6714, -103.8522];
const COVERAGE_ZONE_ID = 'map-coverage';
const DEFAULT_ZONES = [
  { id: COVERAGE_ZONE_ID, name: 'Map Coverage / Page Edge', type: 'coverage', notes: 'Outer page edge for pan/zoom limits.', boundary: [] },
  ...[['ride1','Ride 1'],['ride2','Ride 2'],['ride4','Ride 4'],['ride5','Ride 5'],['ride6','Ride 6'],['ride7','Ride 7'],['ride8','Ride 8'],['ride10','Ride 10']]
    .map(([id, name]) => ({ id, name, type: 'work', notes: '', boundary: [] }))
];
const ASSET_TYPES = [['head-gate','Head gate'],['valve','Valve'],['box','Box'],['check','Check'],['culvert','Culvert'],['crossing','Crossing'],['washout','Washout'],['spray-area','Spray area'],['hazard','Hazard'],['problem','Problem spot'],['poi','POI'],['note','Note']];
const DEFAULT_BRUSH_TYPES = new Set(['head-gate','check','valve','washout','hazard','problem','poi']);

const $ = (id) => document.getElementById(id);
const ui = {
  status: $('adminStatus'), drawStatus: $('drawStatus'),
  loadRepoDefinitionsBtn: $('loadRepoDefinitionsBtn'), importFileBtn: $('importFileBtn'), importFileInput: $('importFileInput'), exportDefinitionsBtn: $('exportDefinitionsBtn'), exportBackupBtn: $('exportBackupBtn'),
  modePanBtn: $('modePanBtn'), modeZoneBtn: $('modeZoneBtn'), modeTrailBtn: $('modeTrailBtn'), modeMarkerBtn: $('modeMarkerBtn'), useVisibleMapBtn: $('useVisibleMapBtn'), undoPointBtn: $('undoPointBtn'), clearDraftBtn: $('clearDraftBtn'), fitAllBtn: $('fitAllBtn'),
  zoneSelect: $('zoneSelect'), zoneIdInput: $('zoneIdInput'), zoneNameInput: $('zoneNameInput'), zoneKindSelect: $('zoneKindSelect'), zoneNotesInput: $('zoneNotesInput'), newZoneBtn: $('newZoneBtn'), loadZoneBtn: $('loadZoneBtn'), saveZoneBtn: $('saveZoneBtn'), deleteZoneBtn: $('deleteZoneBtn'),
  trailSelect: $('trailSelect'), trailIdInput: $('trailIdInput'), trailNameInput: $('trailNameInput'), trailZoneSelect: $('trailZoneSelect'), trailFeatureSelect: $('trailFeatureSelect'), trailMinutesInput: $('trailMinutesInput'), trailNotesInput: $('trailNotesInput'), trailMowingCheck: $('trailMowingCheck'), trailSprayingCheck: $('trailSprayingCheck'), trailOmCheck: $('trailOmCheck'), trailDailyCheck: $('trailDailyCheck'), newTrailBtn: $('newTrailBtn'), loadTrailBtn: $('loadTrailBtn'), saveTrailBtn: $('saveTrailBtn'), deleteTrailBtn: $('deleteTrailBtn'),
  markerSelect: $('markerSelect'), markerIdInput: $('markerIdInput'), markerNameInput: $('markerNameInput'), markerTypeSelect: $('markerTypeSelect'), markerZoneSelect: $('markerZoneSelect'), markerLatInput: $('markerLatInput'), markerLngInput: $('markerLngInput'), markerNotesInput: $('markerNotesInput'), markerBrushCheck: $('markerBrushCheck'), newMarkerBtn: $('newMarkerBtn'), loadMarkerBtn: $('loadMarkerBtn'), saveMarkerBtn: $('saveMarkerBtn'), deleteMarkerBtn: $('deleteMarkerBtn')
};

let state = loadLocalState();
let mode = 'pan';
let draft = [];
let selectedLayerId = '';

const map = L.map('adminV2Map', { preferCanvas: true, zoomSnap: 0.25, tapTolerance: 26 }).setView(DEFAULT_CENTER, 12);
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, attribution: '&copy; OpenStreetMap contributors' });
const usgsTopo = L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'USGS The National Map' });
const usgsImageryTopo = L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'USGS The National Map' });
const esriImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' });
osm.addTo(map);
L.control.layers({ Streets: osm, 'USGS Topo': usgsTopo, 'USGS Imagery Topo': usgsImageryTopo, Imagery: esriImagery }, {}, { position: 'topright' }).addTo(map);
L.control.scale({ imperial: true, metric: true }).addTo(map);

const zoneLayer = L.layerGroup().addTo(map);
const trailLayer = L.layerGroup().addTo(map);
const markerLayer = L.layerGroup().addTo(map);
const draftLayer = L.layerGroup().addTo(map);

function injectStyle() {
  const style = document.createElement('style');
  style.textContent = `
    .admin-v2-shell .admin-map { min-height: 64vh; }
    .admin-v2-shell button.active { outline: 2px solid #facc15; box-shadow: 0 0 0 2px rgba(250,204,21,.25); }
    .admin-draft-handle-icon { background: #facc15; border: 2px solid #111827; border-radius: 999px; display: grid; place-items: center; color: #111827; font-weight: 900; }
    .admin-draft-handle-icon span { transform: translateY(-1px); }
  `;
  document.head.append(style);
}

function safeParse(json, fallback) { try { return JSON.parse(json) ?? fallback; } catch { return fallback; } }
function pretty(value) { return JSON.stringify(value, null, 2); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function slug(value, fallback = 'item') { return String(value || fallback).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback; }
function setStatus(message, level = 'neutral') { ui.status.innerHTML = message; ui.status.dataset.level = level; }
function setDrawStatus(message) { ui.drawStatus.textContent = message; }
function latLngPoint(latLng) { return { lat: Number(latLng.lat.toFixed(6)), lng: Number(latLng.lng.toFixed(6)) }; }
function normalizePoint(point) { return point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)) ? { lat: Number(point.lat), lng: Number(point.lng) } : null; }
function normalizePoints(points = []) { return points.map(normalizePoint).filter(Boolean); }
function isCoverage(zone) { return zone?.id === COVERAGE_ZONE_ID || zone?.type === 'coverage' || zone?.role === 'map-coverage'; }
function workZones() { return state.zones.filter((zone) => !isCoverage(zone)); }
function zoneName(id) { return state.zones.find((zone) => zone.id === id)?.name || id || 'No zone'; }

function normalizeState(raw = {}) {
  const zoneSource = Array.isArray(raw.zones) && raw.zones.length ? raw.zones : DEFAULT_ZONES;
  const seenZones = new Set();
  const zones = zoneSource.map((zone, index) => {
    const id = String(zone.id || `zone-${index + 1}`).trim();
    return {
      id,
      name: String(zone.name || zone.label || id).trim(),
      type: isCoverage(zone) ? 'coverage' : String(zone.type || 'work'),
      notes: String(zone.notes || ''),
      boundary: normalizePoints(zone.boundary || zone.points || [])
    };
  }).filter((zone) => zone.id && zone.name && !seenZones.has(zone.id) && seenZones.add(zone.id));
  if (!zones.some(isCoverage)) zones.unshift(clone(DEFAULT_ZONES[0]));

  const validZones = new Set(zones.filter((zone) => !isCoverage(zone)).map((zone) => zone.id));
  const fallbackZone = [...validZones][0] || 'ride1';
  const drawnTrails = (raw.drawnTrails || raw.trails || []).map((trail, index) => {
    const id = String(trail.id || `trail-${index + 1}`).trim();
    const featureType = String(trail.featureType || trail.kind || (trail.flags?.omRoad ? 'om-road' : 'other'));
    return {
      id,
      name: String(trail.name || id).trim(),
      zoneId: validZones.has(trail.zoneId) ? trail.zoneId : fallbackZone,
      featureType,
      overlays: { mowing: Boolean(trail.overlays?.mowing ?? trail.mowing ?? false), spraying: Boolean(trail.overlays?.spraying ?? trail.spraying ?? false) },
      flags: { omRoad: Boolean(trail.flags?.omRoad ?? trail.omRoad ?? featureType === 'om-road'), dailyTravel: Boolean(trail.flags?.dailyTravel ?? trail.dailyTravel ?? false) },
      estimatedMinutes: Number.isFinite(Number(trail.estimatedMinutes)) ? Number(trail.estimatedMinutes) : null,
      notes: String(trail.notes || ''),
      points: normalizePoints(trail.points || [])
    };
  }).filter((trail) => trail.id && trail.name && trail.points.length >= 2);

  const assetTypeIds = new Set(ASSET_TYPES.map(([id]) => id));
  const assets = (raw.assets || raw.markers || []).map((marker, index) => {
    const point = normalizePoint(marker);
    if (!point) return null;
    const type = assetTypeIds.has(marker.type) ? marker.type : 'note';
    const id = String(marker.id || `marker-${index + 1}`).trim();
    return {
      id,
      name: String(marker.name || id).trim(),
      type,
      zoneId: validZones.has(marker.zoneId) ? marker.zoneId : fallbackZone,
      lat: point.lat,
      lng: point.lng,
      needsBrush: Boolean(marker.needsBrush ?? marker.needsClearing ?? DEFAULT_BRUSH_TYPES.has(type)),
      notes: String(marker.notes || '')
    };
  }).filter(Boolean);

  return {
    zones,
    drawnTrails,
    assets,
    logs: Array.isArray(raw.logs) ? raw.logs : [],
    zoneStatus: raw.zoneStatus || {},
    recentSaves: Array.isArray(raw.recentSaves) ? raw.recentSaves : [],
    track: Array.isArray(raw.track) ? raw.track : []
  };
}

function loadLocalState() {
  return normalizeState(safeParse(localStorage.getItem(STORAGE_KEY), safeParse(localStorage.getItem(FIELD_STORAGE_KEY), {})) || {});
}
function saveLocalState() {
  const normalized = normalizeState(state);
  state = normalized;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  localStorage.setItem(FIELD_STORAGE_KEY, JSON.stringify(normalized));
}
function definitionsPayload() {
  const normalized = normalizeState(state);
  return { version: 1, updatedAt: new Date().toISOString(), zones: normalized.zones, drawnTrails: normalized.drawnTrails, assets: normalized.assets };
}
function backupPayload() {
  return { app: 'Interactive Irrigation Mapping', backupVersion: 2, exportedAt: new Date().toISOString(), definitions: definitionsPayload(), state: normalizeState(state) };
}

function downloadJson(name, payload) {
  const blob = new Blob([pretty(payload) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function timestamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }

function importObject(data) {
  if (data?.state) state = normalizeState(data.state);
  else if (data?.definitions) state = normalizeState({ ...state, zones: data.definitions.zones, drawnTrails: data.definitions.drawnTrails || data.definitions.trails, assets: data.definitions.assets || data.definitions.markers });
  else state = normalizeState({ ...state, zones: data.zones, drawnTrails: data.drawnTrails || data.trails, assets: data.assets || data.markers });
  saveLocalState();
  draft = [];
  refreshEverything();
  fitAll();
}
async function reloadRepoDefinitions() {
  try {
    setStatus('Loading data/definitions.json...');
    const response = await fetch(`./data/definitions.json?ts=${Date.now()}`);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    importObject(await response.json());
    setStatus('Loaded repo definitions into the editor.', 'ok');
  } catch (error) {
    setStatus(`Could not load repo definitions: ${error.message}`, 'error');
  }
}
async function importFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    importObject(JSON.parse(await file.text()));
    setStatus(`Imported ${file.name}.`, 'ok');
  } catch (error) {
    setStatus(`Import failed: ${error.message}`, 'error');
  }
}

function populateSelect(select, options, emptyLabel = '') {
  const previous = select.value;
  select.innerHTML = '';
  if (emptyLabel) {
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = emptyLabel;
    select.append(empty);
  }
  for (const [value, label] of options) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
}
function refreshSelects() {
  populateSelect(ui.zoneSelect, state.zones.map((z) => [z.id, `${z.name}${isCoverage(z) ? ' — page edge' : ''}`]), 'New zone');
  populateSelect(ui.trailSelect, state.drawnTrails.map((t) => [t.id, `${t.name} — ${zoneName(t.zoneId)}`]), 'New trail');
  populateSelect(ui.markerSelect, state.assets.map((m) => [m.id, `${m.name} — ${zoneName(m.zoneId)}`]), 'New marker');
  populateSelect(ui.trailZoneSelect, workZones().map((z) => [z.id, z.name]));
  populateSelect(ui.markerZoneSelect, workZones().map((z) => [z.id, z.name]));
  populateSelect(ui.markerTypeSelect, ASSET_TYPES);
}

function zoneColor(zone, selected) { return isCoverage(zone) ? (selected ? '#f59e0b' : '#facc15') : (selected ? '#22d3ee' : '#38bdf8'); }
function trailColor(trail, selected) {
  if (selected) return '#facc15';
  if (trail.featureType === 'major-canal') return '#2563eb';
  if (trail.featureType === 'lateral') return '#ef4444';
  if (trail.featureType === 'road') return '#ffffff';
  if (trail.overlays.spraying) return '#a855f7';
  if (trail.overlays.mowing) return '#22c55e';
  return '#14b8a6';
}
function featureInteractive() { return mode === 'pan'; }
function drawMap() {
  zoneLayer.clearLayers();
  trailLayer.clearLayers();
  markerLayer.clearLayers();
  draftLayer.clearLayers();

  for (const zone of state.zones) {
    if (zone.boundary.length < 3) continue;
    const selected = selectedLayerId === `zone:${zone.id}`;
    const layer = L.polygon(zone.boundary.map((p) => [p.lat, p.lng]), {
      interactive: featureInteractive(), bubblingMouseEvents: true,
      color: zoneColor(zone, selected), weight: selected ? 5 : isCoverage(zone) ? 3 : 2,
      fillOpacity: isCoverage(zone) ? 0.015 : 0.06, dashArray: isCoverage(zone) ? '8 8' : null
    }).bindPopup(`<strong>${zone.name}</strong><br>${isCoverage(zone) ? 'Map page edge' : 'Ride/work zone'}<br>${zone.notes || ''}`);
    layer.on('click', () => { if (mode === 'pan') { ui.zoneSelect.value = zone.id; loadZone(); } });
    layer.addTo(zoneLayer);
  }

  for (const trail of state.drawnTrails) {
    const selected = selectedLayerId === `trail:${trail.id}`;
    const layer = L.polyline(trail.points.map((p) => [p.lat, p.lng]), {
      interactive: featureInteractive(), bubblingMouseEvents: true,
      color: trailColor(trail, selected), weight: selected ? 7 : trail.featureType === 'major-canal' ? 6 : 5,
      opacity: 0.9, dashArray: trail.flags.dailyTravel ? '4 8' : null
    }).bindPopup(`<strong>${trail.name}</strong><br>${zoneName(trail.zoneId)}<br>${trail.featureType}`);
    layer.on('click', () => { if (mode === 'pan') { ui.trailSelect.value = trail.id; loadTrail(); } });
    layer.addTo(trailLayer);
  }

  for (const marker of state.assets) {
    const selected = selectedLayerId === `marker:${marker.id}`;
    const layer = L.circleMarker([marker.lat, marker.lng], {
      interactive: featureInteractive(), bubblingMouseEvents: true,
      radius: selected ? 12 : marker.needsBrush ? 9 : 6,
      weight: selected ? 5 : 3, color: marker.needsBrush ? '#ef4444' : '#facc15', fillColor: marker.needsBrush ? '#f97316' : '#facc15', fillOpacity: 0.85
    }).bindPopup(`<strong>${marker.name}</strong><br>${marker.type}<br>${zoneName(marker.zoneId)}`);
    layer.on('click', () => { if (mode === 'pan') { ui.markerSelect.value = marker.id; loadMarker(); } });
    layer.addTo(markerLayer);
  }

  drawDraft();
}
function handleIcon(index) {
  return L.divIcon({ className: 'admin-draft-handle-icon', html: `<span>${index + 1}</span>`, iconSize: [34,34], iconAnchor: [17,17] });
}
function drawDraft() {
  draftLayer.clearLayers();
  if (mode === 'marker') {
    const lat = Number(ui.markerLatInput.value), lng = Number(ui.markerLngInput.value);
    if (Number.isFinite(lat) && Number.isFinite(lng)) L.circleMarker([lat, lng], { radius: 14, color: '#facc15', fillColor: '#facc15', fillOpacity: 0.55 }).addTo(draftLayer);
    return;
  }
  if (!draft.length) return;
  const latLngs = draft.map((p) => [p.lat, p.lng]);
  if (mode === 'zone') L.polygon(latLngs, { color: '#facc15', weight: 4, fillOpacity: 0.08 }).addTo(draftLayer);
  else if (mode === 'trail') L.polyline(latLngs, { color: '#facc15', weight: 7, dashArray: '8 6' }).addTo(draftLayer);
  draft.forEach((point, index) => {
    const marker = L.marker([point.lat, point.lng], { icon: handleIcon(index), draggable: true, keyboard: false });
    marker.on('dragstart', () => map.dragging.disable());
    marker.on('dragend', (event) => { map.dragging.enable(); draft[index] = latLngPoint(event.target.getLatLng()); drawDraft(); });
    marker.on('click', (event) => L.DomEvent.stop(event));
    marker.addTo(draftLayer);
  });
}
function setMode(nextMode) {
  mode = nextMode;
  for (const [button, buttonMode] of [[ui.modePanBtn,'pan'],[ui.modeZoneBtn,'zone'],[ui.modeTrailBtn,'trail'],[ui.modeMarkerBtn,'marker']]) button.classList.toggle('active', mode === buttonMode);
  const text = mode === 'pan' ? 'Pan/select mode. Tap an existing feature to load it.' : mode === 'zone' ? 'Zone mode. Tap to add boundary points, or use Visible Map. Drag handles to adjust.' : mode === 'trail' ? 'Trail mode. Tap along the road/lateral/canal. Drag handles to adjust.' : 'Marker mode. Tap the marker location.';
  setDrawStatus(text);
  drawMap();
}
map.on('click', (event) => {
  const point = latLngPoint(event.latlng);
  if (mode === 'zone' || mode === 'trail') {
    draft.push(point);
    drawDraft();
    return;
  }
  if (mode === 'marker') {
    ui.markerLatInput.value = point.lat;
    ui.markerLngInput.value = point.lng;
    drawDraft();
  }
});

function visibleBoundary() {
  const b = map.getBounds();
  return [b.getNorthWest(), b.getNorthEast(), b.getSouthEast(), b.getSouthWest()].map(latLngPoint);
}
function useVisibleMap() {
  draft = visibleBoundary();
  setMode('zone');
  setDrawStatus('Visible map area is now the draft zone boundary. Save Zone Boundary to keep it.');
}
function fitAll() {
  const points = [...state.zones.flatMap((z) => z.boundary), ...state.drawnTrails.flatMap((t) => t.points), ...state.assets.map((m) => ({ lat: m.lat, lng: m.lng }))];
  if (points.length) map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [30,30], maxZoom: 16 });
}
function refreshEverything() {
  saveLocalState();
  refreshSelects();
  drawMap();
  setStatus(`Loaded ${state.zones.length} zones, ${state.drawnTrails.length} trails, ${state.assets.length} markers.`, 'ok');
}

function newZone() {
  selectedLayerId = '';
  draft = [];
  ui.zoneSelect.value = '';
  ui.zoneIdInput.value = '';
  ui.zoneNameInput.value = '';
  ui.zoneKindSelect.value = 'work';
  ui.zoneNotesInput.value = '';
  setMode('zone');
}
function loadZone() {
  const zone = state.zones.find((z) => z.id === ui.zoneSelect.value);
  if (!zone) return newZone();
  selectedLayerId = `zone:${zone.id}`;
  ui.zoneIdInput.value = zone.id;
  ui.zoneNameInput.value = zone.name;
  ui.zoneKindSelect.value = isCoverage(zone) ? 'coverage' : 'work';
  ui.zoneNotesInput.value = zone.notes || '';
  draft = clone(zone.boundary || []);
  setMode('zone');
  drawMap();
}
function saveZone() {
  const existingId = ui.zoneSelect.value;
  const kind = ui.zoneKindSelect.value === 'coverage' ? 'coverage' : 'work';
  const id = kind === 'coverage' ? COVERAGE_ZONE_ID : slug(ui.zoneIdInput.value || ui.zoneNameInput.value, `zone-${state.zones.length + 1}`);
  const name = ui.zoneNameInput.value.trim() || (kind === 'coverage' ? 'Map Coverage / Page Edge' : id);
  const boundary = draft.length >= 3 ? clone(draft) : visibleBoundary();
  const zone = { id, name, type: kind, notes: ui.zoneNotesInput.value.trim(), boundary };
  if (kind === 'coverage') state.zones = state.zones.filter((z) => !isCoverage(z) && z.id !== existingId && z.id !== id);
  else state.zones = state.zones.filter((z) => z.id !== existingId && z.id !== id);
  state.zones.push(zone);
  ui.zoneSelect.value = id;
  selectedLayerId = `zone:${id}`;
  refreshEverything();
  ui.zoneSelect.value = id;
  loadZone();
}
function deleteZone() {
  const zone = state.zones.find((z) => z.id === ui.zoneSelect.value);
  if (!zone) return;
  if (!confirm(`Delete ${zone.name}?`)) return;
  if (isCoverage(zone)) {
    zone.boundary = [];
    zone.notes = `${zone.notes || ''} Coverage cleared.`.trim();
  } else {
    state.zones = state.zones.filter((z) => z.id !== zone.id);
    const fallback = workZones()[0]?.id || 'ride1';
    for (const trail of state.drawnTrails) if (trail.zoneId === zone.id) trail.zoneId = fallback;
    for (const marker of state.assets) if (marker.zoneId === zone.id) marker.zoneId = fallback;
  }
  draft = [];
  selectedLayerId = '';
  refreshEverything();
}

function newTrail() {
  selectedLayerId = '';
  draft = [];
  ui.trailSelect.value = '';
  ui.trailIdInput.value = '';
  ui.trailNameInput.value = '';
  ui.trailZoneSelect.value = workZones()[0]?.id || '';
  ui.trailFeatureSelect.value = 'om-road';
  ui.trailMinutesInput.value = '';
  ui.trailNotesInput.value = '';
  ui.trailMowingCheck.checked = false;
  ui.trailSprayingCheck.checked = false;
  ui.trailOmCheck.checked = true;
  ui.trailDailyCheck.checked = false;
  setMode('trail');
}
function loadTrail() {
  const trail = state.drawnTrails.find((t) => t.id === ui.trailSelect.value);
  if (!trail) return newTrail();
  selectedLayerId = `trail:${trail.id}`;
  ui.trailIdInput.value = trail.id;
  ui.trailNameInput.value = trail.name;
  ui.trailZoneSelect.value = trail.zoneId;
  ui.trailFeatureSelect.value = trail.featureType || 'other';
  ui.trailMinutesInput.value = Number.isFinite(trail.estimatedMinutes) ? trail.estimatedMinutes : '';
  ui.trailNotesInput.value = trail.notes || '';
  ui.trailMowingCheck.checked = Boolean(trail.overlays?.mowing);
  ui.trailSprayingCheck.checked = Boolean(trail.overlays?.spraying);
  ui.trailOmCheck.checked = Boolean(trail.flags?.omRoad);
  ui.trailDailyCheck.checked = Boolean(trail.flags?.dailyTravel);
  draft = clone(trail.points || []);
  setMode('trail');
  drawMap();
}
function saveTrail() {
  if (draft.length < 2) return alert('Trail needs at least two points.');
  const existingId = ui.trailSelect.value;
  const id = slug(ui.trailIdInput.value || ui.trailNameInput.value, `trail-${state.drawnTrails.length + 1}`);
  const featureType = ui.trailFeatureSelect.value || 'other';
  const trail = {
    id,
    name: ui.trailNameInput.value.trim() || id,
    zoneId: ui.trailZoneSelect.value || workZones()[0]?.id || 'ride1',
    featureType,
    overlays: { mowing: ui.trailMowingCheck.checked, spraying: ui.trailSprayingCheck.checked },
    flags: { omRoad: ui.trailOmCheck.checked || featureType === 'om-road', dailyTravel: ui.trailDailyCheck.checked },
    estimatedMinutes: Number.isFinite(Number(ui.trailMinutesInput.value)) ? Number(ui.trailMinutesInput.value) : null,
    notes: ui.trailNotesInput.value.trim(),
    points: clone(draft)
  };
  state.drawnTrails = state.drawnTrails.filter((t) => t.id !== existingId && t.id !== id);
  state.drawnTrails.push(trail);
  ui.trailSelect.value = id;
  selectedLayerId = `trail:${id}`;
  refreshEverything();
  ui.trailSelect.value = id;
  loadTrail();
}
function deleteTrail() {
  const trail = state.drawnTrails.find((t) => t.id === ui.trailSelect.value);
  if (!trail || !confirm(`Delete ${trail.name}?`)) return;
  state.drawnTrails = state.drawnTrails.filter((t) => t.id !== trail.id);
  draft = [];
  selectedLayerId = '';
  refreshEverything();
}

function newMarker() {
  selectedLayerId = '';
  ui.markerSelect.value = '';
  ui.markerIdInput.value = '';
  ui.markerNameInput.value = '';
  ui.markerTypeSelect.value = 'note';
  ui.markerZoneSelect.value = workZones()[0]?.id || '';
  ui.markerLatInput.value = '';
  ui.markerLngInput.value = '';
  ui.markerNotesInput.value = '';
  ui.markerBrushCheck.checked = true;
  setMode('marker');
}
function loadMarker() {
  const marker = state.assets.find((m) => m.id === ui.markerSelect.value);
  if (!marker) return newMarker();
  selectedLayerId = `marker:${marker.id}`;
  ui.markerIdInput.value = marker.id;
  ui.markerNameInput.value = marker.name;
  ui.markerTypeSelect.value = marker.type;
  ui.markerZoneSelect.value = marker.zoneId;
  ui.markerLatInput.value = marker.lat;
  ui.markerLngInput.value = marker.lng;
  ui.markerNotesInput.value = marker.notes || '';
  ui.markerBrushCheck.checked = marker.needsBrush;
  setMode('marker');
  drawMap();
}
function saveMarker() {
  const lat = Number(ui.markerLatInput.value), lng = Number(ui.markerLngInput.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return alert('Marker needs coordinates. Use Drop Marker, then tap the map.');
  const existingId = ui.markerSelect.value;
  const id = slug(ui.markerIdInput.value || ui.markerNameInput.value, `marker-${state.assets.length + 1}`);
  const marker = { id, name: ui.markerNameInput.value.trim() || id, type: ui.markerTypeSelect.value || 'note', zoneId: ui.markerZoneSelect.value || workZones()[0]?.id || 'ride1', lat, lng, needsBrush: ui.markerBrushCheck.checked, notes: ui.markerNotesInput.value.trim() };
  state.assets = state.assets.filter((m) => m.id !== existingId && m.id !== id);
  state.assets.push(marker);
  ui.markerSelect.value = id;
  selectedLayerId = `marker:${id}`;
  refreshEverything();
  ui.markerSelect.value = id;
  loadMarker();
}
function deleteMarker() {
  const marker = state.assets.find((m) => m.id === ui.markerSelect.value);
  if (!marker || !confirm(`Delete ${marker.name}?`)) return;
  state.assets = state.assets.filter((m) => m.id !== marker.id);
  selectedLayerId = '';
  refreshEverything();
}

function bindEvents() {
  ui.modePanBtn.addEventListener('click', () => setMode('pan'));
  ui.modeZoneBtn.addEventListener('click', () => setMode('zone'));
  ui.modeTrailBtn.addEventListener('click', () => setMode('trail'));
  ui.modeMarkerBtn.addEventListener('click', () => setMode('marker'));
  ui.useVisibleMapBtn.addEventListener('click', useVisibleMap);
  ui.undoPointBtn.addEventListener('click', () => { draft.pop(); drawDraft(); });
  ui.clearDraftBtn.addEventListener('click', () => { draft = []; drawDraft(); });
  ui.fitAllBtn.addEventListener('click', fitAll);

  ui.loadRepoDefinitionsBtn.addEventListener('click', reloadRepoDefinitions);
  ui.importFileBtn.addEventListener('click', () => ui.importFileInput.click());
  ui.importFileInput.addEventListener('change', importFile);
  ui.exportDefinitionsBtn.addEventListener('click', () => downloadJson('definitions.json', definitionsPayload()));
  ui.exportBackupBtn.addEventListener('click', () => downloadJson(`irrigation-map-data-backup-${timestamp()}.json`, backupPayload()));

  ui.newZoneBtn.addEventListener('click', newZone);
  ui.loadZoneBtn.addEventListener('click', loadZone);
  ui.saveZoneBtn.addEventListener('click', saveZone);
  ui.deleteZoneBtn.addEventListener('click', deleteZone);
  ui.zoneSelect.addEventListener('change', loadZone);

  ui.newTrailBtn.addEventListener('click', newTrail);
  ui.loadTrailBtn.addEventListener('click', loadTrail);
  ui.saveTrailBtn.addEventListener('click', saveTrail);
  ui.deleteTrailBtn.addEventListener('click', deleteTrail);
  ui.trailSelect.addEventListener('change', loadTrail);

  ui.newMarkerBtn.addEventListener('click', newMarker);
  ui.loadMarkerBtn.addEventListener('click', loadMarker);
  ui.saveMarkerBtn.addEventListener('click', saveMarker);
  ui.deleteMarkerBtn.addEventListener('click', deleteMarker);
  ui.markerSelect.addEventListener('change', loadMarker);
}

injectStyle();
bindEvents();
refreshEverything();
setMode('pan');
setTimeout(() => { map.invalidateSize(); fitAll(); }, 150);
