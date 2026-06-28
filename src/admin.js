const STORAGE_KEY = 'interactive-irrigation-map-v6';
const LEGACY_KEYS = ['interactive-irrigation-map-v5', 'interactive-irrigation-map-v4', 'interactive-irrigation-map-v3', 'interactive-irrigation-map-v2', 'interactive-irrigation-map-v1'];
const MAX_RECENT_SAVES = 10;

const $ = (id) => document.getElementById(id);
const listEl = $('recentAdminList');
const statusEl = $('adminStatus');
const clearBtn = $('clearRecentBtn');
const reloadBtn = $('reloadAdminBtn');

function safeParse(json, fallback) {
  try { return JSON.parse(json) ?? fallback; } catch { return fallback; }
}

function loadState() {
  let key = STORAGE_KEY;
  let state = safeParse(localStorage.getItem(STORAGE_KEY), null);
  for (const legacyKey of LEGACY_KEYS) {
    if (state) break;
    const legacy = safeParse(localStorage.getItem(legacyKey), null);
    if (legacy) { state = legacy; key = legacyKey; }
  }
  state ||= {};
  state.recentSaves = normalizeRecentSaves(state.recentSaves || []);
  return { key, state };
}

function saveState(state) {
  state.recentSaves = normalizeRecentSaves(state.recentSaves || []);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeRecentSaves(items) {
  return items
    .map((item, index) => ({
      id: item.id || `recent-${Date.now()}-${index}`,
      timestamp: Number.isFinite(item.timestamp) ? item.timestamp : Date.now(),
      type: String(item.type || 'Saved'),
      zoneId: String(item.zoneId || ''),
      title: String(item.title || 'Saved record'),
      details: String(item.details || '')
    }))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_RECENT_SAVES);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function render() {
  const { key, state } = loadState();
  statusEl.innerHTML = `Storage key: <strong>${escapeHtml(key)}</strong><br>${state.recentSaves.length} recent record${state.recentSaves.length === 1 ? '' : 's'} found.`;
  listEl.innerHTML = '';

  if (!state.recentSaves.length) {
    listEl.innerHTML = '<p class="empty-recent">No recent saved records on this device.</p>';
    return;
  }

  state.recentSaves.forEach((item, index) => {
    const row = document.createElement('article');
    row.className = 'admin-row';
    row.innerHTML = `
      <div class="admin-row-head">
        <strong>${index + 1}. ${escapeHtml(item.type)} — ${escapeHtml(item.title)}</strong>
        <span>${new Date(item.timestamp).toLocaleString()}</span>
      </div>
      <label>Type<input data-field="type" data-index="${index}" value="${escapeHtml(item.type)}" /></label>
      <label>Title<input data-field="title" data-index="${index}" value="${escapeHtml(item.title)}" /></label>
      <label>Zone<input data-field="zoneId" data-index="${index}" value="${escapeHtml(item.zoneId)}" /></label>
      <label>Details<textarea data-field="details" data-index="${index}">${escapeHtml(item.details)}</textarea></label>
      <div class="controls">
        <button data-action="save" data-index="${index}" class="primary">Save Edit</button>
        <button data-action="delete" data-index="${index}" class="danger">Delete Entry</button>
      </div>
    `;
    listEl.append(row);
  });
}

function updateEntry(index) {
  const { state } = loadState();
  const item = state.recentSaves[index];
  if (!item) return;
  for (const field of ['type', 'title', 'zoneId', 'details']) {
    const input = document.querySelector(`[data-field="${field}"][data-index="${index}"]`);
    if (input) item[field] = input.value;
  }
  saveState(state);
  render();
}

function deleteEntry(index) {
  const { state } = loadState();
  if (!state.recentSaves[index]) return;
  if (!window.confirm('Delete this Last 10 saved entry? Map trails/assets/logs are not deleted.')) return;
  state.recentSaves.splice(index, 1);
  saveState(state);
  render();
}

listEl.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const index = Number(button.dataset.index);
  if (button.dataset.action === 'save') updateEntry(index);
  if (button.dataset.action === 'delete') deleteEntry(index);
});

clearBtn.addEventListener('click', () => {
  if (!window.confirm('Clear the entire Last 10 saved list? Map trails/assets/logs are not deleted.')) return;
  const { state } = loadState();
  state.recentSaves = [];
  saveState(state);
  render();
});

reloadBtn.addEventListener('click', render);
render();
