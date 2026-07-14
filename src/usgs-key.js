(() => {
  if (window.__irrigationUsgsKeyInstalled) return;
  window.__irrigationUsgsKeyInstalled = true;

  function installStyle() {
    if (document.getElementById('usgsKeyStyle')) return;
    const style = document.createElement('style');
    style.id = 'usgsKeyStyle';
    style.textContent = `
      .usgs-key-button { position: fixed; z-index: 1200; right: 14px; top: 62px; border: 1px solid rgba(148,163,184,.35); border-radius: 999px; background: rgba(15,23,42,.92); color: #e5e7eb; padding: 8px 11px; font-weight: 800; box-shadow: 0 12px 32px rgba(0,0,0,.35); cursor: pointer; }
      .usgs-key-panel { position: fixed; z-index: 1199; right: 12px; top: 106px; width: min(92vw, 390px); max-height: min(76vh, 680px); overflow: auto; border: 1px solid rgba(148,163,184,.32); border-radius: 18px; background: rgba(15,23,42,.96); color: #e5e7eb; padding: 14px; box-shadow: 0 24px 70px rgba(0,0,0,.45); }
      .usgs-key-panel h2 { margin: 0 0 6px; font-size: 1.05rem; }
      .usgs-key-panel p { margin: 0 0 10px; color: #cbd5e1; line-height: 1.35; font-size: .9rem; }
      .usgs-key-grid { display: grid; gap: 8px; }
      .usgs-key-row { display: grid; grid-template-columns: 76px 1fr; gap: 10px; align-items: center; border: 1px solid rgba(148,163,184,.18); border-radius: 12px; padding: 8px; background: rgba(30,41,59,.58); }
      .usgs-key-symbol { min-height: 28px; display: grid; place-items: center; }
      .usgs-key-row strong { display: block; font-size: .9rem; }
      .usgs-key-row span { display: block; color: #cbd5e1; font-size: .78rem; margin-top: 2px; line-height: 1.28; }
      .usgs-line { width: 64px; height: 0; border-top: 4px solid var(--c); }
      .usgs-line.thin { border-top-width: 2px; }
      .usgs-line.dash { border-top-style: dashed; }
      .usgs-line.dot { border-top-style: dotted; }
      .usgs-road { width: 64px; height: 8px; border-top: 3px solid var(--c); border-bottom: 3px solid var(--c); }
      .usgs-area { width: 56px; height: 24px; border-radius: 6px; background: var(--c); border: 1px solid rgba(255,255,255,.35); }
      .usgs-square { width: 18px; height: 18px; background: #111827; border: 1px solid #e5e7eb; }
      .usgs-key-note { margin-top: 10px; color: #94a3b8; font-size: .78rem; }
      @media (max-width: 820px) { .usgs-key-button { top: 12px; right: 12px; } .usgs-key-panel { top: 54px; right: 8px; left: 8px; width: auto; } }
    `;
    document.head.append(style);
  }

  function row(symbol, title, detail) {
    return `<div class="usgs-key-row"><div class="usgs-key-symbol">${symbol}</div><div><strong>${title}</strong><span>${detail}</span></div></div>`;
  }

  function panelHtml() {
    return `
      <h2>USGS topo key</h2>
      <p>Common symbols on USGS Topo and USGS Imagery Topo. The imagery version uses the same labeled/topographic reference layer over aerial imagery.</p>
      <div class="usgs-key-grid">
        ${row('<div class="usgs-line thin" style="--c:#8b5a2b"></div>', 'Brown contour lines', 'Equal elevation lines. Tight spacing means steep ground; wide spacing means flatter ground.')}
        ${row('<div class="usgs-line" style="--c:#2563eb"></div>', 'Blue water features', 'Streams, rivers, lakes, canals, irrigation ditches, ponds, and other hydrography.')}
        ${row('<div class="usgs-line dash" style="--c:#2563eb"></div>', 'Dashed blue water', 'Intermittent/seasonal drainage, disappearing streams, or uncertain water course depending on symbol.')}
        ${row('<div class="usgs-road" style="--c:#ef4444"></div>', 'Red / orange roads', 'Important roads, highways, and land-grid/road reference features.')}
        ${row('<div class="usgs-line" style="--c:#111827"></div>', 'Black cultural lines', 'Minor roads, trails, railroads, boundaries, fences, and other man-made features.')}
        ${row('<div class="usgs-line dash" style="--c:#111827"></div>', 'Dashed black lines', 'Often trails, unimproved roads, boundaries, approximate section lines, or other non-solid mapped features.')}
        ${row('<div class="usgs-area" style="--c:rgba(34,197,94,.55)"></div>', 'Green areas', 'Vegetation or wooded/brush-covered areas.')}
        ${row('<div class="usgs-area" style="--c:rgba(37,99,235,.45)"></div>', 'Blue filled areas', 'Water bodies or wet areas.')}
        ${row('<div class="usgs-area" style="--c:rgba(148,163,184,.5)"></div>', 'Gray / red tinted areas', 'Dense built-up areas or mapped development depending on the map series.')}
        ${row('<div class="usgs-square"></div>', 'Black squares / shapes', 'Buildings, structures, tanks, wells, or other landmark objects when labeled.')}
        ${row('<div style="font-weight:900;color:#e5e7eb">BM 3280</div>', 'BM / spot elevation', 'Bench marks and spot elevations. Numbers are elevations.')}
        ${row('<div style="font-weight:900;color:#e5e7eb">T/R/S</div>', 'Township / range / section grid', 'Public Land Survey System township, range, and section reference lines/numbers.')}
      </div>
      <div class="usgs-key-note">USGS symbols vary by map age, scale, and source data. Use this as a field-reading guide, not a survey/legal boundary reference.</div>
    `;
  }

  function installPanel() {
    if (document.getElementById('usgsKeyButton')) return;
    const button = document.createElement('button');
    button.id = 'usgsKeyButton';
    button.className = 'usgs-key-button';
    button.type = 'button';
    button.textContent = 'USGS Key';
    const panel = document.createElement('section');
    panel.id = 'usgsKeyPanel';
    panel.className = 'usgs-key-panel';
    panel.hidden = true;
    panel.innerHTML = panelHtml();
    button.addEventListener('click', () => { panel.hidden = !panel.hidden; });
    document.body.append(button, panel);
  }

  installStyle();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installPanel);
  else installPanel();
})();
