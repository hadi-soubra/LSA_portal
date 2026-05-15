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

// ── Home dashboard constants ──────────────────────────────────────────────────
const _UNIT_COLORS = { pink: '#EC4899', yellow: '#EAB308', green: '#059669', red: '#DC2626' };
const _UNIT_BG     = { pink: '#FDF2F8', yellow: '#FEFCE8', green: '#F0FDF4', red: '#FEF2F2' };
const MEMBER_ACCENT    = userData?.color ? _UNIT_COLORS[userData.color] : '#059669';
const MEMBER_ACCENT_BG = userData?.color ? _UNIT_BG[userData.color]     : '#F0FDF4';

const CONTENT_TYPE_LABELS = {
  notification: 'Info',
  resource:     'Info',
  training:     'Education',
  activity:     'Promotion',
};

let _contentCache = null;

// ── Page init ────────────────────────────────────────────────────────────────
(async function init() {
  const displayName  = personData?.name || userData?.name || '';
  const displayEmail = personData?.email || '';
  if (displayName) {
    const initials = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    document.getElementById('user-avatar').textContent = initials;
    document.getElementById('user-name').textContent = displayName;
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

  await renderHome();
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

// ── Home dashboard ────────────────────────────────────────────────────────────
async function renderHome() {
  const displayName = personData?.name || userData?.name || 'Scout';
  const firstName   = displayName.split(' ')[0];
  const colorLabel  = userData?.color
    ? userData.color.charAt(0).toUpperCase() + userData.color.slice(1) + ' Branch'
    : null;
  const groupLabel  = userData?.group_name
    ? userData.group_name + (userData?.group_code ? ` (${userData.group_code})` : '')
    : null;
  const districtLabel = userData?.district_name || null;

  // Welcome banner
  document.getElementById('home-welcome').innerHTML = `
    <div class="card" style="border-left:4px solid ${MEMBER_ACCENT};background:${MEMBER_ACCENT_BG};margin-bottom:1rem;">
      <div class="card-body" style="padding:1.25rem 1.5rem;">
        <div style="font-size:1.1rem;font-weight:600;margin-bottom:0.25rem;">
          Welcome back, ${escHtml(firstName)}!
        </div>
        <div class="text-muted text-sm">
          ${[colorLabel, groupLabel, districtLabel].filter(Boolean).map(escHtml).join(' · ')}
        </div>
      </div>
    </div>`;

  // Quick actions
  const actions = [
    { label: 'My Profile',    onclick: `showSection('profile')` },
    { label: 'Info',          onclick: `showSection('content-info')` },
    { label: 'Education',     onclick: `showSection('content-education')` },
    { label: 'Promotion',     onclick: `showSection('content-promotion')` },
    { label: 'Partnerships',  onclick: `showSection('partnerships')` },
  ];
  document.getElementById('home-quick-actions').innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:0.75rem;margin-bottom:1rem;">
      ${actions.map(a => `<button class="btn" onclick="${a.onclick}">${escHtml(a.label)}</button>`).join('')}
    </div>`;

  // Fetch content then render calendar + recent list
  document.getElementById('home-recent-content').innerHTML =
    '<div class="text-muted text-sm" style="padding:0.5rem 0;">Loading…</div>';
  const all = await _fetchContent();
  const recent = [...all].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
  const eventDates = all.map(c => c.event_date).filter(Boolean);

  // Mini calendar
  document.getElementById('home-cal-row').innerHTML = `
    <div class="card" style="margin-bottom:1rem;">
      <div class="card-body" id="home-cal-container"></div>
    </div>`;
  _renderMiniCal(document.getElementById('home-cal-container'), eventDates);

  // Recent content
  const rcEl = document.getElementById('home-recent-content');
  if (!recent.length) {
    rcEl.innerHTML = `
      <div class="card">
        <div class="card-header"><span class="card-title">Recent Content</span></div>
        <div class="card-body text-muted text-sm">No content received yet.</div>
      </div>`;
    return;
  }
  rcEl.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Recent Content</span></div>
      <div class="card-body" style="padding:0;">
        ${recent.map((c, i) => {
          const typeLabel = CONTENT_TYPE_LABELS[c.content_type] || c.content_type;
          return `
          <div onclick="showSection('content-${typeLabel.toLowerCase()}')"
               style="display:flex;align-items:flex-start;gap:0.75rem;padding:0.75rem 1rem;cursor:pointer;${i < recent.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}"
               onmouseover="this.style.background='var(--surface-alt)'" onmouseout="this.style.background=''">
            <span class="badge badge-neutral" style="margin-top:0.1rem;white-space:nowrap;">${escHtml(typeLabel)}</span>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(c.title)}</div>
              <div class="text-muted text-sm">
                ${escHtml(c.sender_name || '—')} · ${fmtDate(c.created_at)}
                ${c.event_date ? `<span style="margin-left:0.5rem;color:${MEMBER_ACCENT};font-weight:600;">📅 ${fmtDate(c.event_date)}</span>` : ''}
              </div>
            </div>
            <span class="text-muted">›</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function _renderMiniCal(el, markedDates) {
  if (!el) return;
  const now          = new Date();
  const year         = now.getFullYear();
  const month        = now.getMonth();
  const firstDay     = new Date(year, month, 1).getDay();
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const monthName    = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const marked       = new Set(markedDates.map(d => String(d).slice(0, 10)));
  const today        = now.toISOString().slice(0, 10);

  let cells = ['Su','Mo','Tu','We','Th','Fr','Sa']
    .map(d => `<div style="font-size:0.7rem;font-weight:600;color:var(--text-muted);text-align:center;">${d}</div>`)
    .join('');
  for (let i = 0; i < firstDay; i++) cells += '<div></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    let style = 'font-size:0.8rem;text-align:center;padding:0.15rem;border-radius:50%;';
    if (iso === today)        style += `background:${MEMBER_ACCENT};color:#fff;font-weight:700;`;
    else if (marked.has(iso)) style += `background:${MEMBER_ACCENT_BG};color:${MEMBER_ACCENT};font-weight:600;`;
    cells += `<div style="${style}">${d}</div>`;
  }

  el.innerHTML = `
    <div style="font-size:0.8rem;font-weight:600;margin-bottom:0.5rem;color:var(--text-muted);">${monthName}</div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">${cells}</div>`;
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
