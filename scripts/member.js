// ── Auth guard ──────────────────────────────────────────────────────────────
const lsaToken = sessionStorage.getItem('lsa_token');
const userData = JSON.parse(sessionStorage.getItem('lsa_user') || 'null');
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

// ── Page init ────────────────────────────────────────────────────────────────
(async function init() {
  // Set user info from session
  if (userData) {
    const initials = userData.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    document.getElementById('user-avatar').textContent = initials;
    document.getElementById('user-name').textContent = userData.name;
    document.getElementById('section-subtitle').textContent = `Welcome back, ${userData.name.split(' ')[0]}!`;
    // Profile section
    document.getElementById('profile-avatar-big').textContent = initials;
    document.getElementById('profile-name-display').textContent = userData.name;
    const colorLabel = userData.color ? ` · ${userData.color.charAt(0).toUpperCase() + userData.color.slice(1)} Branch` : '';
    document.getElementById('profile-meta-display').textContent =
      `Member${userData.group_code ? ' · ' + userData.group_code : ''}${colorLabel}`;
    document.getElementById('p-name').value = userData.name;
    document.getElementById('p-email').value = userData.email || '';
    document.getElementById('p-branch').value = userData.color
      ? userData.color.charAt(0).toUpperCase() + userData.color.slice(1) + ' Branch' : '—';
    document.getElementById('p-group').value =
      (userData.group_name || '') + (userData.group_code ? ` (${userData.group_code})` : '') +
      (userData.district_name ? ' — ' + userData.district_name : '');
  }

})();

// ── Profile save ──────────────────────────────────────────────────────────────
async function saveProfile() {
  const el = document.getElementById('profile-alert');
  const body = {
    name: document.getElementById('p-name').value.trim(),
    email: document.getElementById('p-email').value.trim(),
  };
  const updated = await api('PUT', '/api/profile', body);
  if (updated && !updated.error) {
    sessionStorage.setItem('lsa_user', JSON.stringify({ ...userData, ...updated }));
    el.innerHTML = '<div class="alert alert-success"><span class="alert-icon">✅</span> Profile updated.</div>';
    document.getElementById('user-name').textContent = updated.name;
    document.getElementById('profile-name-display').textContent = updated.name;
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

// ── Utilities ─────────────────────────────────────────────────────────────────
const SECTION_TITLES = {
  home:         ['Dashboard',                `Welcome back, ${userData?.name?.split(' ')[0] || 'Scout'}!`],
  profile:      ['My Profile',              'View and update your information'],
  partnerships: ['Partnerships & Rewards',  'Exclusive member benefits'],
};

function showSection(id, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('sec-' + id).classList.add('active');
  if (btn) btn.classList.add('active');
  const t = SECTION_TITLES[id] || [id, ''];
  document.getElementById('section-title').textContent = t[0];
  document.getElementById('section-subtitle').textContent = t[1];
  document.getElementById('sidebar').classList.remove('open');
}

function switchTab(btn, paneId) {
  const bar = btn.closest('.tab-bar');
  bar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const section = btn.closest('.section');
  section.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById(paneId).classList.add('active');
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

function logout() {
  sessionStorage.removeItem('lsa_token');
  sessionStorage.removeItem('lsa_user');
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
