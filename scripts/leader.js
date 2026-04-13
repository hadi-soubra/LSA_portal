// ── Auth guard ──────────────────────────────────────────────────────────────
const lsaToken = sessionStorage.getItem('lsa_token');
const userData = JSON.parse(sessionStorage.getItem('lsa_user') || 'null');
if (!lsaToken || !userData || userData.dashboard !== 'leader') {
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
const isGroupLeader      = userData && (userData.level === 'group' || userData.level === 'group_admin');
const isColoredGroupLeader = isGroupLeader && !!userData.color;
const isGroupHeadOrAdmin   = isGroupLeader && !userData.color;  // group head or group admin
const isNoColorGroupLeader = isGroupHeadOrAdmin;                 // alias kept for comms logic

(async function init() {
  if (userData) {
    const initials = userData.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    document.getElementById('user-avatar').textContent = initials;
    document.getElementById('user-name').textContent = userData.name;
    const colorTag = userData.color ? ` · ${userData.color.charAt(0).toUpperCase() + userData.color.slice(1)}` : '';
    document.getElementById('user-role-label').textContent =
      (userData.role_title || 'Leader') + colorTag;
  }

  // Show My Group nav section for all group-level leaders
  if (isGroupLeader) {
    document.getElementById('nav-group-section').style.display = '';
    document.getElementById('nav-members').style.display = '';
    // Leaders tab only for group head/admin (not colored leaders)
    if (isGroupHeadOrAdmin) {
      document.getElementById('nav-leaders').style.display = '';
    }
    // Hide Add Member button for colored leaders (view-only)
    if (isColoredGroupLeader) {
      const addBtn = document.getElementById('add-member-btn');
      if (addBtn) addBtn.style.display = 'none';
    }
  }

  // Show inbox nav for group heads/admins (they receive requests and reports)
  if (isNoColorGroupLeader) {
    document.getElementById('nav-inbox-label').style.display = '';
    document.getElementById('nav-inbox-requests').style.display = '';
    document.getElementById('nav-inbox-reports').style.display = '';
  }

  const stats = await api('GET', '/api/stats');
  if (stats && stats.pending_requests > 0) {
    document.getElementById('hdr-badge-dot').style.display = '';
  }

  loadComms();
  if (isGroupLeader) loadGroupUsers();
})();

// ── COMMUNICATIONS ──────────────────────────────────────────────────────────
const STATUS_BADGE     = { pending: 'badge-warning', approved: 'badge-success', rejected: 'badge-danger' };
const STATUS_BADGE_RPT = { pending: 'badge-warning', approved: 'badge-success', rejected: 'badge-danger' };

let sentRequests = [], sentReports = [], inboxRequests = [], inboxReqHistory = [], inboxReports = [], inboxRptHistory = [];
let trackerReqFilter = 'all', trackerRptFilter = 'all';
let eligibleRequests = [];

async function loadComms() {
  const [evts, rpts, reqHist, rptHist, eligible] = await Promise.all([
    api('GET', '/api/events'),
    api('GET', '/api/reports'),
    isNoColorGroupLeader ? api('GET', '/api/events/inbox-history') : Promise.resolve([]),
    isNoColorGroupLeader ? api('GET', '/api/reports/inbox-history') : Promise.resolve([]),
    api('GET', '/api/reports/eligible-requests'),
  ]);
  const allEvts = evts || [];
  const allRpts = rpts || [];
  sentRequests     = allEvts.filter(e => e.submitted_by === userData.id && !e.pending_my_review);
  sentReports      = allRpts.filter(r => r.submitted_by === userData.id && !r.pending_my_review);
  inboxRequests    = allEvts.filter(e => e.pending_my_review);
  inboxReqHistory  = reqHist || [];
  inboxReports     = allRpts.filter(r => r.pending_my_review);
  inboxRptHistory  = rptHist || [];
  eligibleRequests = Array.isArray(eligible) ? eligible : [];
  populateReportRequestDropdown();

  if (isNoColorGroupLeader && inboxRequests.length > 0) {
    const b = document.getElementById('inbox-req-badge');
    b.textContent = inboxRequests.length;
    b.style.display = '';
    document.getElementById('hdr-badge-dot').style.display = '';
  }
  if (isNoColorGroupLeader && inboxReports.length > 0) {
    document.getElementById('hdr-badge-dot').style.display = '';
  }

  renderSentRequests();
  renderSentReports();
  renderInboxRequestsPending();
  renderInboxRequestsHistory();
  renderInboxReportsPending();
  renderInboxReportsHistory();
  renderTrackerRequests();
  renderTrackerReports();
}

function renderSentRequests() {
  const el = document.getElementById('sent-requests-list');
  if (!sentRequests.length) {
    el.innerHTML = '<div class="card"><div class="card-body text-muted text-sm">No requests sent yet.</div></div>';
    return;
  }
  el.innerHTML = sentRequests.map(e => `
    <div class="card" style="margin-bottom:0;">
      <div class="card-body" style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
        <div style="flex:1;min-width:0;">
          <div class="font-semibold" style="font-size:0.95rem;margin-bottom:0.25rem;">${escHtml(e.title)}</div>
          <div class="text-muted text-sm">${fmtDate(e.created_at)} · Needs: ${e.required_approval_level.toUpperCase()} · At: ${e.current_level}</div>
          ${e.location ? `<div class="text-sm" style="margin-top:0.2rem;">📍 ${escHtml(e.location)}${e.start_date ? ' · 📅 ' + e.start_date : ''}</div>` : ''}
        </div>
        <span class="badge ${STATUS_BADGE[e.status] || 'badge-neutral'}" style="flex-shrink:0;text-transform:capitalize;">${e.status}</span>
      </div>
    </div>`).join('');
}

function renderSentReports() {
  const el = document.getElementById('sent-reports-list');
  if (!sentReports.length) {
    el.innerHTML = '<div class="card"><div class="card-body text-muted text-sm">No reports sent yet.</div></div>';
    return;
  }
  el.innerHTML = sentReports.map(r => `
    <div class="card" style="margin-bottom:0;">
      <div class="card-body" style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
        <div style="flex:1;min-width:0;">
          <div class="font-semibold" style="font-size:0.95rem;margin-bottom:0.25rem;">${escHtml(r.title)}</div>
          <div class="text-muted text-sm">${fmtDate(r.created_at)}</div>
          <div class="text-sm" style="color:var(--text-secondary);margin-top:0.25rem;">${escHtml(r.body).slice(0,120)}${r.body.length > 120 ? '…' : ''}</div>
        </div>
        <span class="badge ${STATUS_BADGE_RPT[r.status] || 'badge-neutral'}" style="flex-shrink:0;text-transform:capitalize;">${r.status}</span>
      </div>
    </div>`).join('');
}

function renderInboxRequestsPending() {
  const el = document.getElementById('inbox-req-pending-list');
  if (!el) return;
  if (!inboxRequests.length) {
    el.innerHTML = '<div class="card"><div class="card-body text-muted text-sm">No pending requests.</div></div>';
    const b = document.getElementById('inbox-pending-badge');
    if (b) b.style.display = 'none';
    return;
  }
  const b = document.getElementById('inbox-pending-badge');
  if (b) { b.textContent = inboxRequests.length; b.style.display = ''; }
  el.innerHTML = inboxRequests.map(e => `
    <div class="request-card" id="inbox-card-${e.id}">
      <div class="request-card-header">
        <div style="flex:1;min-width:0;">
          <h4>${escHtml(e.title)}</h4>
          <div class="meta">${e.submitter_name ? escHtml(e.submitter_name) + ' · ' : ''}${fmtDate(e.created_at)}</div>
        </div>
        <span class="badge badge-warning">Awaiting review</span>
      </div>
      ${e.description ? `<div class="text-sm" style="color:var(--text-secondary);">${escHtml(e.description)}</div>` : ''}
      <div class="text-sm" style="display:flex;gap:1.5rem;flex-wrap:wrap;">
        ${e.location ? `<span>📍 ${escHtml(e.location)}</span>` : ''}
        ${e.start_date ? `<span>📅 ${e.start_date}${e.end_date ? ' → ' + e.end_date : ''}</span>` : ''}
        ${e.participants ? `<span>👥 ${e.participants}</span>` : ''}
      </div>
      <div class="text-sm text-muted">Approval needed: <strong>${e.required_approval_level.toUpperCase()}</strong></div>
      ${e.notes ? `<div class="text-sm" style="color:var(--text-secondary);">Notes: ${escHtml(e.notes)}</div>` : ''}
      <div id="inbox-alert-${e.id}"></div>
      <div class="flex gap-2" style="margin-top:0.5rem;">
        <button class="btn btn-success btn-sm" onclick="approveEvent(${e.id})">✅ Approve</button>
        <button class="btn btn-danger btn-sm" onclick="rejectEvent(${e.id})">❌ Reject</button>
      </div>
    </div>`).join('');
}

function renderInboxRequestsHistory() {
  const el = document.getElementById('inbox-req-history-list');
  if (!el) return;
  if (!inboxReqHistory.length) {
    el.innerHTML = '<div class="card"><div class="card-body text-muted text-sm">No history yet.</div></div>';
    return;
  }
  el.innerHTML = inboxReqHistory.map(e => `
    <div class="card" style="margin-bottom:0;">
      <div class="card-body" style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
        <div style="flex:1;min-width:0;">
          <div class="font-semibold" style="font-size:0.95rem;margin-bottom:0.25rem;">${escHtml(e.title)}</div>
          <div class="text-muted text-sm">From: ${escHtml(e.submitter_name || '—')}${e.submitter_group ? ' · ' + escHtml(e.submitter_group) : ''}</div>
          <div class="text-muted text-sm">${fmtDate(e.updated_at || e.created_at)}</div>
        </div>
        <span class="badge ${STATUS_BADGE[e.status] || 'badge-neutral'}" style="flex-shrink:0;text-transform:capitalize;">${e.status}</span>
      </div>
    </div>`).join('');
}

function renderInboxReportsPending() {
  const el = document.getElementById('inbox-rpt-pending-list');
  if (!el) return;
  if (!inboxReports.length) {
    el.innerHTML = '<div class="card"><div class="card-body text-muted text-sm">No pending reports.</div></div>';
    return;
  }
  el.innerHTML = inboxReports.map(r => `
    <div class="request-card" id="inbox-rpt-card-${r.id}">
      <div class="request-card-header">
        <div style="flex:1;min-width:0;">
          <h4>${escHtml(r.title)}</h4>
          <div class="meta">${r.submitter_name ? escHtml(r.submitter_name) + ' · ' : ''}${fmtDate(r.created_at)}</div>
        </div>
        <span class="badge badge-warning">Awaiting review</span>
      </div>
      ${r.body ? `<div class="text-sm" style="color:var(--text-secondary);">${escHtml(r.body).slice(0,200)}${r.body.length > 200 ? '…' : ''}</div>` : ''}
      <div class="text-sm text-muted">Approval needed: <strong>${r.required_approval_level.toUpperCase()}</strong></div>
      <div id="inbox-rpt-alert-${r.id}"></div>
      <div class="flex gap-2" style="margin-top:0.5rem;">
        <button class="btn btn-success btn-sm" onclick="approveReport(${r.id})">✅ Approve</button>
        <button class="btn btn-danger btn-sm" onclick="rejectReport(${r.id})">❌ Reject</button>
      </div>
    </div>`).join('');
}

function renderInboxReportsHistory() {
  const el = document.getElementById('inbox-rpt-history-list');
  if (!el) return;
  if (!inboxRptHistory.length) {
    el.innerHTML = '<div class="card"><div class="card-body text-muted text-sm">No history yet.</div></div>';
    return;
  }
  el.innerHTML = inboxRptHistory.map(r => `
    <div class="card" style="margin-bottom:0;">
      <div class="card-body" style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
        <div style="flex:1;min-width:0;">
          <div class="font-semibold" style="font-size:0.95rem;margin-bottom:0.25rem;">${escHtml(r.title)}</div>
          <div class="text-muted text-sm">From: ${escHtml(r.submitter_name || '—')}${r.submitter_group ? ' · ' + escHtml(r.submitter_group) : ''}</div>
          <div class="text-muted text-sm">${fmtDate(r.updated_at || r.created_at)}</div>
        </div>
        <span class="badge ${STATUS_BADGE_RPT[r.status] || 'badge-neutral'}" style="flex-shrink:0;text-transform:capitalize;">${r.status}</span>
      </div>
    </div>`).join('');
}

function renderTrackerRequests() {
  const el = document.getElementById('tracker-requests-list');
  const items = trackerReqFilter === 'all' ? sentRequests : sentRequests.filter(e => e.status === trackerReqFilter);
  if (!items.length) {
    el.innerHTML = '<div class="card"><div class="card-body text-muted text-sm">No requests found.</div></div>';
    return;
  }
  el.innerHTML = items.map(e => `
    <div class="card" style="margin-bottom:0;">
      <div class="card-body" style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
        <div style="flex:1;min-width:0;">
          <div class="font-semibold" style="font-size:0.95rem;margin-bottom:0.25rem;">${escHtml(e.title)}</div>
          <div class="text-muted text-sm">${fmtDate(e.created_at)} · Needs: ${e.required_approval_level.toUpperCase()} · Currently at: ${e.current_level}</div>
        </div>
        <span class="badge ${STATUS_BADGE[e.status] || 'badge-neutral'}" style="flex-shrink:0;text-transform:capitalize;">${e.status}</span>
      </div>
    </div>`).join('');
}

function renderTrackerReports() {
  const el = document.getElementById('tracker-reports-list');
  const items = trackerRptFilter === 'all' ? sentReports : sentReports.filter(r => r.status === trackerRptFilter);
  if (!items.length) {
    el.innerHTML = '<div class="card"><div class="card-body text-muted text-sm">No reports found.</div></div>';
    return;
  }
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

async function submitCommsRequest() {
  const title    = document.getElementById('cr-title').value.trim();
  const location = document.getElementById('cr-location').value.trim();
  const start_date = document.getElementById('cr-date').value;
  const alertEl  = document.getElementById('cr-alert');
  if (!title || !location || !start_date) {
    alertEl.innerHTML = '<div class="alert alert-danger"><span class="alert-icon">❌</span> Title, location, and start date are required.</div>';
    return;
  }
  const res = await api('POST', '/api/events', {
    title, location, start_date,
    description: document.getElementById('cr-desc').value.trim() || null,
    end_date: document.getElementById('cr-date-end').value || null,
    participants: parseInt(document.getElementById('cr-participants').value) || null,
    notes: document.getElementById('cr-notes').value.trim() || null,
    required_approval_level: document.getElementById('cr-approval-level').value,
  });
  if (res && res.id) {
    alertEl.innerHTML = '<div class="alert alert-success"><span class="alert-icon">✅</span> Request submitted.</div>';
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
  document.getElementById('cr-approval-level').value = 'district';
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

async function submitCommsReport() {
  const title    = document.getElementById('crpt-title').value.trim();
  const body     = document.getElementById('crpt-body').value.trim();
  const reqId    = parseInt(document.getElementById('crpt-request').value) || null;
  const level    = document.getElementById('crpt-approval-level').value;
  const alertEl  = document.getElementById('crpt-alert');
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
    alertEl.innerHTML = '<div class="alert alert-success"><span class="alert-icon">✅</span> Report submitted.</div>';
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
  document.getElementById('crpt-approval-level').value = 'district';
}

// ── Inbox approvals ──────────────────────────────────────────────────────────

async function approveEvent(id) {
  const res = await api('PUT', `/api/events/${id}/approve`, { note: '' });
  if (res && res.id) { toast('Request approved.', 'success'); await loadComms(); }
  else { const el = document.getElementById(`inbox-alert-${id}`); if (el) el.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">❌</span> ${res?.error || 'Failed.'}</div>`; }
}

async function rejectEvent(id) {
  const note = prompt('Reason for rejection (optional):') ?? null;
  if (note === null) return;
  const res = await api('PUT', `/api/events/${id}/reject`, { note: note.trim() || null });
  if (res && res.id) { toast('Request rejected.', 'danger'); await loadComms(); }
  else { const el = document.getElementById(`inbox-alert-${id}`); if (el) el.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">❌</span> ${res?.error || 'Failed.'}</div>`; }
}

async function approveReport(id) {
  const res = await api('PUT', `/api/reports/${id}/approve`, { note: '' });
  if (res && res.id) { toast('Report approved.', 'success'); await loadComms(); }
  else { const el = document.getElementById(`inbox-rpt-alert-${id}`); if (el) el.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">❌</span> ${res?.error || 'Failed.'}</div>`; }
}

async function rejectReport(id) {
  const note = prompt('Reason for rejection (optional):') ?? null;
  if (note === null) return;
  const res = await api('PUT', `/api/reports/${id}/reject`, { note: note.trim() || null });
  if (res && res.message) { toast('Report rejected.', 'danger'); await loadComms(); }
  else { const el = document.getElementById(`inbox-rpt-alert-${id}`); if (el) el.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">❌</span> ${res?.error || 'Failed.'}</div>`; }
}

// ── Group user management (group leaders only) ────────────────────────────────
let allGroupUsers = [];

async function loadGroupUsers() {
  allGroupUsers = await api('GET', '/api/users') || [];
  renderGroupUsers(allGroupUsers);
}

function renderGroupUsers(users) {
  let display = users;
  if (groupTabFilter === 'leaders') display = users.filter(u => u.level !== 'member');
  else if (groupTabFilter === 'members') display = users.filter(u => u.level === 'member');
  const tbody = document.getElementById('group-users-tbody');
  if (!display.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted text-sm" style="padding:1rem;">No users in this category.</td></tr>';
    return;
  }
  const colorBg = c => ({ pink: '#FEE2E2', yellow: '#FEF3C7', green: '#D1FAE5', red: '#FEE2E2' }[c] || '#F3F4F6');
  tbody.innerHTML = display.map(u => `
    <tr style="${!u.editable ? 'opacity:0.85;' : ''}">
      <td class="td-name">${escHtml(u.name)}</td>
      <td><code>${escHtml(u.username)}</code></td>
      <td><span class="badge badge-neutral" style="text-transform:capitalize;">${u.level}</span></td>
      <td>${u.color ? `<span class="badge" style="background:${colorBg(u.color)};color:#333;">${u.color}</span>` : '<span class="text-muted">—</span>'}</td>
      <td style="font-size:0.82rem;">${u.role_title ? escHtml(u.role_title) : '—'}</td>
      <td>
        <div class="flex gap-2">
          ${u.editable ? `<button class="btn btn-sm btn-secondary" onclick="openGmModal(${u.id})">✏️ Edit</button>` : '<span class="text-muted text-sm">view only</span>'}
          ${u.editable && u.level === 'member' ? `<button class="btn btn-sm btn-danger" onclick="confirmDeleteMember(${u.id}, '${escHtml(u.name)}')">🗑️</button>` : ''}
        </div>
      </td>
    </tr>`).join('');
}

function filterGroupUsers() {
  const q = document.getElementById('group-search').value.toLowerCase();
  renderGroupUsers(allGroupUsers.filter(u =>
    u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)
  ));
}

function openAddMemberModal() {
  ['am-name','am-username','am-password','am-email','am-role-title'].forEach(id => {
    document.getElementById(id).value = '';
  });
  const colorSel = document.getElementById('am-color');
  if (userData && userData.color) { colorSel.value = userData.color; colorSel.disabled = true; }
  else { colorSel.value = ''; colorSel.disabled = false; }
  document.getElementById('am-alert').innerHTML = '';
  document.getElementById('am-modal').classList.add('open');
}

function closeAddMemberModal() { document.getElementById('am-modal').classList.remove('open'); }

async function saveNewMember() {
  const name      = document.getElementById('am-name').value.trim();
  const username  = document.getElementById('am-username').value.trim();
  const password  = document.getElementById('am-password').value;
  const email     = document.getElementById('am-email').value.trim() || null;
  const color     = document.getElementById('am-color').value || null;
  const roleTitle = document.getElementById('am-role-title').value.trim() || null;
  const alertEl   = document.getElementById('am-alert');
  if (!name || !username || !password) {
    alertEl.innerHTML = '<div class="alert alert-danger"><span class="alert-icon">❌</span> Name, username, and password are required.</div>';
    return;
  }
  const res = await api('POST', '/api/users', { name, username, password, email, color, role_title: roleTitle });
  if (res && res.id) {
    toast('Member added.', 'success');
    closeAddMemberModal();
    allGroupUsers = await api('GET', '/api/users') || [];
    renderGroupUsers(allGroupUsers);
  } else {
    alertEl.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">❌</span> ${res?.error || 'Failed.'}</div>`;
  }
}

async function confirmDeleteMember(userId, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  const res = await api('DELETE', `/api/users/${userId}`);
  if (res && res.message) {
    toast('Member deleted.', 'success');
    allGroupUsers = await api('GET', '/api/users') || [];
    renderGroupUsers(allGroupUsers);
  } else { toast(res?.error || 'Failed to delete.', 'danger'); }
}

let gmEditingId = null;

function openGmModal(userId) {
  const u = allGroupUsers.find(x => x.id === userId);
  if (!u) return;
  gmEditingId = userId;
  document.getElementById('gm-id').value = userId;
  document.getElementById('gm-name').value = u.name;
  document.getElementById('gm-email').value = u.email || '';
  document.getElementById('gm-role-title').value = u.role_title || '';
  document.getElementById('gm-password').value = '';
  document.getElementById('gm-modal').classList.add('open');
}

function closeGmModal() { document.getElementById('gm-modal').classList.remove('open'); gmEditingId = null; }

async function saveGmUser() {
  const body = {
    name:       document.getElementById('gm-name').value.trim(),
    email:      document.getElementById('gm-email').value.trim() || null,
    role_title: document.getElementById('gm-role-title').value.trim() || null,
    password:   document.getElementById('gm-password').value || null,
  };
  if (!body.name) { toast('Name is required.', 'danger'); return; }
  const res = await api('PUT', `/api/users/${gmEditingId}`, body);
  if (res && res.id) {
    toast('User updated.', 'success');
    closeGmModal();
    allGroupUsers = await api('GET', '/api/users') || [];
    renderGroupUsers(allGroupUsers);
  } else { toast(res?.error || 'Failed.', 'danger'); }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
const SECTION_TITLES = {
  home:             ['Dashboard',       'Leader overview'],
  'send-request':   ['Send Request',    'Submit an event request'],
  'send-report':    ['Send Report',     'Submit a report'],
  'inbox-requests': ['Received Requests','Review event requests from your group'],
  'inbox-reports':  ['Received Reports', 'Review reports from your group'],
  'tracker-requests':['Request Tracker','Track your submitted requests'],
  'tracker-reports': ['Report Tracker', 'Track your submitted reports'],
  group:            ['My Group',        'View and edit your group'],
};

let groupTabFilter = 'all';

function showGroupTab(tab, btn) {
  groupTabFilter = tab;
  showSection('group', btn);
  const titles = {
    leaders: ['Leaders', 'View and manage leaders in your group'],
    members: ['Members', 'View and manage members in your group'],
  };
  const t = titles[tab] || ['My Group', ''];
  document.getElementById('section-title').textContent = t[0];
  document.getElementById('section-subtitle').textContent = t[1];
  const addBtn = document.getElementById('add-member-btn');
  if (addBtn) addBtn.style.display = tab === 'members' ? '' : 'none';
  renderGroupUsers(allGroupUsers);
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
  return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}
