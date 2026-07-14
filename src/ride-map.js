const STORAGE_KEYS = ['interactive-irrigation-map-v8', 'interactive-irrigation-map-v7'];
const DEFAULT_CENTER = [44.695, -103.6325];
const COVERAGE_ZONE_ID = 'map-coverage';
const DEFAULT_RIDE_COLORS = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'];

const $ = (id) => document.getElementById(id);
const ui = {
  menu: $('rideMenu'), menuToggle: $('rideMenuToggle'), cards: $('rideCards'), reload: $('reloadRideDataBtn'),
  title: $('rideTitle'), subtitle: $('rideSubtitle'), stats: $('rideStats'),
  gps: $('gpsRideBtn'), follow: $('followRideBtn'), fit: $('fitRideBtn'), clearLive: $('clearLiveTrackBtn')
};

let state = { zones: [], drawnTrails: [], assets: [], logs: [] };
let selectedRideId = localStorage.getItem('interactive-irrigation-selected-ride') || '';
let watchId = null;
let follow = true;
let liveTrack = [];
let currentPoint = null;

const map = L.map('rideLevelMap', { zoomControl: false, preferCanvas: true, maxBoundsViscosity: 1.0 }).setView(DEFAULT_CENTER, 12);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.control.scale({ imperial: true, metric: true }).addTo(map);
const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, attribution: '&copy; OpenStreetMap contributors' });
const usgsTopo = L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'USGS The National Map' });
const usgsImageryTopo = L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'USGS The National Map' });
const imagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' });
streets.addTo(map);
L.control.layers({ Streets: streets, 'USGS Topo': usgsTopo, 'USGS Imagery Topo': usgsImageryTopo, Imagery: imagery }, {}, { position: 'topright' }).addTo(map);

const boundaryLayer = L.layerGroup().addTo(map);
const trackLayer = L.layerGroup().addTo(map);
const markerLayer = L.layerGroup().addTo(map);
const liveLayer = L.layerGroup().addTo(map);
const liveTrackLayer = L.polyline([], { color: '#facc15', weight: 4, opacity: 0.9, dashArray: '4 8' }).addTo(liveLayer);
const gpsIcon = L.divIcon({ className: 'gps-location-icon', html: '<div class="gps-arrow"></div><div class="gps-dot"></div>', iconSize: [44,44], iconAnchor: [22,22] });
const locationMarker = L.marker(DEFAULT_CENTER, { icon: gpsIcon, interactive: false });
const accuracyCircle = L.circle(DEFAULT_CENTER, { radius: 0, stroke: true, weight: 1, opacity: 0.75, fillOpacity: 0.12, color: '#0ea5e9', fillColor: '#0ea5e9' });

