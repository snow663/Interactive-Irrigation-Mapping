(() => {
  if (window.__irrigationUsgsKeyInstalled) return;
  window.__irrigationUsgsKeyInstalled = true;

  function installStyle() {
    if (document.getElementById('usgsKeyStyle')) return;
    const style = document.createElement('style');
    style.id = 'usgsKeyStyle';
    style.textContent = `
      .usgs-key-button { position: fixed; z-index: 1200; right: 14px; top: 62px; border: 1px solid rgba(148,163,184,.35); border-radius: 999px; background: rgba(15,23,42,.92); color: #e5e7eb; padding: 8px 11px; font-weight: 800; box-shadow: 0 12px 32px rgba(0,0,0,.35); cursor: pointer; }
      .usgs-key-panel { position: fixed; z-index: 1199; right: 12px; top: 106px; width: min(94vw, 430px); max-height: min(78vh, 720px); overflow: auto; border: 1px solid rgba(148,163,184,.32); border-radius: 18px; background: rgba(15,23,42,.96); color: #e5e7eb; padding: 14px; box-shadow: 0 24px 70px rgba(0,0,0,.45); }
      .usgs-key-panel h2 { margin: 0 0 6px; font-size: 1.05rem; }
      .usgs-key-panel h3 { margin: 14px 0 7px; font-size: .95rem; color: #f8fafc; }
      .usgs-key-panel p { margin: 0 0 10px; color: #cbd5e1; line-height: 1.35; font-size: .9rem; }
      .usgs-key-grid { display: grid; gap: 8px; }
      .usgs-key-row { display: grid; grid-template-columns: 78px 1fr; gap: 10px; align-items: center; border: 1px solid rgba(148,163,184,.18); border-radius: 12px; padding: 8px; background: rgba(30,41,59,.58); }
      .usgs-key-symbol { min-height: 30px; display: grid; place-items: center; font-family: ui-sans-serif, system-ui, sans-serif; }
      .usgs-key-row strong { display: block; font-size: .9rem; }
      .usgs-key-row span { display: block; color: #cbd5e1; font-size: .78rem; margin-top: 2px; line-height: 1.28; }
      .usgs-line { width: 64px; height: 0; border-top: 4px solid var(--c); }
      .usgs-line.thin { border-top-width: 2px; }
      .usgs-line.dash { border-top-style: dashed; }
      .usgs-line.dot { border-top-style: dotted; }
      .usgs-road { width: 64px; height: 8px; border-top: 3px solid var(--c); border-bottom: 3px solid var(--c); }
      .usgs-area { width: 56px; height: 24px; border-radius: 6px; background: var(--c); border: 1px solid rgba(255,255,255,.35); }
      .usgs-square { width: 18px; height: 18px; background: #111827; border: 1px solid #e5e7eb; }
      .usgs-building { width: 24px; height: 16px; background: #111827; border: 1px solid #e5e7eb; transform: rotate(-2deg); }
      .usgs-cross { position: relative; width: 28px; height: 28px; }
      .usgs-cross::before, .usgs-cross::after { content: ''; position: absolute; background: #e5e7eb; left: 50%; top: 50%; transform: translate(-50%, -50%); }
      .usgs-cross::before { width: 22px; height: 4px; }
      .usgs-cross::after { width: 4px; height: 28px; }
      .usgs-cemetery { font-weight: 900; font-size: 16px; letter-spacing: .02em; }
      .usgs-dot { width: 9px; height: 9px; border-radius: 999px; background: #e5e7eb; box-shadow: 0 0 0 4px rgba(229,231,235,.08); }
      .usgs-circle { width: 20px; height: 20px; border: 3px solid #e5e7eb; border-radius: 999px; }
      .usgs-blue-circle { width: 20px; height: 20px; border: 3px solid #2563eb; border-radius: 999px; }
      .usgs-tank { width: 26px; height: 18px; border: 3px solid #e5e7eb; border-radius: 50% / 38%; }
      .usgs-dam { width: 64px; height: 24px; position: relative; }
      .usgs-dam::before { content: ''; position: absolute; left: 6px; right: 6px; top: 10px; border-top: 4px solid #2563eb; }
      .usgs-dam::after { content: ''; position: absolute; left: 20px; top: 3px; height: 22px; border-left: 6px solid #111827; transform: rotate(18deg); box-shadow: 15px -2px 0 #111827; }
      .usgs-gate { width: 64px; height: 24px; position: relative; }
      .usgs-gate::before { content: ''; position: absolute; left: 4px; right: 4px; top: 11px; border-top: 3px solid #e5e7eb; }
      .usgs-gate::after { content: '×'; position: absolute; left: 26px; top: -2px; font-size: 28px; font-weight: 900; color: #f8fafc; }
      .usgs-rail { width: 66px; height: 22px; border-top: 3px solid #111827; border-bottom: 3px solid #111827; background: repeating-linear-gradient(90deg, transparent 0 8px, #111827 8px 11px, transparent 11px 18px); }
      .usgs-power { width: 66px; height: 26px; position: relative; border-top: 2px solid #111827; border-bottom: 2px solid #111827; }
      .usgs-power::before, .usgs-power::after { content: ''; position: absolute; top: 2px; bottom: 2px; width: 3px; background: #111827; }
      .usgs-power::before { left: 16px; } .usgs-power::after { right: 16px; }
      .usgs-pipeline { width: 66px; height: 0; border-top: 4px dashed #111827; }
      .usgs-mine { position: relative; width: 30px; height: 30px; border: 3px solid #e5e7eb; transform: rotate(45deg); }
      .usgs-mine::after { content: ''; position: absolute; left: 8px; top: 8px; width: 8px; height: 8px; background: #e5e7eb; }
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

      <h3>Point symbols / markers</h3>
      <div class="usgs-key-grid">
        ${row('<div class="usgs-building"></div>', 'Building / structure', 'Small black square or footprint. Larger structures may be drawn in their actual shape.')}
        ${row('<div class="usgs-cross"></div>', 'School or house of worship', 'Marked with a cross-type landmark symbol or label depending on map age/source.')}
        ${row('<div class="usgs-cemetery">Cem</div>', 'Cemetery', 'Usually labeled Cem or Cemetery; may have boundary/area details.')}
        ${row('<div class="usgs-dot"></div>', 'Spot elevation', 'A point with a number nearby. The number is the elevation at that spot.')}
        ${row('<div style="font-weight:900;color:#e5e7eb">BM 3280</div>', 'Bench mark / control point', 'Survey control or benchmark. BM plus number is an elevation reference.')}
        ${row('<div style="font-weight:900;color:#e5e7eb">+ SC</div>', 'Section corner / land survey corner', 'Public Land Survey corner, witness corner, meander corner, or similar surveyed reference.')}
        ${row('<div class="usgs-blue-circle"></div>', 'Spring / seep / water well', 'Blue point symbol or label for spring, seep, water well, geyser, or similar water source.')}
        ${row('<div class="usgs-tank"></div>', 'Tank / covered reservoir', 'Mapped tank, covered reservoir, water structure, or landmark object when labeled.')}
        ${row('<div class="usgs-mine"></div>', 'Mine / quarry / prospect', 'Mine shaft, tunnel, quarry/open pit, gravel pit, prospect, dump, or tailings symbol.')}
        ${row('<div class="usgs-gate"></div>', 'Gate / road block', 'Gate, berm, barrier, or blocked road symbol.')}
        ${row('<div style="font-weight:900;color:#e5e7eb">T H</div>', 'Trailhead', 'Trailhead label or symbol. Often only visible at closer zoom or on older topo detail.')}
      </div>

      <h3>Lines and areas</h3>
      <div class="usgs-key-grid">
        ${row('<div class="usgs-line thin" style="--c:#8b5a2b"></div>', 'Brown contour lines', 'Equal elevation lines. Tight spacing means steep ground; wide spacing means flatter ground.')}
        ${row('<div class="usgs-line" style="--c:#2563eb"></div>', 'Blue water features', 'Streams, rivers, lakes, canals, irrigation ditches, ponds, and other hydrography.')}
        ${row('<div class="usgs-line dash" style="--c:#2563eb"></div>', 'Dashed blue water', 'Intermittent/seasonal drainage, disappearing streams, or uncertain water course depending on symbol.')}
        ${row('<div class="usgs-dam"></div>', 'Dam / lock / water-control structure', 'Dam, lock, flume, aqueduct, or other mapped water-control structure.')}
        ${row('<div class="usgs-road" style="--c:#ef4444"></div>', 'Red / orange roads', 'Important roads, highways, and land-grid/road reference features.')}
        ${row('<div class="usgs-line" style="--c:#111827"></div>', 'Black cultural lines', 'Minor roads, trails, railroads, boundaries, fences, and other man-made features.')}
        ${row('<div class="usgs-line dash" style="--c:#111827"></div>', 'Dashed black lines', 'Often trails, unimproved roads, boundaries, approximate section lines, or other non-solid mapped features.')}
        ${row('<div class="usgs-rail"></div>', 'Railroad', 'Single/multiple track, siding, underpass, bridge, tunnel, or rail yard depending on detail.')}
        ${row('<div class="usgs-power"></div>', 'Power/telephone line', 'Transmission line with poles/towers. Older maps may show telephone lines separately.')}
        ${row('<div class="usgs-pipeline"></div>', 'Pipeline', 'Aboveground or underground pipeline symbols.')}
        ${row('<div class="usgs-area" style="--c:rgba(34,197,94,.55)"></div>', 'Green areas', 'Vegetation or wooded/brush-covered areas.')}
        ${row('<div class="usgs-area" style="--c:rgba(37,99,235,.45)"></div>', 'Blue filled areas', 'Water bodies, marsh/swamp, wet areas, or land subject to inundation.')}
        ${row('<div class="usgs-area" style="--c:rgba(148,163,184,.5)"></div>', 'Gray / red tinted areas', 'Dense built-up areas or mapped development depending on the map series.')}
        ${row('<div style="font-weight:900;color:#e5e7eb">T/R/S</div>', 'Township / range / section grid', 'Public Land Survey System township, range, and section reference lines/numbers.')}
      </div>
      <div class="usgs-key-note">The symbols shown here are field-readable approximations. USGS symbols vary by map age, scale, and source data; use the official symbol sheet for exact cartographic forms and do not treat topo symbols as legal survey boundaries.</div>
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
