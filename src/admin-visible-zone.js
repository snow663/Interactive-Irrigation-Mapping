(() => {
  if (!window.L || !L.map) return;

  const baseMap = L.map;
  L.map = function patchedAdminMap(...args) {
    const map = baseMap.apply(this, args);
    const target = args[0];
    const targetId = typeof target === 'string' ? target : target?.id;
    if (targetId === 'adminMap') window.__irrigationAdminMap = map;
    return map;
  };

  function visibleBoundary(map) {
    const bounds = map.getBounds();
    const nw = bounds.getNorthWest();
    const ne = bounds.getNorthEast();
    const se = bounds.getSouthEast();
    const sw = bounds.getSouthWest();
    return [nw, ne, se, sw].map((latLng) => L.latLng(
      Number(latLng.lat.toFixed(6)),
      Number(latLng.lng.toFixed(6))
    ));
  }

  function draftHandleCount() {
    return document.querySelectorAll('#adminMap .admin-draft-handle-icon').length;
  }

  function ensureZoneTool() {
    const drawZoneBtn = document.getElementById('drawZoneBtn');
    if (drawZoneBtn && !drawZoneBtn.classList.contains('active')) drawZoneBtn.click();
  }

  function setDraftFromVisibleMap({ clearExisting = true } = {}) {
    const map = window.__irrigationAdminMap;
    if (!map) return false;
    if (clearExisting) document.getElementById('clearAdminDraftBtn')?.click();
    ensureZoneTool();
    for (const latLng of visibleBoundary(map)) map.fire('click', { latlng: latLng });
    const help = document.getElementById('adminDrawHelp');
    if (help) help.textContent = 'Visible map area loaded as a rectangular zone boundary. Save Zone to keep it, or drag handles to adjust.';
    return true;
  }

  function installVisibleZoneControls() {
    const saveZoneBtn = document.getElementById('saveZoneBtn');
    const useMapViewBtn = document.getElementById('useMapViewZoneBtn');

    useMapViewBtn?.addEventListener('click', () => setDraftFromVisibleMap({ clearExisting: true }));

    saveZoneBtn?.addEventListener('click', () => {
      if (draftHandleCount() === 0) setDraftFromVisibleMap({ clearExisting: false });
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installVisibleZoneControls);
  else installVisibleZoneControls();
})();
