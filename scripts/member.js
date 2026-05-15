// ── Auth guard ──────────────────────────────────────────────────────────────
const lsaToken = sessionStorage.getItem('lsa_token');
const userData = JSON.parse(sessionStorage.getItem('lsa_user') || 'null');
const personData = JSON.parse(sessionStorage.getItem('lsa_person') || 'null');
if (!lsaToken || !userData || userData.dashboard !== 'member') {
  window.location.href = 'index.html';
}

// ── API helper ──────────────────────────────────────────────────────────────
function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${lsaToken}` };
}
async function api(method, path, body) {
  const opts = { method, headers: authHeaders() };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  if (r.status === 401) { logout(); return null; }
  return r.json();
}

let _contentCache = null;

// ── Page init ────────────────────────────────────────────────────────────────
(async function init() {
  const displayName = personData?.name || userData?.name || '';
  const displayEmail = personData?.email || '';
  if (displayName) {
    const initials = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    document.getElementById('user-avatar').textContent = initials;
    document.getElementById('user-name').textContent = displayName;
    document.getElementById('section-subtitle').textContent = `Welcome back, ${displayName.split(' ')[0]}!`;
    // Profile section
    document.getElementById('profile-avatar-big').textContent = initials;
    document.getElementById('profile-name-display').textContent = displayName;
    const colorLabel = userData?.color ? ` · ${userData.color.charAt(0).toUpperCase() + userData.color.slice(1)} Branch` : '';
    document.getElementById('profile-meta-display').textContent =
      `Member${userData?.group_code ? ' · ' + userData.group_code : ''}${colorLabel}`;
    document.getElementById('p-name').value = displayName;
    document.getElementById('p-email').value = displayEmail;
    document.getElementById('p-branch').value = userData?.color
      ? userData.color.charAt(0).toUpperCase() + userData.color.slice(1) + ' Branch' : '—';
    document.getElementById('p-group').value =
      (userData?.group_name || '') + (userData?.group_code ? ` (${userData.group_code})` : '') +
      (userData?.district_name ? ' — ' + userData.district_name : '');
  }

  await renderMemberHome();
})();

// ── Member Home Dashboard ──────────────────────────────────────────────────────
const CONTENT_TYPE_LABEL = {
  notification: 'Info', resource: 'Info',
  training: 'Education', activity: 'Promotion',
};

async function renderMemberHome() {
  const displayName = personData?.name || userData?.name || '';

  document.getElementById('home-greeting').textContent = `Welcome back, ${displayName}!`;
  const colorSuffix = userData?.color
    ? ' · ' + userData.color.charAt(0).toUpperCase() + userData.color.slice(1) + ' Branch'
    : '';
  document.getElementById('home-role-line').textContent =
    'Member' + colorSuffix + (userData?.group_name ? ' · ' + userData.group_name : '');

  const summaryEl = document.getElementById('home-group-summary');
  if (summaryEl) {
    const colorPart = userData?.color
      ? `<strong>${userData.color.charAt(0).toUpperCase() + userData.color.slice(1)} Branch</strong> member`
      : 'member';
    const groupPart = userData?.group_name ? ` of <strong>${escHtml(userData.group_name)}</strong>` : '';
    const districtPart = userData?.district_name ? `, ${escHtml(userData.district_name)}` : '';
    summaryEl.innerHTML = `You are a ${colorPart}${groupPart}${districtPart}.`;
    summaryEl.style.display = '';
  }

  document.getElementById('home-quick-nav-body').innerHTML = `
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
      <button class="btn btn-secondary" onclick="showSection('profile', null)">👤 My Profile</button>
      <button class="btn btn-secondary" onclick="showSection('partnerships', null)">🎖️ Partnerships & Rewards</button>
      <button class="btn btn-secondary" onclick="showSection('content-info', null)">📋 Info</button>
      <button class="btn btn-secondary" onclick="showSection('content-education', null)">📚 Education</button>
      <button class="btn btn-secondary" onclick="showSection('content-promotion', null)">📣 Promotion</button>
    </div>
  `;

  const contentEl = document.getElementById('home-recent-content-body');
  const content = await _fetchContent();
  const recent = content.slice(0, 5);
  if (!recent.length) {
    contentEl.innerHTML = '<p class="text-muted text-sm">No content received yet.</p>';
    return;
  }
  contentEl.innerHTML =
    recent.map(c => `
      <div style="padding:0.5rem 0;border-bottom:1px solid var(--border);">
        <div class="font-semibold text-sm">${escHtml(c.title)}</div>
        <div class="text-muted text-sm" style="margin-top:0.2rem;">
          ${CONTENT_TYPE_LABEL[c.type] || c.type} · ${fmtDate(c.created_at)} · From ${escHtml(c.sender_name || '—')}
        </div>
      </div>`).join('') +
    `<div style="margin-top:0.75rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
      <button class="btn btn-sm btn-secondary" onclick="showSection('content-info', null)">View Info</button>
      <button class="btn btn-sm btn-secondary" onclick="showSection('content-education', null)">View Education</button>
      <button class="btn btn-sm btn-secondary" onclick="showSection('content-promotion', null)">View Promotion</button>
    </div>`;
}

// ── Profile save ──────────────────────────────────────────────────────────────
async function saveProfile() {
  const el = document.getElementById('profile-alert');
  const body = {
    name: document.getElementById('p-name').value.trim(),
    email: document.getElementById('p-email').value.trim(),
  };
  const updated = await api('PUT', '/api/profile', body);
  if (updated && !updated.error) {
    const updatedPerson = updated.person || updated;
    sessionStorage.setItem('lsa_person', JSON.stringify({ ...(personData || {}), ...updatedPerson }));
    el.innerHTML = '<div class="alert alert-success"><span class="alert-icon">✅</span> Profile updated.</div>';
    document.getElementById('user-name').textContent = updatedPerson.name;
    document.getElementById('profile-name-display').textContent = updatedPerson.name;
  } else {
    el.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">❌</span> ${updated?.error || 'Error saving profile.'}</div>`;
  }
  setTimeout(() => el.innerHTML = '', 3000);
}

