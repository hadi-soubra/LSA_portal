// ── Auth guard ──────────────────────────────────────────────────────────────
const lsaToken = sessionStorage.getItem('lsa_token');
const userData = JSON.parse(sessionStorage.getItem('lsa_user') || 'null');
if (!lsaToken || !userData || userData.dashboard !== 'admin' || userData.level !== 'gc') {
  window.location.href = 'index.html';
}

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

// ── Role helpers ─────────────────────────────────────────────────────────────
const isGcHead        = userData && !userData.color && !userData.is_functional;
const isColoredGc     = userData && !!userData.color;
const isFunctionalGc  = userData && !userData.color && !!userData.is_functional;

let allEvents = [], allReports = [], allUsers = [];
let allDistrictsRef = [];

(async function init() {
  if (userData) {
    const initials = userData.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    document.getElementById('user-avatar').textContent = initials;
    document.getElementById('user-name').textContent = userData.name;
    const colorTag = userData.color ? ` · ${userData.color.charAt(0).toUpperCase() + userData.color.slice(1)}` : '';
    document.getElementById('user-role-label').textContent =
      (userData.role_title || 'General Commissioner') + colorTag;
  }

  // My GC nav section: visible for head/admin and colored; hidden for functional
  if (!isFunctionalGc) {
    document.getElementById('nav-mgmt-section').style.display = '';
    document.getElementById('nav-leaders').style.display = '';
    document.getElementById('nav-members').style.display = '';
  }

  const [stats, districts] = await Promise.all([
    api('GET', '/api/stats'),
    api('GET', '/api/districts'),
  ]);

  allDistrictsRef = districts || [];

  if (stats && stats.pending_requests > 0) {
    const n = stats.pending_requests;
    ['header-badge'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = n; el.style.display = ''; }
    });
  }

  await Promise.all([loadUsers(), loadEvents(), loadComms()]);
})();

// ── USERS ─────────────────────────────────────────────────────────────────────
async function loadUsers() {
  allUsers = await api('GET', '/api/users') || [];
  renderUsersTable(allUsers);
}

function renderUsersTable(users) {
  let display = users;
  if (usersTabFilter === 'leaders') display = users.filter(u => u.level !== 'member');
  else if (usersTabFilter === 'members') display = users.filter(u => u.level === 'member');
  const tbody = document.getElementById('users-tbody');
  if (!display.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted text-sm" style="padding:1rem;">No users in this category.</td></tr>';
    return;
  }
  tbody.innerHTML = display.map(u => `
    <tr style="${!u.editable ? 'opacity:0.8;' : ''}">
      <td class="td-name">${escHtml(u.name)}${!u.editable ? ' <span class="badge badge-neutral" style="font-size:0.7rem;">view only</span>' : ''}</td>
      <td><code>${escHtml(u.username)}</code></td>
      <td>${u.color ? `<span class="badge" style="background:${colorBg(u.color)};color:#333;">${u.color}</span>` : '<span class="text-muted">—</span>'}</td>
      <td style="font-size:0.82rem;">${u.role_title ? escHtml(u.role_title) : '—'}</td>
      <td style="font-size:0.82rem;">${u.district_name ? escHtml(u.district_name) : (u.group_code ? escHtml(u.group_code) : '—')}</td>
      <td>
        ${u.editable ? `
        <button class="btn btn-sm btn-secondary" onclick="openEditUserModal(${u.id})">✏️ Edit</button>
        ` : '<span class="text-muted text-sm">—</span>'}
      </td>
    </tr>`).join('');
}

function filterUsers() {
  const q = document.getElementById('user-search').value.toLowerCase();
  renderUsersTable(allUsers.filter(u =>
    u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)
  ));
}

function colorBg(c) {
  return { pink: '#FEE2E2', yellow: '#FEF3C7', green: '#D1FAE5', red: '#FEE2E2' }[c] || '#F3F4F6';
}

let editingUserId = null;