function safeParse(json, fallback) { try { return JSON.parse(json) ?? fallback; } catch { return fallback; } }
function escapeHtml(value) { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function toLatLng(point) { return [Number(point.lat), Number(point.lng)]; }
function isPoint(point) { return point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)); }
function isCoverage(zone) { return zone?.id === COVERAGE_ZONE_ID || zone?.type === 'coverage' || zone?.role === 'map-coverage'; }
function rideZones() { return state.zones.filter((zone) => !isCoverage(zone)); }
function rideTracks(rideId) { return state.drawnTrails.filter((trail) => trail.zoneId === rideId || trail.rideId === rideId); }
function rideMarkers(rideId) { return state.assets.filter((marker) => marker.zoneId === rideId || marker.rideId === rideId); }
function rideLogs(rideId) { return state.logs.filter((log) => log.zoneId === rideId || log.rideId === rideId); }
function rideColor(ride, index = 0) {
  const trackColor = rideTracks(ride.id).find((trail) => trail.color)?.color;
  return ride.color || trackColor || DEFAULT_RIDE_COLORS[index % DEFAULT_RIDE_COLORS.length];
}
function rideRider(ride) {
  return ride.ditchRider || ride.rider || rideTracks(ride.id).find((trail) => trail.ditchRider)?.ditchRider || '';
}
function normalizePoint(point) {
  if (!isPoint(point)) return null;
  return { lat: Number(point.lat), lng: Number(point.lng), timestamp: Number.isFinite(point.timestamp) ? point.timestamp : Date.now(), accuracy: Number.isFinite(point.accuracy) ? point.accuracy : null, heading: Number.isFinite(point.heading) ? point.heading : null };
}
function normalizePoints(points = []) { return points.map(normalizePoint).filter(Boolean); }
function normalizeDefinitions(raw = {}) {
  const zones = Array.isArray(raw.zones) ? raw.zones.map((zone, index) => ({
    id: String(zone.id || `ride-${index + 1}`),
    name: String(zone.name || zone.label || zone.id || `Ride ${index + 1}`),
    type: String(zone.type || zone.role || 'work'),
    notes: String(zone.notes || ''),
    color: String(zone.color || ''),
    ditchRider: String(zone.ditchRider || zone.rider || ''),
    boundary: normalizePoints(zone.boundary || zone.points || [])
  })).filter((zone) => zone.id && zone.name) : [];
  const validRides = new Set(zones.filter((zone) => !isCoverage(zone)).map((zone) => zone.id));
  const fallbackRide = [...validRides][0] || 'ride1';
  const drawnTrails = (raw.drawnTrails || raw.trails || []).map((trail, index) => ({
    id: String(trail.id || `trail-${index + 1}`),
    name: String(trail.name || `Trail ${index + 1}`),
    zoneId: validRides.has(trail.zoneId) ? trail.zoneId : fallbackRide,
    rideId: validRides.has(trail.rideId) ? trail.rideId : '',
    featureType: String(trail.featureType || trail.kind || ''),
    color: String(trail.color || ''),
    ditchRider: String(trail.ditchRider || trail.rider || ''),
    notes: String(trail.notes || ''),
    overlays: trail.overlays || {},
    flags: trail.flags || {},
    points: normalizePoints(trail.points || [])
  })).filter((trail) => trail.points.length >= 2);
  const assets = (raw.assets || raw.markers || []).map((marker, index) => {
    const point = normalizePoint(marker);
    return point ? { ...point, id: String(marker.id || `marker-${index + 1}`), name: String(marker.name || `Marker ${index + 1}`), type: String(marker.type || 'note'), zoneId: validRides.has(marker.zoneId) ? marker.zoneId : fallbackRide, rideId: validRides.has(marker.rideId) ? marker.rideId : '', notes: String(marker.notes || ''), needsBrush: Boolean(marker.needsBrush ?? marker.needsClearing ?? false) } : null;
  }).filter(Boolean);
  const logs = Array.isArray(raw.logs) ? raw.logs : [];
  return { zones, drawnTrails, assets, logs };
}
function mergeLocalAndRepo(repoDefinitions) {
  for (const key of STORAGE_KEYS) {
    const local = safeParse(localStorage.getItem(key), null);
    if (local?.zones?.length || local?.drawnTrails?.length || local?.assets?.length) return normalizeDefinitions(local);
  }
  return normalizeDefinitions(repoDefinitions || {});
}
async function loadDefinitions({ forceRepo = false } = {}) {
  let repo = null;
  try {
    const response = await fetch(`./data/definitions.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (response.ok) repo = await response.json();
  } catch {}
  state = forceRepo ? normalizeDefinitions(repo || {}) : mergeLocalAndRepo(repo || {});
  if (!selectedRideId || !rideZones().some((ride) => ride.id === selectedRideId)) selectedRideId = rideZones()[0]?.id || '';
  if (forceRepo) {
    localStorage.setItem(STORAGE_KEYS[0], JSON.stringify({ ...state, track: [] }));
    localStorage.setItem(STORAGE_KEYS[1], JSON.stringify({ ...state, track: [] }));
  }
  renderRideMenu();
  selectRide(selectedRideId, { fit: true });
}

function renderRideMenu() {
  ui.cards.innerHTML = '';
  const rides = rideZones();
  if (!rides.length) {
    ui.cards.innerHTML = '<p>No rides are defined.</p>';
    return;
  }
  rides.forEach((ride, index) => {
    const tracks = rideTracks(ride.id);
    const markers = rideMarkers(ride.id);
    const logs = rideLogs(ride.id);
    const color = rideColor(ride, index);
    const rider = rideRider(ride);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ride-card${ride.id === selectedRideId ? ' active' : ''}`;
    button.style.setProperty('--ride-color', color);
    button.innerHTML = `
      <strong><span class="ride-color-dot"></span>${escapeHtml(ride.name)}</strong>
      <span>${rider ? `Ditch rider: ${escapeHtml(rider)} • ` : ''}${tracks.length} track${tracks.length === 1 ? '' : 's'} • ${markers.length} marker${markers.length === 1 ? '' : 's'} • ${logs.length} log${logs.length === 1 ? '' : 's'}</span>
    `;
    button.addEventListener('click', () => selectRide(ride.id, { fit: true, closeMenu: true }));
    ui.cards.append(button);
  });
}
function selectedRide() { return rideZones().find((ride) => ride.id === selectedRideId) || null; }
function rideBounds(ride) {
  const points = [];
  if (ride?.boundary?.length) points.push(...ride.boundary);
  for (const trail of rideTracks(ride.id)) points.push(...trail.points);
  for (const marker of rideMarkers(ride.id)) points.push(marker);
  if (!points.length) return null;
  return L.latLngBounds(points.map(toLatLng));
}
function fitSelectedRide() {
  const ride = selectedRide();
  const bounds = ride ? rideBounds(ride) : null;
  if (bounds?.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
}
function setSelectedRideBounds() {
  const ride = selectedRide();
  const bounds = ride ? rideBounds(ride) : null;
  if (bounds?.isValid()) map.setMaxBounds(bounds.pad(0.2));
  else map.setMaxBounds(null);
}
function selectRide(rideId, { fit = false, closeMenu = false } = {}) {
  selectedRideId = rideId;
  localStorage.setItem('interactive-irrigation-selected-ride', rideId || '');
  renderRideMenu();
  drawSelectedRide();
  setSelectedRideBounds();
  if (fit) fitSelectedRide();
  if (closeMenu && window.matchMedia('(max-width: 820px)').matches) ui.menu.classList.remove('open');
}
function drawSelectedRide() {
  boundaryLayer.clearLayers();
  trackLayer.clearLayers();
  markerLayer.clearLayers();
  const ride = selectedRide();
  if (!ride) {
    ui.title.textContent = 'No ride selected';
    ui.subtitle.textContent = 'Select a ride from the menu.';
    ui.stats.innerHTML = '';
    return;
  }
  const rides = rideZones();
  const color = rideColor(ride, rides.findIndex((r) => r.id === ride.id));
  const rider = rideRider(ride);
  const tracks = rideTracks(ride.id);
  const markers = rideMarkers(ride.id);
  const logs = rideLogs(ride.id);
  if (ride.boundary.length >= 3) {
    L.polygon(ride.boundary.map(toLatLng), { color, weight: 4, fillOpacity: 0.05, dashArray: '10 6' })
      .bindPopup(`<strong>${escapeHtml(ride.name)}</strong><br>${rider ? `Ditch rider: ${escapeHtml(rider)}<br>` : ''}${escapeHtml(ride.notes || '')}`)
      .addTo(boundaryLayer);
  }
  for (const trail of tracks) {
    const lineColor = trail.color || color;
    L.polyline(trail.points.map(toLatLng), { color: lineColor, weight: trail.featureType === 'ride-track' ? 7 : 5, opacity: 0.92 })
      .bindPopup(`<strong>${escapeHtml(trail.name)}</strong><br>${rider ? `Ditch rider: ${escapeHtml(rider)}<br>` : ''}${escapeHtml(trail.notes || '')}`)
      .addTo(trackLayer);
  }
  for (const marker of markers) {
    const label = L.divIcon({ className: 'ride-marker-label', html: escapeHtml(marker.name || marker.type || 'Marker') });
    L.marker([marker.lat, marker.lng], { icon: label })
      .bindPopup(`<strong>${escapeHtml(marker.name)}</strong><br>${escapeHtml(marker.type)}<br>${escapeHtml(marker.notes || '')}`)
      .addTo(markerLayer);
  }
  ui.title.innerHTML = `<span class="ride-color-dot" style="--ride-color:${color}"></span>${escapeHtml(ride.name)}`;
  ui.subtitle.textContent = rider ? `Ditch rider: ${rider}` : (ride.notes || 'Ride map loaded.');
  ui.stats.innerHTML = [
    `${tracks.length} track${tracks.length === 1 ? '' : 's'}`,
    `${totalTrackPoints(tracks)} GPS point${totalTrackPoints(tracks) === 1 ? '' : 's'}`,
    `${markers.length} marker${markers.length === 1 ? '' : 's'}`,
    `${logs.length} log${logs.length === 1 ? '' : 's'}`,
    currentPoint ? locationRelationText(ride, currentPoint) : 'GPS not active'
  ].map((text) => `<span>${escapeHtml(text)}</span>`).join('');
}
function totalTrackPoints(tracks) { return tracks.reduce((sum, trail) => sum + trail.points.length, 0); }
function pointInPolygon(point, polygon) {
  if (!polygon?.length) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersects = ((yi > point.lat) !== (yj > point.lat)) && (point.lng < (xj - xi) * (point.lat - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}
function locationRelationText(ride, point) {
  if (ride.boundary?.length >= 3) return pointInPolygon(point, ride.boundary) ? 'GPS inside selected ride' : 'GPS outside selected ride';
  return 'GPS active';
}
function ensureGpsLayer() {
  if (!liveLayer.hasLayer(locationMarker)) locationMarker.addTo(liveLayer);
  if (!liveLayer.hasLayer(accuracyCircle)) accuracyCircle.addTo(liveLayer);
}
function updateGpsMarker(point) {
  ensureGpsLayer();
  const latLng = [point.lat, point.lng];
  locationMarker.setLatLng(latLng);
  accuracyCircle.setLatLng(latLng);
  accuracyCircle.setRadius(Number.isFinite(point.accuracy) ? point.accuracy : 0);
  const element = locationMarker.getElement();
  if (element) {
    element.style.setProperty('--heading', `${Number.isFinite(point.heading) ? point.heading : 0}deg`);
    element.classList.toggle('has-heading', Number.isFinite(point.heading));
  }
  if (follow) map.setView(latLng, Math.max(map.getZoom(), 16), { animate: true });
}
function normalizePosition(position) {
  const c = position.coords;
  return { lat: c.latitude, lng: c.longitude, accuracy: c.accuracy, heading: c.heading, timestamp: position.timestamp || Date.now() };
}
function recordPosition(position) {
  currentPoint = normalizePosition(position);
  liveTrack.push(currentPoint);
  liveTrackLayer.setLatLngs(liveTrack.map(toLatLng));
  updateGpsMarker(currentPoint);
  drawSelectedRide();
}
function gpsError(error) {
  const message = { 1: 'Location permission denied.', 2: 'Location unavailable.', 3: 'GPS timed out.' }[error.code] || error.message || 'GPS error.';
  ui.subtitle.textContent = message;
}
function startGps() {
  if (!navigator.geolocation) { ui.subtitle.textContent = 'GPS unavailable in this browser.'; return; }
  if (!window.isSecureContext) { ui.subtitle.textContent = 'GPS needs HTTPS or localhost.'; return; }
  if (watchId !== null) return;
  watchId = navigator.geolocation.watchPosition(recordPosition, gpsError, { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
  ui.gps.textContent = 'Stop GPS';
}
function stopGps() {
  if (watchId === null) return;
  navigator.geolocation.clearWatch(watchId);
  watchId = null;
  ui.gps.textContent = 'Use My Location';
}

ui.menuToggle.addEventListener('click', () => ui.menu.classList.toggle('open'));
ui.reload.addEventListener('click', () => loadDefinitions({ forceRepo: true }));
ui.fit.addEventListener('click', fitSelectedRide);
ui.gps.addEventListener('click', () => watchId === null ? startGps() : stopGps());
ui.follow.addEventListener('click', () => { follow = !follow; ui.follow.textContent = `Follow: ${follow ? 'On' : 'Off'}`; });
ui.clearLive.addEventListener('click', () => { liveTrack = []; liveTrackLayer.setLatLngs([]); });

await loadDefinitions();
setTimeout(() => { map.invalidateSize(); fitSelectedRide(); }, 150);
