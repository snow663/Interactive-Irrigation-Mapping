(() => {
  const FIELD_STORAGE_KEY = 'interactive-irrigation-map-v7';
  const CANDIDATE_KEYS = [
    'interactive-irrigation-map-v8',
    'interactive-irrigation-map-v7',
    'interactive-irrigation-map-v6',
    'interactive-irrigation-map-v5',
    'interactive-irrigation-map-v4',
    'interactive-irrigation-map-v3',
    'interactive-irrigation-map-v2',
    'interactive-irrigation-map-v1'
  ];

  function safeParse(value, fallback) {
    try { return JSON.parse(value) || fallback; } catch { return fallback; }
  }

  function loadExistingState() {
    for (const key of CANDIDATE_KEYS) {
      const value = safeParse(localStorage.getItem(key), null);
      if (value) return value;
    }
    return {};
  }

  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `./data/definitions.json?ts=${Date.now()}`, false);
    xhr.send(null);
    if (xhr.status < 200 || xhr.status >= 300) return;

    const definitions = safeParse(xhr.responseText, null);
    if (!definitions) return;

    const state = loadExistingState();
    state.zones = definitions.zones || state.zones || [];
    state.drawnTrails = definitions.drawnTrails || definitions.trails || state.drawnTrails || [];
    state.assets = definitions.assets || definitions.markers || state.assets || [];

    localStorage.setItem(FIELD_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Offline or blocked. Field app will use the last local cached copy.
  }
})();