function openAddUserModal() {
  editingUserId = null;
  document.getElementById('user-modal-title').textContent = 'Add District Commissioner';
  document.getElementById('um-pw-label').textContent = 'Password *';
  document.getElementById('um-id').value = '';
  ['um-name','um-username','um-email','um-role-title','um-password'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('um-color').value = '';
  populateDistrictDropdown();
  document.getElementById('user-modal').classList.add('open');
}

function openEditUserModal(userId) {
  const u = allUsers.find(x => x.id === userId);
  if (!u) return;
  editingUserId = userId;
  document.getElementById('user-modal-title').textContent = 'Edit Commissioner';
  document.getElementById('um-pw-label').textContent = 'New Password (leave blank to keep current)';
  document.getElementById('um-id').value = userId;
  document.getElementById('um-name').value = u.name;
  document.getElementById('um-username').value = u.username;
  document.getElementById('um-email').value = u.email || '';
  document.getElementById('um-color').value = u.color || '';
  document.getElementById('um-role-title').value = u.role_title || '';
  document.getElementById('um-password').value = '';
  populateDistrictDropdown(u.district_id);
  document.getElementById('user-modal').classList.add('open');
}

function closeUserModal() {
  document.getElementById('user-modal').classList.remove('open');
}

function populateDistrictDropdown(selectedDistrict) {
  const dSel = document.getElementById('um-district');
  dSel.innerHTML = '<option value="">— Select district —</option>' +
    allDistrictsRef.map(d => `<option value="${d.id}" ${d.id === selectedDistrict ? 'selected' : ''}>${escHtml(d.name)}</option>`).join('');
}

async function saveUser() {
  const body = {
    name: document.getElementById('um-name').value.trim(),
    username: document.getElementById('um-username').value.trim(),
    email: document.getElementById('um-email').value.trim() || null,
    dashboard: 'admin',
    level: 'district',
    color: document.getElementById('um-color').value || null,
    role_title: document.getElementById('um-role-title').value.trim() || null,
    district_id: parseInt(document.getElementById('um-district').value) || null,
    password: document.getElementById('um-password').value || null,
  };

  if (!body.name || !body.username || (!editingUserId && !body.password)) {
    toast('Name, username and password are required.', 'danger');
    return;
  }

  let res;
  if (editingUserId) {
    res = await api('PUT', `/api/users/${editingUserId}`, body);
  } else {
    res = await api('POST', '/api/users', body);
  }

  if (res && res.id) {
    toast(editingUserId ? 'Commissioner updated.' : 'Commissioner created.', 'success');
    closeUserModal();
    allUsers = await api('GET', '/api/users') || [];
    renderUsersTable(allUsers);
  } else {
    toast(res?.error || 'Failed to save.', 'danger');
  }
}

function showConfirmModal(title, text, btnClass, btnLabel, callback) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body-text').textContent = text;
  const btn = document.getElementById('modal-confirm-btn');
  btn.className = `btn ${btnClass}`;
  btn.textContent = btnLabel;
  btn._callback = callback;
  document.getElementById('confirm-modal').classList.add('open');
}

function closeModal() {
  document.getElementById('confirm-modal').classList.remove('open');
}

async function modalConfirm() {
  const btn = document.getElementById('modal-confirm-btn');
  if (btn._callback) { await btn._callback(); btn._callback = null; }
  closeModal();
}

// ── EVENT REQUESTS ─────────────────────────────────────────────────────────────
async function loadEvents() {
  allEvents = await api('GET', '/api/events') || [];
}

const STATUS_BADGE = {
  pending: 'badge-warning',
  approved: 'badge-success',
  rejected: 'badge-danger',
};
const STATUS_BADGE_RPT = { pending: 'badge-warning', approved: 'badge-success', rejected: 'badge-danger' };

let pendingAction = null;