async function changePassword() {
  const cur = document.getElementById('pw-current').value;
  const nw = document.getElementById('pw-new').value;
  const cf = document.getElementById('pw-confirm').value;
  if (!cur || !nw) return toast('Please fill in current and new password.', 'warning');
  if (nw !== cf) return toast('New passwords do not match.', 'danger');
  const res = await api('PUT', '/api/profile', { current_password: cur, new_password: nw });
  if (res && !res.error) {
    toast('Password updated successfully.', 'success');
    document.getElementById('pw-current').value = '';
    document.getElementById('pw-new').value = '';
    document.getElementById('pw-confirm').value = '';
  } else {
    toast(res?.error || 'Failed to update password.', 'danger');
  }
}

// ── Content ───────────────────────────────────────────────────────────────────
async function _fetchContent() {
  if (_contentCache) return _contentCache;
  _contentCache = await api('GET', '/api/member/content') || [];
  return _contentCache;
}

const CONTENT_TYPE_MAP = {
  'content-info':      ['notification', 'resource'],
  'content-education': ['training'],
  'content-promotion': ['activity'],
};

async function renderContentSection(key) {
  const el = document.getElementById('sec-' + key);
  el.innerHTML = '<div class="text-muted text-sm" style="padding:1rem;">Loading…</div>';
  const all   = await _fetchContent();
  const types = CONTENT_TYPE_MAP[key];
  const items = all.filter(c => types.includes(c.content_type));
  if (!items.length) {
    el.innerHTML = '<div class="text-muted text-sm" style="padding:1rem;">No content available yet.</div>';
    return;
  }
  el.innerHTML = items.map(c => `
    <div class="card" style="margin-bottom:1rem;">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
        <span class="card-title">${escHtml(c.title)}</span>
        <span class="text-muted text-sm">${fmtDate(c.created_at)}</span>
      </div>
      <div class="card-body">
        ${c.body ? `<p style="margin-bottom:0.75rem;white-space:pre-wrap;">${escHtml(c.body)}</p>` : ''}
        <div class="text-muted text-sm">From: ${escHtml(c.sender_name || '—')}</div>
      </div>
    </div>`).join('');
}

// ── Utilities ─────────────────────────────────────────────────────────────────
const SECTION_TITLES = {
  home:         ['Dashboard',                `Welcome back, ${personData?.name?.split(' ')[0] || userData?.name?.split(' ')[0] || 'Scout'}!`],
  profile:      ['My Profile',              'View and update your information'],
  partnerships: ['Partnerships & Rewards',  'Exclusive member benefits'],
  'content-info':      ['Content', 'Info'],
  'content-education': ['Content', 'Education'],
  'content-promotion': ['Content', 'Promotion'],
};

function showSection(id, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item, .nav-sub-item').forEach(n => n.classList.remove('active'));
  document.getElementById('sec-' + id).classList.add('active');
  if (btn) btn.classList.add('active');
  const t = SECTION_TITLES[id] || [id, ''];
  document.getElementById('section-title').textContent = t[0];
  document.getElementById('section-subtitle').textContent = t[1];
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');
  if (CONTENT_TYPE_MAP[id]) renderContentSection(id);
}

function switchTab(btn, paneId) {
  const bar = btn.closest('.tab-bar');
  bar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const section = btn.closest('.section');
  section.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById(paneId).classList.add('active');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-backdrop').classList.toggle('open');
}
function toggleChatbot() {
  const panel = document.getElementById('chat-panel');
  const main  = document.querySelector('.main');
  const isOpen = panel.classList.toggle('open');
  const isLandscape = window.innerWidth > window.innerHeight;
  main.classList.toggle('chat-open', isOpen && isLandscape);
  document.getElementById('chat-backdrop').classList.toggle('open', isOpen);
  document.querySelector('.app').classList.toggle('chat-active', isOpen);
}

let _lastLandscape = window.innerWidth > window.innerHeight;
window.addEventListener('resize', () => {
  const isLandscape = window.innerWidth > window.innerHeight;
  if (isLandscape === _lastLandscape) return;
  _lastLandscape = isLandscape;
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');
  document.getElementById('chat-panel').classList.remove('open');
  document.getElementById('chat-backdrop').classList.remove('open');
  document.querySelector('.main').classList.remove('chat-open');
  document.querySelector('.app').classList.remove('chat-active');
});

function logout() {
  sessionStorage.removeItem('lsa_token');
  sessionStorage.removeItem('lsa_user');
  sessionStorage.removeItem('lsa_person');
  window.location.href = 'index.html';
}

function toast(msg, type = 'success') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success: '✅', danger: '❌', warning: '⚠️' };
  t.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}
