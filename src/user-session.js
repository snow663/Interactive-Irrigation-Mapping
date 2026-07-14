const SESSION_KEY = 'interactive-irrigation-user';
const LOGIN_PAGE = 'login.html';

function slugName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'user';
}

function readUser() {
  try {
    const user = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return user?.id && user?.name ? user : null;
  } catch {
    return null;
  }
}

function writeUser(name) {
  const cleanName = String(name || '').trim();
  if (!cleanName) return null;
  const user = {
    id: slugName(cleanName),
    name: cleanName,
    loginAt: Date.now()
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
}

function clearUser() {
  localStorage.removeItem(SESSION_KEY);
}

function loginUrl() {
  const next = `${location.pathname.split('/').pop() || 'index.html'}${location.search || ''}${location.hash || ''}`;
  return `./${LOGIN_PAGE}?next=${encodeURIComponent(next)}`;
}

function isLoginPage() {
  return location.pathname.endsWith(`/${LOGIN_PAGE}`) || location.pathname.endsWith(LOGIN_PAGE);
}

function userKey(base) {
  const user = readUser();
  return user ? `${base}:${user.id}` : base;
}

function stampRecord(record = {}) {
  const user = readUser();
  return {
    ...record,
    userId: user?.id || '',
    userName: user?.name || ''
  };
}

function requireUser() {
  const user = readUser();
  if (!user && !isLoginPage()) location.replace(loginUrl());
  return user;
}

function setupLoginPage() {
  const form = document.getElementById('loginForm');
  const input = document.getElementById('usernameInput');
  const existing = readUser();
  if (input && existing) input.value = existing.name;
  if (!form || !input) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const user = writeUser(input.value);
    if (!user) return;
    const params = new URLSearchParams(location.search);
    const next = params.get('next') || 'ride-map.html';
    location.href = next;
  });
}

function installUserBadge(user) {
  if (!user || document.getElementById('userSessionBadge')) return;
  const badge = document.createElement('div');
  badge.id = 'userSessionBadge';
  badge.className = 'user-session-badge';
  badge.innerHTML = `
    <span>User: <strong>${escapeHtml(user.name)}</strong></span>
    <button id="logoutSessionBtn" type="button">Switch</button>
  `;
  const target = document.querySelector('.top-actions') || document.querySelector('.ride-menu-actions') || document.body;
  target.append(badge);
  document.getElementById('logoutSessionBtn')?.addEventListener('click', () => {
    clearUser();
    location.href = loginUrl();
  });
}

function installStyle() {
  if (document.getElementById('userSessionStyle')) return;
  const style = document.createElement('style');
  style.id = 'userSessionStyle';
  style.textContent = `
    .user-session-badge { display: inline-flex; align-items: center; gap: 8px; border: 1px solid rgba(148,163,184,.32); border-radius: 999px; padding: 5px 8px; background: rgba(15,23,42,.86); color: #e5e7eb; font-size: 12px; }
    .user-session-badge button { border: 1px solid rgba(148,163,184,.32); border-radius: 999px; background: rgba(30,41,59,.92); color: #e5e7eb; padding: 3px 7px; cursor: pointer; }
  `;
  document.head.append(style);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

window.IrrigationUser = {
  current: readUser,
  set: writeUser,
  clear: clearUser,
  require: requireUser,
  userKey,
  stampRecord
};

if (isLoginPage()) {
  document.addEventListener('DOMContentLoaded', setupLoginPage);
} else {
  const user = requireUser();
  document.addEventListener('DOMContentLoaded', () => {
    installStyle();
    installUserBadge(user);
  });
}