function promptAction(type, id) {
  pendingAction = { type, id };
  const titles = { approve: 'Approve Request', reject: 'Reject Request', approve_report: 'Approve Report', reject_report: 'Reject Report' };
  document.getElementById('action-modal-title').textContent = titles[type] || 'Confirm';
  document.getElementById('action-note').value = '';
  const btn = document.getElementById('action-confirm-btn');
  btn.className = `btn ${type === 'reject' || type === 'reject_report' ? 'btn-danger' : 'btn-primary'}`;
  btn.textContent = titles[type] || (type.charAt(0).toUpperCase() + type.slice(1));
  document.getElementById('action-modal').classList.add('open');
}

function closeActionModal() {
  document.getElementById('action-modal').classList.remove('open');
  pendingAction = null;
}

async function executeAction() {
  if (!pendingAction) return;
  const { type, id } = pendingAction;
  const note = document.getElementById('action-note').value.trim();
  closeActionModal();

  let res;
  if (type === 'approve') {
    res = await api('PUT', `/api/events/${id}/approve`, { note });
    if (res && !res.error) toast(res.status === 'approved' ? 'Request approved.' : 'Request forwarded to EC.', 'success');
  } else if (type === 'reject') {
    res = await api('PUT', `/api/events/${id}/reject`, { note });
    if (res && !res.error) toast('Request rejected.', 'success');
  } else if (type === 'approve_report') {
    res = await api('PUT', `/api/reports/${id}/approve`, { note });
    if (res && !res.error) toast(res.status === 'approved' ? 'Report approved.' : 'Report forwarded to EC.', 'success');
  } else if (type === 'reject_report') {
    res = await api('PUT', `/api/reports/${id}/reject`, { note });
    if (res && !res.error) toast('Report rejected.', 'danger');
  }

  if (res && res.error) { toast(res.error, 'danger'); return; }

  await loadComms();

  const stats = await api('GET', '/api/stats');
  if (stats) {
    const n = stats.pending_requests;
    ['header-badge'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = n; el.style.display = n > 0 ? '' : 'none'; }
    });
  }
}

// ── COMMUNICATIONS ──────────────────────────────────────────────────────────
let sentRequests = [], sentReports = [], inboxRequests = [], inboxReports = [];
let inboxReqHistory = [], inboxRptHistory = [];
let trackerReqFilter = 'all', trackerRptFilter = 'all';
let eligibleRequests = [];

async function loadComms() {
  const [evts, rpts, reqHist, rptHist, eligible] = await Promise.all([
    api('GET', '/api/events'),
    api('GET', '/api/reports'),
    api('GET', '/api/events/inbox-history'),
    api('GET', '/api/reports/inbox-history'),
    api('GET', '/api/reports/eligible-requests'),
  ]);
  const allEvts = evts || [];
  const allRpts = rpts || [];
  sentRequests     = allEvts.filter(e => e.submitted_by === userData.id);
  inboxRequests    = allEvts.filter(e => e.submitted_by !== userData.id && e.status === 'pending');
  sentReports      = allRpts.filter(r => r.submitted_by === userData.id);
  inboxReports     = allRpts.filter(r => r.submitted_by !== userData.id && r.status === 'pending');
  inboxReqHistory  = reqHist || [];
  inboxRptHistory  = rptHist || [];
  eligibleRequests = Array.isArray(eligible) ? eligible : [];

  const pending = inboxRequests.length;
  ['inbox-req-badge', 'header-badge'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = pending; el.style.display = pending > 0 ? '' : 'none'; }
  });

  populateReportRequestDropdown();
  renderSentRequests(); renderSentReports();
  renderInboxReqPending(); renderInboxReqHistory();
  renderInboxRptPending(); renderInboxRptHistory();
  renderTrackerRequests(); renderTrackerReports();
  renderHomePendingEvents(); renderHomePendingReports();
}

