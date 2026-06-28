const STORAGE_KEY = 'interactive-irrigation-map-v7';
const LEGACY_KEYS = ['interactive-irrigation-map-v6','interactive-irrigation-map-v5','interactive-irrigation-map-v4','interactive-irrigation-map-v3','interactive-irrigation-map-v2','interactive-irrigation-map-v1'];
const MAX_RECENT_SAVES = 10;
const DEFAULT_ZONES = [['ride1','Ride 1'],['ride2','Ride 2'],['ride4','Ride 4'],['ride5','Ride 5'],['ride6','Ride 6'],['ride7','Ride 7'],['ride8','Ride 8'],['ride10','Ride 10']];
const ASSET_TYPES = new Set(['head-gate','valve','box','check','culvert','crossing','washout','spray-area','hazard','problem','poi','note']);
const DEFAULT_BRUSH_TYPES = new Set(['head-gate','check','valve','washout','hazard','problem','poi']);

const $ = (id) => document.getElementById(id);
const zonesJson = $('zonesJson');
const trailsJson = $('trailsJson');
const markersJson = $('markersJson');
const definitionStatus = $('definitionStatus');
const saveDefinitionsBtn = $('saveDefinitionsBtn');
const reloadDefinitionsBtn = $('reloadDefinitionsBtn');
const listEl = $('recentAdminList');
const statusEl = $('adminStatus');
const clearBtn = $('clearRecentBtn');
const reloadBtn = $('reloadAdminBtn');

function safeParse(json, fallback) { try { return JSON.parse(json) ?? fallback; } catch { return fallback; } }
function escapeHtml(value) { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function pretty(value) { return JSON.stringify(value, null, 2); }
function normalizePoint(point) { return point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)) ? { lat: Number(point.lat), lng: Number(point.lng) } : null; }
function normalizePointList(points = []) { return points.map(normalizePoint).filter(Boolean); }
function normalizeZones(zones = []) {
  const source = zones.length ? zones : DEFAULT_ZONES.map(([id,name]) => ({ id, name, notes: '', boundary: [] }));
  const seen = new Set();
  return source.map((z, i) => ({ id: String(z.id || `zone-${i + 1}`).trim(), name: String(z.name || z.label || `Zone ${i + 1}`).trim(), notes: String(z.notes || ''), boundary: normalizePointList(z.boundary || z.points || []) }))
    .filter((z) => z.id && z.name && !seen.has(z.id) && seen.add(z.id));
}
function normalizeTrailOverlays(t = {}) { return { mowing: Boolean(t.overlays?.mowing ?? t.mowing ?? true), spraying: Boolean(t.overlays?.spraying ?? t.spraying ?? false) }; }
function normalizeTrailFlags(t = {}) { return { omRoad: Boolean(t.flags?.omRoad ?? t.omRoad ?? true), dailyTravel: Boolean(t.flags?.dailyTravel ?? t.dailyTravel ?? false) }; }
function normalizeTrails(trails = [], zones = normalizeZones()) {
  const validZone = new Set(zones.map((z) => z.id));
  const fallback = zones[0]?.id || 'ride1';
  return trails.map((t, i) => ({ id: String(t.id || `trail-${Date.now()}-${i}`), name: String(t.name || `Trail ${i + 1}`), zoneId: validZone.has(t.zoneId) ? t.zoneId : fallback, overlays: normalizeTrailOverlays(t), flags: normalizeTrailFlags(t), estimatedMinutes: Number.isFinite(Number(t.estimatedMinutes)) ? Number(t.estimatedMinutes) : null, notes: String(t.notes || ''), points: normalizePointList(t.points || []) }))
    .filter((t) => t.name && t.points.length >= 2);
}
function normalizeMarkers(markers = [], zones = normalizeZones()) {
  const validZone = new Set(zones.map((z) => z.id));
  const fallback = zones[0]?.id || 'ride1';
  return markers.map((m, i) => { const point = normalizePoint(m); const type = ASSET_TYPES.has(m.type) ? m.type : 'note'; return point ? { id: String(m.id || `marker-${Date.now()}-${i}`), name: String(m.name || `Marker ${i + 1}`), type, zoneId: validZone.has(m.zoneId) ? m.zoneId : fallback, lat: point.lat, lng: point.lng, needsBrush: Boolean(m.needsBrush ?? m.needsClearing ?? DEFAULT_BRUSH_TYPES.has(type)), notes: String(m.notes || '') } : null; }).filter(Boolean);
}
function normalizeRecentSaves(items = [], zones = normalizeZones()) {
  const validZone = new Set(zones.map((z) => z.id));
  return items.map((item, index) => ({ id: item.id || `recent-${Date.now()}-${index}`, timestamp: Number.isFinite(item.timestamp) ? item.timestamp : Date.now(), type: String(item.type || 'Saved'), zoneId: validZone.has(item.zoneId) ? item.zoneId : '', title: String(item.title || 'Saved record'), details: String(item.details || '') })).sort((a,b) => b.timestamp - a.timestamp).slice(0, MAX_RECENT_SAVES);
}
function normalizeState(raw = {}) {
  const zones = normalizeZones(raw.zones);
  return {
    zones,
    drawnTrails: normalizeTrails(raw.drawnTrails || raw.trails || [], zones),
    assets: normalizeMarkers(raw.assets || raw.markers || [], zones),
    logs: Array.isArray(raw.logs) ? raw.logs : [],
    zoneStatus: raw.zoneStatus || {},
    recentSaves: normalizeRecentSaves(raw.recentSaves || [], zones),
    track: Array.isArray(raw.track) ? raw.track : []
  };
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
function saveState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state))); }

