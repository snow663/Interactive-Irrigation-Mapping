(() => {
  if (!window.L || !L.Map) return;

  const usgsTopo = () => L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 16,
    attribution: 'USGS The National Map'
  });

  const usgsImageryTopo = () => L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 16,
    attribution: 'USGS The National Map'
  });

  const baseLayersControl = L.control.layers;
  L.control.layers = function patchedLayerControl(baseLayers = {}, overlays = {}, options = {}) {
    const usgsOnlyBaseLayers = {
      'USGS Topo': baseLayers['USGS Topo'] || usgsTopo(),
      'USGS Imagery Topo': baseLayers['USGS Imagery Topo'] || usgsImageryTopo()
    };
    return baseLayersControl.call(this, usgsOnlyBaseLayers, overlays, options);
  };

  const baseSetMaxBounds = L.Map.prototype.setMaxBounds;
  L.Map.prototype.setMaxBounds = function setExtentMaxBounds(bounds) {
    const result = baseSetMaxBounds.call(this, bounds);
    if (!bounds) return result;

    const extent = L.latLngBounds(bounds);
    window.setTimeout(() => {
      if (!this._container || !extent.isValid()) return;
      const fitZoom = this.getBoundsZoom(extent, false);
      if (!Number.isFinite(fitZoom)) return;
      this.setMinZoom(Math.max(0, fitZoom));
      if (this.getZoom() < fitZoom) this.setZoom(fitZoom, { animate: false });
      this.panInsideBounds(extent, { animate: false });
    }, 0);

    return result;
  };
})();