function populateReportRequestDropdown() {
  const sel   = document.getElementById('crpt-request');
  const noMsg = document.getElementById('crpt-no-requests');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select an approved activity —</option>' +
    eligibleRequests.map(r =>
      `<option value="${r.id}">${escHtml(r.title)}${r.start_date ? ' (' + r.start_date + ')' : ''}</option>`
    ).join('');
  if (noMsg) noMsg.style.display = eligibleRequests.length ? 'none' : '';
}

function renderSentRequests() {
  const el = document.getElementById('sent-requests-list');
  if (!sentRequests.length) { el.innerHTML = '<div class="card"><div class="card-body text-muted text-sm">No requests sent yet.</div></div>'; return; }
  el.innerHTML = sentRequests.map(e => `
    <div class="card" style="margin-bottom:0;">
      <div class="card-body" style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
        <div style="flex:1;min-width:0;">
          <div class="font-semibold" style="font-size:0.95rem;margin-bottom:0.25rem;">${escHtml(e.title)}</div>
          <div class="text-muted text-sm">${fmtDate(e.created_at)} · Needs: ${e.required_approval_level.toUpperCase()} · At: ${e.current_level}</div>
        </div>
        <span class="badge ${STATUS_BADGE[e.status] || 'badge-neutral'}" style="flex-shrink:0;text-transform:capitalize;">${e.status}</span>
      </div>
    </div>`).join('');
}

function renderSentReports() {
  const el = document.getElementById('sent-reports-list');
  if (!sentReports.length) { el.innerHTML = '<div class="card"><div class="card-body text-muted text-sm">No reports sent yet.</div></div>'; return; }
  el.innerHTML = sentReports.map(r => `
    <div class="card" style="margin-bottom:0;">
      <div class="card-body" style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
        <div style="flex:1;min-width:0;">
          <div class="font-semibold" style="font-size:0.95rem;margin-bottom:0.25rem;">${escHtml(r.title)}</div>
          <div class="text-muted text-sm">${fmtDate(r.created_at)}</div>
          <div class="text-sm" style="color:var(--text-secondary);margin-top:0.2rem;">${escHtml(r.body).slice(0,100)}${r.body.length > 100 ? '…' : ''}</div>
        </div>
        <span class="badge ${STATUS_BADGE_RPT[r.status] || 'badge-neutral'}" style="flex-shrink:0;text-transform:capitalize;">${r.status}</span>
      </div>
    </div>`).join('');
}

function renderInboxReqPending() {
  const el = document.getElementById('inbox-req-pending-list');
  const b  = document.getElementById('inbox-pending-badge');
  if (!inboxRequests.length) {
    el.innerHTML = '<div class="card"><div class="card-body text-muted text-sm">No pending requests.</div></div>';
    if (b) b.style.display = 'none'; return;
  }
  if (b) { b.textContent = inboxRequests.length; b.style.display = ''; }
  el.innerHTML = inboxRequests.map(e => `
    <div class="request-card" id="inbox-card-${e.id}">
      <div class="request-card-header">
        <div style="flex:1;min-width:0;">
          <h4>${escHtml(e.title)}</h4>
          <div class="meta">${escHtml(e.submitter_name || '—')}${e.submitter_district ? ' · ' + escHtml(e.submitter_district) : ''} · ${fmtDate(e.created_at)}</div>
        </div>
        <span class="badge badge-warning">Pending review</span>
      </div>
      ${e.description ? `<div class="text-sm" style="color:var(--text-secondary);">${escHtml(e.description)}</div>` : ''}
      <div class="text-sm" style="display:flex;gap:1.5rem;flex-wrap:wrap;">
        ${e.location ? `<span>📍 ${escHtml(e.location)}</span>` : ''}
        ${e.start_date ? `<span>📅 ${e.start_date}${e.end_date ? ' → ' + e.end_date : ''}</span>` : ''}
        ${e.participants ? `<span>👥 ${e.participants}</span>` : ''}
      </div>
      <div class="text-sm text-muted">Approval needed: <strong>${e.required_approval_level.toUpperCase()}</strong></div>
      ${e.notes ? `<div class="text-sm" style="color:var(--text-secondary);">Notes: ${escHtml(e.notes)}</div>` : ''}
      <div class="flex gap-2" style="margin-top:0.5rem;">
        <button class="btn btn-success btn-sm" onclick="promptAction('approve', ${e.id})">✅ ${e.current_level === e.required_approval_level ? 'Approve' : 'Approve & Forward to EC'}</button>
        <button class="btn btn-danger btn-sm" onclick="promptAction('reject', ${e.id})">❌ Reject</button>
      </div>
    </div>`).join('');
}