function loadDefinitionsToTextareas() {
  const { key, state } = loadState();
  zonesJson.value = pretty(state.zones);
  trailsJson.value = pretty(state.drawnTrails);
  markersJson.value = pretty(state.assets);
  definitionStatus.innerHTML = `Storage key: <strong>${escapeHtml(key)}</strong><br>${state.zones.length} zones, ${state.drawnTrails.length} trails, ${state.assets.length} markers.`;
}
function parseEditor(text, label) {
  const value = JSON.parse(text || '[]');
  if (!Array.isArray(value)) throw new Error(`${label} must be a JSON array.`);
  return value;
}
function saveDefinitions() {
  try {
    const current = loadState().state;
    const zones = normalizeZones(parseEditor(zonesJson.value, 'Zones'));
    const trails = normalizeTrails(parseEditor(trailsJson.value, 'Trails'), zones);
    const markers = normalizeMarkers(parseEditor(markersJson.value, 'Markers'), zones);
    const next = { ...current, zones, drawnTrails: trails, assets: markers };
    saveState(next);
    loadDefinitionsToTextareas();
    renderRecent();
    definitionStatus.innerHTML += '<br><strong>Definitions saved.</strong>';
  } catch (error) {
    definitionStatus.innerHTML = `<strong>Definition save failed:</strong> ${escapeHtml(error.message)}`;
  }
}

function renderRecent() {
  const { key, state } = loadState();
  statusEl.innerHTML = `Storage key: <strong>${escapeHtml(key)}</strong><br>${state.recentSaves.length} recent record${state.recentSaves.length === 1 ? '' : 's'} found.`;
  listEl.innerHTML = '';
  if (!state.recentSaves.length) { listEl.innerHTML = '<p class="empty-recent">No recent saved records on this device.</p>'; return; }
  state.recentSaves.forEach((item, index) => {
    const row = document.createElement('article');
    row.className = 'admin-row';
    row.innerHTML = `
      <div class="admin-row-head"><strong>${index + 1}. ${escapeHtml(item.type)} — ${escapeHtml(item.title)}</strong><span>${new Date(item.timestamp).toLocaleString()}</span></div>
      <label>Type<input data-field="type" data-index="${index}" value="${escapeHtml(item.type)}" /></label>
      <label>Title<input data-field="title" data-index="${index}" value="${escapeHtml(item.title)}" /></label>
      <label>Zone<input data-field="zoneId" data-index="${index}" value="${escapeHtml(item.zoneId)}" /></label>
      <label>Details<textarea data-field="details" data-index="${index}">${escapeHtml(item.details)}</textarea></label>
      <div class="controls"><button data-action="save" data-index="${index}" class="primary">Save Edit</button><button data-action="delete" data-index="${index}" class="danger">Delete Entry</button></div>`;
    listEl.append(row);
  });
}
function updateRecentEntry(index) {
  const { state } = loadState();
  const item = state.recentSaves[index];
  if (!item) return;
  for (const field of ['type','title','zoneId','details']) {
    const input = document.querySelector(`[data-field="${field}"][data-index="${index}"]`);
    if (input) item[field] = input.value;
  }
  saveState(state);
  renderRecent();
}
function deleteRecentEntry(index) {
  const { state } = loadState();
  if (!state.recentSaves[index]) return;
  if (!window.confirm('Delete this Last 10 saved entry? Map definitions and logs are not deleted.')) return;
  state.recentSaves.splice(index, 1);
  saveState(state);
  renderRecent();
}

saveDefinitionsBtn.addEventListener('click', saveDefinitions);
reloadDefinitionsBtn.addEventListener('click', loadDefinitionsToTextareas);
listEl.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const index = Number(button.dataset.index);
  if (button.dataset.action === 'save') updateRecentEntry(index);
  if (button.dataset.action === 'delete') deleteRecentEntry(index);
});
clearBtn.addEventListener('click', () => {
  if (!window.confirm('Clear the entire Last 10 saved list? Map definitions and logs are not deleted.')) return;
  const { state } = loadState();
  state.recentSaves = [];
  saveState(state);
  renderRecent();
});
reloadBtn.addEventListener('click', renderRecent);
loadDefinitionsToTextareas();
renderRecent();
