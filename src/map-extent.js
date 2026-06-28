(() => {
  if (!window.L || !L.Map) return;

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