function renderInboxReqHistory() {
  populateDistrictFilter(inboxReqHistory, 'hist-req-district-filter');
  filterInboxReqHistory();
}

function filterInboxReqHistory() {
  const el = document.getElementById('inbox-req-history-list');
  const distVal = document.getElementById('hist-req-district-filter')?.value || '';
  let items = inboxReqHistory;
  if (distVal) items = items.filter(e => (e.submitter_district || '') === distVal);
  if (!items.length) { el.innerHTML = '<div class="card"><div class="card-body text-muted text-sm">No history.</div></div>'; return; }
  el.innerHTML = items.map(e => `
    <div class="card" style="margin-bottom:0;">
      <div class="card-body" style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
        <div style="flex:1;min-width:0;">
          <div class="font-semibold" style="font-size:0.95rem;margin-bottom:0.25rem;">${escHtml(e.title)}</div>
          <div class="text-muted text-sm">From: ${escHtml(e.submitter_name || '—')}${e.submitter_district ? ' · ' + escHtml(e.submitter_district) : ''}</div>
          <div class="text-muted text-sm">${fmtDate(e.updated_at || e.created_at)}</div>
        </div>
        <span class="badge ${STATUS_BADGE[e.status] || 'badge-neutral'}" style="flex-shrink:0;text-transform:capitalize;">${e.status}</span>
      </div>
    </div>`).join('');
}

function renderInboxRptPending() {
  const el = document.getElementById('inbox-rpt-pending-list');
  if (!inboxReports.length) { el.innerHTML = '<div class="card"><div class="card-body text-muted text-sm">No pending reports.</div></div>'; return; }
  el.innerHTML = inboxReports.map(r => `
    <div class="card" style="margin-bottom:0;">
      <div class="card-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:0.75rem;">
          <div>
            <div class="font-semibold">${escHtml(r.title)}</div>
            <div class="text-muted text-sm">From: ${escHtml(r.submitter_name || '—')}${r.submitter_district ? ' · ' + escHtml(r.submitter_district) : ''} · ${fmtDate(r.created_at)}</div>
          </div>
          <span class="badge ${STATUS_BADGE_RPT[r.status] || 'badge-neutral'}" style="text-transform:capitalize;">${r.status}</span>
        </div>
        <div style="background:var(--bg);padding:0.75rem;border-radius:6px;font-size:0.875rem;max-height:120px;overflow-y:auto;white-space:pre-wrap;">${escHtml(r.body)}</div>
        <div class="flex gap-2 mt-3">
          <button class="btn btn-success btn-sm" onclick="promptAction('approve_report', ${r.id})">✅ ${r.current_level === r.required_approval_level ? 'Approve' : 'Approve & Forward to EC'}</button>
          <button class="btn btn-danger btn-sm" onclick="promptAction('reject_report', ${r.id})">❌ Reject</button>
        </div>
      </div>
    </div>`).join('');
}

function renderInboxRptHistory() {
  populateDistrictFilter(inboxRptHistory, 'hist-rpt-district-filter');
  filterInboxRptHistory();
}

