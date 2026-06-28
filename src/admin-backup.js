(() => {
  const STORAGE_KEY = 'interactive-irrigation-map-v8';
  const FIELD_STORAGE_KEY = 'interactive-irrigation-map-v7';

  const $ = (id) => document.getElementById(id);

  function safeParse(json, fallback) {
    try { return JSON.parse(json) ?? fallback; } catch { return fallback; }
  }

  function pretty(value) {
    return JSON.stringify(value, null, 2);
  }

  function timestampSlug() {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }

  function downloadJson(filename, value) {
    const blob = new Blob([pretty(value) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function readEditorJson(id, fallback) {
    const element = $(id);
    if (!element) return fallback;
    return safeParse(element.value, fallback);
  }

  function currentState() {
    const stored = safeParse(localStorage.getItem(STORAGE_KEY), {}) || {};
    return {
      ...stored,
      zones: readEditorJson('zonesJson', stored.zones || []),
      drawnTrails: readEditorJson('trailsJson', stored.drawnTrails || stored.trails || []),
      assets: readEditorJson('markersJson', stored.assets || stored.markers || [])
    };
  }

  function currentDefinitions() {
    const state = currentState();
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      zones: Array.isArray(state.zones) ? state.zones : [],
      drawnTrails: Array.isArray(state.drawnTrails) ? state.drawnTrails : [],
      assets: Array.isArray(state.assets) ? state.assets : []
    };
  }

  function currentBackup() {
    const state = currentState();
    return {
      app: 'Interactive Irrigation Mapping',
      backupVersion: 1,
      exportedAt: new Date().toISOString(),
      source: location.href,
      storageKey: STORAGE_KEY,
      contents: {
        definitions: true,
        logs: true,
        zoneStatus: true,
        recentSaves: true,
        gpsTrack: true
      },
      definitions: currentDefinitions(),
      state: {
        zones: Array.isArray(state.zones) ? state.zones : [],
        drawnTrails: Array.isArray(state.drawnTrails) ? state.drawnTrails : [],
        assets: Array.isArray(state.assets) ? state.assets : [],
        logs: Array.isArray(state.logs) ? state.logs : [],
        zoneStatus: state.zoneStatus || {},
        recentSaves: Array.isArray(state.recentSaves) ? state.recentSaves : [],
        track: Array.isArray(state.track) ? state.track : []
      }
    };
  }

  function installPanel() {
    if ($('dataBackupCard')) return;
    const card = document.createElement('section');
    card.id = 'dataBackupCard';
    card.className = 'admin-card';
    card.innerHTML = `
      <h2>Data backup / file export</h2>
      <p>Save non-code map data to a file, or reload a saved data file back into this browser. Use <strong>Save definitions.json</strong> when you want a clean repo file for <code>data/definitions.json</code>.</p>
      <div class="controls">
        <button id="saveDataBackupBtn" class="primary" type="button">Save Data Backup</button>
        <button id="saveDefinitionsJsonBtn" type="button">Save definitions.json</button>
        <button id="loadDataBackupBtn" type="button">Load Data Backup</button>
        <input id="loadDataBackupInput" type="file" accept="application/json,.json" hidden />
      </div>
      <div id="dataBackupStatus" class="logistics-output">Backup idle.</div>
    `;
    const reference = document.querySelector('.sync-card') || document.querySelector('.admin-card');
    reference?.insertAdjacentElement('afterend', card);

    $('saveDataBackupBtn')?.addEventListener('click', saveDataBackup);
    $('saveDefinitionsJsonBtn')?.addEventListener('click', saveDefinitionsJson);
    $('loadDataBackupBtn')?.addEventListener('click', () => $('loadDataBackupInput')?.click());
    $('loadDataBackupInput')?.addEventListener('change', loadBackupFile);
  }

  function setStatus(message, error = false) {
    const target = $('dataBackupStatus');
    if (target) target.innerHTML = error ? `<strong>Backup error:</strong> ${message}` : message;
  }

  function saveDataBackup() {
    const name = `irrigation-map-data-backup-${timestampSlug()}.json`;
    downloadJson(name, currentBackup());
    setStatus(`Saved full data backup: <strong>${name}</strong>`);
  }

  function saveDefinitionsJson() {
    downloadJson('definitions.json', currentDefinitions());
    setStatus('Saved repo-ready <strong>definitions.json</strong>. Copy it over <code>data/definitions.json</code>, then commit/push with git.');
  }

  function normalizeImportedState(data) {
    if (data?.state && typeof data.state === 'object') return data.state;
    if (data?.definitions && typeof data.definitions === 'object') {
      const existing = currentState();
      return {
        ...existing,
        zones: data.definitions.zones || [],
        drawnTrails: data.definitions.drawnTrails || data.definitions.trails || [],
        assets: data.definitions.assets || data.definitions.markers || []
      };
    }
    if (Array.isArray(data?.zones) || Array.isArray(data?.drawnTrails) || Array.isArray(data?.assets)) {
      const existing = currentState();
      return {
        ...existing,
        zones: data.zones || [],
        drawnTrails: data.drawnTrails || data.trails || [],
        assets: data.assets || data.markers || []
      };
    }
    throw new Error('File is not a recognized irrigation map backup or definitions file.');
  }

  async function loadBackupFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const imported = normalizeImportedState(data);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
      localStorage.setItem(FIELD_STORAGE_KEY, JSON.stringify(imported));
      setStatus(`Loaded <strong>${file.name}</strong>. Reloading Admin to apply imported data...`);
      setTimeout(() => location.reload(), 600);
    } catch (error) {
      setStatus(error.message || 'Import failed.', true);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installPanel);
  else installPanel();
})();