function filterInboxRptHistory() {
  const el = document.getElementById('inbox-rpt-history-list');
  const distVal = document.getElementById('hist-rpt-district-filter')?.value || '';
  let items = inboxRptHistory;
  if (distVal) items = items.filter(r => (r.submitter_district || '') === distVal);
  if (!items.length) { el.innerHTML = '<div class="card"><div class="card-body text-muted text-sm">No history.</div></div>'; return; }
  el.innerHTML = items.map(r => `
    <div class="card" style="margin-bottom:0;">
      <div class="card-body" style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
        <div style="flex:1;min-width:0;">
          <div class="font-semibold" style="font-size:0.95rem;margin-bottom:0.25rem;">${escHtml(r.title)}</div>
          <div class="text-muted text-sm">From: ${escHtml(r.submitter_name || '—')}${r.submitter_district ? ' · ' + escHtml(r.submitter_district) : ''}</div>
          <div class="text-muted text-sm">${fmtDate(r.updated_at || r.created_at)}</div>
        </div>
        <span class="badge ${STATUS_BADGE_RPT[r.status] || 'badge-neutral'}" style="flex-shrink:0;text-transform:capitalize;">${r.status}</span>
      </div>
    </div>`).join('');
}

function renderTrackerRequests() {
  const el = document.getElementById('tracker-requests-list');
  const items = trackerReqFilter === 'all' ? sentRequests : sentRequests.filter(e => e.status === trackerReqFilter);
  if (!items.length) { el.innerHTML = '<div class="card"><div class="card-body text-muted text-sm">No requests found.</div></div>'; return; }
  el.innerHTML = items.map(e => `
    <div class="card" style="margin-bottom:0;">
      <div class="card-body" style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
        <div style="flex:1;min-width:0;">
          <div class="font-semibold" style="font-size:0.95rem;margin-bottom:0.25rem;">${escHtml(e.title)}</div>
          <div class="text-muted text-sm">${fmtDate(e.created_at)} · Needs: ${e.required_approval_level.toUpperCase()} · At: ${e.current_level}</div>
        </div>
        <span class="badge ${STATUS_BADGE[e.status] || 'badge-neutral'}" style="flex-shrink:0;text-transform:capitalize;">${e.status}</span>
      </div>
    </div>`).join('');
}

function renderTrackerReports() {
  const el = document.getElementById('tracker-reports-list');
  const items = trackerRptFilter === 'all' ? sentReports : sentReports.filter(r => r.status === trackerRptFilter);
  if (!items.length) { el.innerHTML = '<div class="card"><div class="card-body text-muted text-sm">No reports found.</div></div>'; return; }
  el.innerHTML = items.map(r => `
    <div class="card" style="margin-bottom:0;">
      <div class="card-body" style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
        <div style="flex:1;min-width:0;">
          <div class="font-semibold" style="font-size:0.95rem;margin-bottom:0.25rem;">${escHtml(r.title)}</div>
          <div class="text-muted text-sm">${fmtDate(r.created_at)}</div>
        </div>
        <span class="badge ${STATUS_BADGE_RPT[r.status] || 'badge-neutral'}" style="flex-shrink:0;text-transform:capitalize;">${r.status}</span>
      </div>
    </div>`).join('');
}

function setTrackerFilter(type, filter, btn) {
  if (type === 'requests') { trackerReqFilter = filter; renderTrackerRequests(); }
  else { trackerRptFilter = filter; renderTrackerReports(); }
  btn.closest('div').querySelectorAll('button').forEach(b => b.className = 'btn btn-sm btn-secondary');
  btn.className = 'btn btn-sm btn-primary';
}

function populateDistrictFilter(items, filterId) {
  const el = document.getElementById(filterId);
  if (!el) return;
  const dists = [...new Set(items.map(i => i.submitter_district).filter(Boolean))];
  el.innerHTML = '<option value="">All Districts</option>' + dists.map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('');
}

async function submitCommsRequest() {
  const title = document.getElementById('cr-title').value.trim();
  const location = document.getElementById('cr-location').value.trim();
  const start_date = document.getElementById('cr-date').value;
  const alertEl = document.getElementById('cr-alert');

  if (!title || !location || !start_date) {
    alertEl.innerHTML = '<div class="alert alert-danger"><span class="alert-icon">❌</span> Title, location and start date are required.</div>';
    return;
  }

  const res = await api('POST', '/api/events', {
    title,
    description: document.getElementById('cr-desc').value.trim() || null,
    location,
    start_date,
    end_date: document.getElementById('cr-date-end').value || null,
    participants: parseInt(document.getElementById('cr-participants').value) || null,
    notes: document.getElementById('cr-notes').value.trim() || null,
    required_approval_level: document.getElementById('cr-approval-level').value,
  });

  if (res && res.id) {
    alertEl.innerHTML = '<div class="alert alert-success"><span class="alert-icon">✅</span> Event request submitted to EC.</div>';
    clearCommsRequestForm();
    await loadComms();
  } else {
    alertEl.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">❌</span> ${res?.error || 'Error submitting.'}</div>`;
  }
  setTimeout(() => alertEl.innerHTML = '', 4000);
}

function clearCommsRequestForm() {
  ['cr-title','cr-desc','cr-date','cr-date-end','cr-location','cr-participants','cr-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('cr-approval-level').value = 'ec';
}

async function submitCommsReport() {
  const title   = document.getElementById('crpt-title').value.trim();
  const body    = document.getElementById('crpt-body').value.trim();
  const reqId   = parseInt(document.getElementById('crpt-request').value) || null;
  const level   = document.getElementById('crpt-approval-level').value;
  const alertEl = document.getElementById('crpt-alert');

  if (!title || !body) {
    alertEl.innerHTML = '<div class="alert alert-danger"><span class="alert-icon">❌</span> Title and body are required.</div>';
    return;
  }

  const res = await api('POST', '/api/reports', {
    title, body,
    request_id: reqId,
    required_approval_level: level,
  });
  if (res && res.id) {
    alertEl.innerHTML = '<div class="alert alert-success"><span class="alert-icon">✅</span> Report submitted to EC.</div>';
    clearCommsReportForm();
    await loadComms();
  } else {
    alertEl.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">❌</span> ${res?.error || 'Error submitting.'}</div>`;
  }
  setTimeout(() => alertEl.innerHTML = '', 4000);
}

function clearCommsReportForm() {
  document.getElementById('crpt-title').value = '';
  document.getElementById('crpt-body').value = '';
  document.getElementById('crpt-request').value = '';
  document.getElementById('crpt-approval-level').value = 'ec';
}

const SECTION_TITLES = {
  home:               ['Dashboard',          'GC overview'],
  users:              ['My Group',           'Manage your group'],
  'send-request':     ['Send Request',       'Submit an event request'],
  'send-report':      ['Send Report',        'Submit a report'],
  'inbox-requests':   ['Received Requests',  'Review event requests from district commissioners'],
  'inbox-reports':    ['Received Reports',   'Review and forward reports from districts'],
  'tracker-requests': ['Request Tracker',    'Track your submitted requests'],
  'tracker-reports':  ['Report Tracker',     'Track your submitted reports'],
};

let usersTabFilter = 'leaders';

function showUsersTab(tab, btn) {
  usersTabFilter = tab;
  showSection('users', btn);
  const titles = {
    leaders: ['Leaders', 'Manage leaders in your scope'],
    members: ['Members', 'View members in your scope'],
  };
  const t = titles[tab] || ['My Group', ''];
  document.getElementById('section-title').textContent = t[0];
  document.getElementById('section-subtitle').textContent = t[1];
  renderUsersTable(allUsers);
}

function showSection(id, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item, .nav-sub-item').forEach(n => n.classList.remove('active'));
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
  const targetPane = document.getElementById(paneId);
  targetPane.parentElement.querySelectorAll(':scope > .tab-pane').forEach(p => p.classList.remove('active'));
  targetPane.classList.add('active');
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
  return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}
