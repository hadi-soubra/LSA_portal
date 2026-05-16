// ── Auth guard ──────────────────────────────────────────────────────────────
const lsaToken  = sessionStorage.getItem('lsa_token');
const userData  = JSON.parse(sessionStorage.getItem('lsa_user')   || 'null');
const personData = JSON.parse(sessionStorage.getItem('lsa_person') || 'null');
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
    const displayName = (personData && personData.name) || userData.name;
    const initials = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    document.getElementById('user-avatar').textContent = initials;
    document.getElementById('user-name').textContent = displayName;
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
    const dot = document.getElementById('hdr-badge-dot');
    if (dot) dot.style.display = '';
  }

  const commsP = loadComms();
  const groupP = isGroupLeader ? loadGroupUsers() : Promise.resolve();
  await Promise.all([commsP, groupP]);
  renderHomeDashboard({
    displayName: (personData && personData.name) || (userData && userData.name) || 'Leader',
    groupName:   userData && userData.group_name,
    roleTitle:   userData && userData.role_title,
    colorLabel:  userData && userData.color
      ? ` · ${userData.color.charAt(0).toUpperCase() + userData.color.slice(1)} Unit` : '',
    sentRequests, sentReports,
    inboxRequests, inboxReports,
    groupUsers:  allGroupUsers,
    showInbox:       isGroupHeadOrAdmin,
    showPending:     isGroupHeadOrAdmin,
    showGroup:       isGroupLeader,
    showLeaderCount: isGroupLeader,
    userColor:       userData.color || null,
  });
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

  if (isNoColorGroupLeader) {
    const reqBadge = document.getElementById('inbox-req-badge');
    if (reqBadge) { reqBadge.textContent = inboxRequests.length; reqBadge.style.display = inboxRequests.length > 0 ? '' : 'none'; }
    const rptBadge = document.getElementById('inbox-rpt-badge');
    if (rptBadge) { rptBadge.textContent = inboxReports.length; rptBadge.style.display = inboxReports.length > 0 ? '' : 'none'; }
    const dot = document.getElementById('hdr-badge-dot');
    if (dot) { dot.style.display = (inboxRequests.length + inboxReports.length) > 0 ? '' : 'none'; }
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
        <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;">
          <button class="btn btn-sm btn-secondary" onclick="openRequestDetail(${e.id})">View</button>
          <span class="badge ${STATUS_BADGE[e.status] || 'badge-neutral'}" style="text-transform:capitalize;">${e.status}</span>
        </div>
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
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;">
          <button class="btn btn-sm btn-secondary" onclick="openReportDetail(${r.id})">View</button>
          <span class="badge ${STATUS_BADGE_RPT[r.status] || 'badge-neutral'}" style="text-transform:capitalize;">${r.status}</span>
        </div>
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
  el.innerHTML = inboxRequests.map(e => {
    const role = e.submitter_role_title ? escHtml(e.submitter_role_title) : '';
    const unit = e.submitter_color ? (e.submitter_color.charAt(0).toUpperCase() + e.submitter_color.slice(1) + ' Unit') : '';
    const meta = [role, unit].filter(Boolean).join(' · ');
    const type = e.activity_type ? escHtml(e.activity_type) + ' · ' : '';
    return `
    <div class="request-card" id="inbox-card-${e.id}">
      <div class="request-card-header">
        <div style="flex:1;min-width:0;">
          <h4>${escHtml(e.submitter_name || '—')}</h4>
          ${meta ? `<div class="meta">${meta}</div>` : ''}
          <div class="text-sm" style="margin-top:0.2rem;color:var(--text-secondary);">${type}${escHtml(e.title)}</div>
        </div>
        <span class="badge badge-warning">Awaiting review</span>
      </div>
      <div style="margin-top:0.75rem;">
        <button class="btn btn-secondary btn-sm" onclick="openRequestDetail(${e.id}, true)">📋 View Request</button>
      </div>
    </div>`;
  }).join('');
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
        <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;">
          <button class="btn btn-sm btn-secondary" onclick="openRequestDetail(${e.id})">View</button>
          <span class="badge ${STATUS_BADGE[e.status] || 'badge-neutral'}" style="text-transform:capitalize;">${e.status}</span>
        </div>
      </div>
    </div>`).join('');
}

function renderInboxReportsPending() {
  const el = document.getElementById('inbox-rpt-pending-list');
  if (!el) return;
  const b = document.getElementById('inbox-rpt-pending-badge');
  if (!inboxReports.length) {
    el.innerHTML = '<div class="card"><div class="card-body text-muted text-sm">No pending reports.</div></div>';
    if (b) b.style.display = 'none';
    return;
  }
  if (b) { b.textContent = inboxReports.length; b.style.display = ''; }
  el.innerHTML = inboxReports.map(r => {
    const role = r.submitter_role_title ? escHtml(r.submitter_role_title) : '';
    const unit = r.submitter_color ? (r.submitter_color.charAt(0).toUpperCase() + r.submitter_color.slice(1) + ' Unit') : '';
    const meta = [role, unit].filter(Boolean).join(' · ');
    return `
    <div class="request-card" id="inbox-rpt-card-${r.id}">
      <div class="request-card-header">
        <div style="flex:1;min-width:0;">
          <h4>${escHtml(r.submitter_name || '—')}</h4>
          ${meta ? `<div class="meta">${meta}</div>` : ''}
          <div class="text-sm" style="margin-top:0.2rem;color:var(--text-secondary);">Activity Report · ${escHtml(r.title)}</div>
        </div>
        <span class="badge badge-warning">Awaiting review</span>
      </div>
      <div style="margin-top:0.75rem;">
        <button class="btn btn-secondary btn-sm" onclick="openReportDetail(${r.id}, true)">📄 View Report</button>
      </div>
    </div>`;
  }).join('');
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
        <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;">
          <button class="btn btn-sm btn-secondary" onclick="openReportDetail(${r.id})">View</button>
          <span class="badge ${STATUS_BADGE_RPT[r.status] || 'badge-neutral'}" style="text-transform:capitalize;">${r.status}</span>
        </div>
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
        <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;">
          <button class="btn btn-sm btn-secondary" onclick="openRequestDetail(${e.id})">View</button>
          <span class="badge ${STATUS_BADGE[e.status] || 'badge-neutral'}" style="text-transform:capitalize;">${e.status}</span>
        </div>
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
        <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;">
          <button class="btn btn-sm btn-secondary" onclick="openReportDetail(${r.id})">View</button>
          <span class="badge ${STATUS_BADGE_RPT[r.status] || 'badge-neutral'}" style="text-transform:capitalize;">${r.status}</span>
        </div>
      </div>
    </div>`).join('');
}

function setTrackerFilter(type, filter, btn) {
  if (type === 'requests') { trackerReqFilter = filter; renderTrackerRequests(); }
  else { trackerRptFilter = filter; renderTrackerReports(); }
  btn.closest('div').querySelectorAll('button').forEach(b => b.className = 'btn btn-sm btn-secondary');
  btn.className = 'btn btn-sm btn-primary';
}

// ── Inbox approvals ──────────────────────────────────────────────────────────

let _leaderPendingAction = null;

function promptAction(type, id) {
  _leaderPendingAction = { type, id };
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
  _leaderPendingAction = null;
}

async function executeAction() {
  if (!_leaderPendingAction) return;
  const { type, id } = _leaderPendingAction;
  const note = document.getElementById('action-note').value.trim();
  closeActionModal();
  let res;
  if (type === 'approve') {
    res = await api('PUT', `/api/events/${id}/approve`, { note });
    if (res && !res.error) toast(res.status === 'approved' ? 'Request approved.' : 'Request forwarded.', 'success');
  } else if (type === 'reject') {
    res = await api('PUT', `/api/events/${id}/reject`, { note });
    if (res && !res.error) toast('Request rejected.', 'danger');
  } else if (type === 'approve_report') {
    res = await api('PUT', `/api/reports/${id}/approve`, { note });
    if (res && !res.error) toast(res.status === 'approved' ? 'Report approved.' : 'Report forwarded.', 'success');
  } else if (type === 'reject_report') {
    res = await api('PUT', `/api/reports/${id}/reject`, { note });
    if (res && !res.error) toast('Report rejected.', 'danger');
  }
  if (res && res.error) { toast(res.error, 'danger'); return; }
  await loadComms();
}

window.__reviewApproveRequest = id => { closeRequestDetail(); promptAction('approve', id); };
window.__reviewRejectRequest  = id => { closeRequestDetail(); promptAction('reject', id); };
window.__reviewApproveReport  = id => { closeReportDetail(); promptAction('approve_report', id); };
window.__reviewRejectReport   = id => { closeReportDetail(); promptAction('reject_report', id); };

// ── Group user management (group leaders only) ────────────────────────────────
let allGroupUsers = [];
let assignLeaderRoleId = null;

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
    tbody.innerHTML = '<tr><td colspan="5" class="text-muted text-sm" style="padding:1rem;">No users in this category.</td></tr>';
    return;
  }
  const colorBg = c => ({ pink: '#FEE2E2', yellow: '#FEF3C7', green: '#D1FAE5', red: '#FEE2E2' }[c] || '#F3F4F6');
  tbody.innerHTML = display.map(u => {
    const displayName  = u.person_name  || u.name;
    const displayEmail = u.person_email || '—';
    return `
    <tr style="${!u.editable ? 'opacity:0.85;' : ''}">
      <td class="td-name">
        <div>${escHtml(displayName)}</div>
        <div style="font-size:0.77rem;color:var(--text-muted);">${escHtml(displayEmail)}</div>
      </td>
      <td><span class="badge badge-neutral" style="text-transform:capitalize;">${u.level}</span></td>
      <td>${u.color ? `<span class="badge" style="background:${colorBg(u.color)};color:#333;">${u.color}</span>` : '<span class="text-muted">—</span>'}</td>
      <td style="font-size:0.82rem;">${u.role_title ? escHtml(u.role_title) : '—'}</td>
      <td>
        <div class="flex gap-2">
          ${!u.editable
            ? '<span class="text-muted text-sm">view only</span>'
            : u.level !== 'member'
              ? (!u.person_id
                  ? `<button class="btn btn-sm btn-primary" onclick="openAssignLeaderModal(${u.id})">Assign</button>`
                  : `<button class="btn btn-sm btn-secondary" onclick="openGmModal(${u.person_id})">✏️ Edit</button>
                     <button class="btn btn-sm btn-danger" onclick="confirmRemoveLeader(${u.id}, ${u.person_id})">Remove</button>`
                )
              : `<button class="btn btn-sm btn-secondary" onclick="openGmModal(${u.person_id})">✏️ Edit</button>
                 <button class="btn btn-sm btn-danger" onclick="confirmDeleteMember(${u.person_id}, '${escHtml(displayName)}')">🗑️</button>`
          }
        </div>
      </td>
    </tr>`;
  }).join('');
}

function filterGroupUsers() {
  const q = document.getElementById('group-search').value.toLowerCase();
  renderGroupUsers(allGroupUsers.filter(u =>
    (u.person_name  || u.name).toLowerCase().includes(q) ||
    (u.person_email || '').toLowerCase().includes(q)
  ));
}

function openAddMemberModal() {
  ['am-name','am-email','am-password','am-role-title'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
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
  const email     = document.getElementById('am-email').value.trim();
  const password  = document.getElementById('am-password').value;
  const color     = document.getElementById('am-color').value || null;
  const roleTitle = document.getElementById('am-role-title').value?.trim() || null;
  const alertEl   = document.getElementById('am-alert');
  if (!name || !email || !password) {
    alertEl.innerHTML = '<div class="alert alert-danger"><span class="alert-icon">❌</span> Name, email, and password are required.</div>';
    return;
  }
  const res = await api('POST', '/api/users', { name, email, password, color, role_title: roleTitle });
  if (res && res.id) {
    toast('Member added.', 'success');
    closeAddMemberModal();
    allGroupUsers = await api('GET', '/api/users') || [];
    renderGroupUsers(allGroupUsers);
  } else {
    alertEl.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">❌</span> ${res?.error || 'Failed.'}</div>`;
  }
}

async function confirmDeleteMember(personId, name) {
  if (!confirm(`Remove "${name}" from the group?`)) return;
  const res = await api('DELETE', `/api/users/${personId}`);
  if (res && res.message) {
    toast('Member removed.', 'success');
    allGroupUsers = await api('GET', '/api/users') || [];
    renderGroupUsers(allGroupUsers);
  } else { toast(res?.error || 'Failed to delete.', 'danger'); }
}

let gmEditingId = null;

function openGmModal(personId) {
  const u = allGroupUsers.find(x => x.person_id === personId);
  if (!u) return;
  gmEditingId = personId;
  document.getElementById('gm-id').value = personId;
  document.getElementById('gm-name').value = u.person_name || u.name;
  document.getElementById('gm-email').value = u.person_email || '';
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
  const res = await api('PUT', `/api/users/${gmEditingId}`, body);  // gmEditingId is person_id
  if (res && res.id) {
    toast('User updated.', 'success');
    closeGmModal();
    allGroupUsers = await api('GET', '/api/users') || [];
    renderGroupUsers(allGroupUsers);
  } else { toast(res?.error || 'Failed.', 'danger'); }
}

function openAddLeaderModal() {
  ['addl-name','addl-email','addl-password','addl-role-title'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('addl-level').value = 'group';
  document.getElementById('addl-color').value = '';
  document.getElementById('addl-alert').innerHTML = '';
  document.getElementById('addl-modal').classList.add('open');
}

function closeAddLeaderModal() { document.getElementById('addl-modal').classList.remove('open'); }

async function saveNewLeader() {
  const name      = document.getElementById('addl-name').value.trim();
  const email     = document.getElementById('addl-email').value.trim();
  const password  = document.getElementById('addl-password').value;
  const level     = document.getElementById('addl-level').value;
  const color     = document.getElementById('addl-color').value || null;
  const roleTitle = document.getElementById('addl-role-title').value.trim() || null;
  const alertEl   = document.getElementById('addl-alert');
  if (!name || !email || !password) {
    alertEl.innerHTML = '<div class="alert alert-danger"><span class="alert-icon">❌</span> Name, email, and password are required.</div>';
    return;
  }
  const res = await api('POST', '/api/users', { name, email, password, level, color, role_title: roleTitle, dashboard: 'leader' });
  if (res && res.id) {
    toast('Leader added.', 'success');
    closeAddLeaderModal();
    allGroupUsers = await api('GET', '/api/users') || [];
    renderGroupUsers(allGroupUsers);
  } else {
    alertEl.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">❌</span> ${escHtml(res?.error || 'Failed.')}</div>`;
  }
}

function openAssignLeaderModal(roleId) {
  const slot = allGroupUsers.find(x => x.id === roleId);
  const roleName = slot ? (slot.role_title || slot.name) : 'Leader Slot';
  assignLeaderRoleId = roleId;
  document.getElementById('al-role-name').textContent = roleName;
  document.getElementById('al-email').value    = '';
  document.getElementById('al-name').value     = '';
  document.getElementById('al-password').value = '';
  document.getElementById('al-alert').innerHTML = '';
  document.getElementById('al-modal').classList.add('open');
}

function closeAssignLeaderModal() {
  document.getElementById('al-modal').classList.remove('open');
  assignLeaderRoleId = null;
}

async function saveAssignLeader() {
  const email    = document.getElementById('al-email').value.trim();
  const name     = document.getElementById('al-name').value.trim();
  const password = document.getElementById('al-password').value;
  const alertEl  = document.getElementById('al-alert');
  if (!email) {
    alertEl.innerHTML = '<div class="alert alert-danger"><span class="alert-icon">❌</span> Email is required.</div>';
    return;
  }
  const body = { email };
  if (name)     body.name     = name;
  if (password) body.password = password;
  const res = await api('POST', `/api/admin/roles/${assignLeaderRoleId}/assign`, body);
  if (res && !res.error) {
    toast('Leader assigned.', 'success');
    closeAssignLeaderModal();
    allGroupUsers = await api('GET', '/api/users') || [];
    renderGroupUsers(allGroupUsers);
  } else {
    alertEl.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">❌</span> ${escHtml(res?.error || 'Failed to assign.')}</div>`;
  }
}

async function confirmRemoveLeader(roleId, personId) {
  const slot = allGroupUsers.find(x => x.id === roleId);
  const name = slot ? (slot.person_name || slot.name) : 'this person';
  if (!confirm(`Remove "${name}" from this leader slot?`)) return;
  const res = await api('DELETE', `/api/admin/roles/${roleId}/persons/${personId}`);
  if (res && res.message) {
    toast('Leader removed.', 'success');
    allGroupUsers = await api('GET', '/api/users') || [];
    renderGroupUsers(allGroupUsers);
  } else {
    toast(res?.error || 'Failed to remove.', 'danger');
  }
}

// ── Content send ─────────────────────────────────────────────────────────────
const _initedContentSections = new Set();

function renderContentSendForm(sectionId, recipientType) {
  const el = document.getElementById('sec-' + sectionId);
  const p  = 'cs-' + recipientType;
  el.innerHTML = `
    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-header"><span class="card-title">📤 Send Content</span></div>
      <div class="card-body">
        <div id="${p}-alert"></div>
        <div class="form-group">
          <label class="form-label">Title *</label>
          <input class="form-control" type="text" id="${p}-title" placeholder="Content title" />
        </div>
        <div class="form-group">
          <label class="form-label">Message</label>
          <textarea class="form-control" id="${p}-body" rows="4" placeholder="Write your message…"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Category *</label>
          <select class="form-control" id="${p}-type">
            <option value="notification">Info / Announcement</option>
            <option value="training">Education / Training</option>
            <option value="activity">Promotion / Activity</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Target Units <span class="text-muted" style="font-weight:400;">(leave unchecked for all)</span></label>
          <div style="display:flex;gap:1.25rem;flex-wrap:wrap;margin-top:0.5rem;">
            <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;"><input type="checkbox" class="${p}-color" value="pink" /> Pink</label>
            <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;"><input type="checkbox" class="${p}-color" value="yellow" /> Yellow</label>
            <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;"><input type="checkbox" class="${p}-color" value="green" /> Green</label>
            <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;"><input type="checkbox" class="${p}-color" value="red" /> Red</label>
          </div>
        </div>
        <button class="btn btn-primary" onclick="submitContent('${recipientType}')">📤 Send</button>
      </div>
    </div>
    <h4 style="font-size:0.95rem;color:var(--text-secondary);margin-bottom:1rem;">Recently Sent</h4>
    <div id="${p}-history" class="text-muted text-sm">No recent content.</div>`;
}

async function submitContent(recipientType) {
  const p       = 'cs-' + recipientType;
  const title   = document.getElementById(`${p}-title`).value.trim();
  const body    = document.getElementById(`${p}-body`).value.trim();
  const ctype   = document.getElementById(`${p}-type`).value;
  const colors  = [...document.querySelectorAll(`.${p}-color:checked`)].map(el => el.value);
  const alertEl = document.getElementById(`${p}-alert`);

  if (!title) {
    alertEl.innerHTML = '<div class="alert alert-danger"><span class="alert-icon">❌</span> Title is required.</div>';
    return;
  }
  const res = await api('POST', '/api/content', {
    title, body, content_type: ctype,
    target_colors: colors.length ? colors : null,
    target_recipient_type: recipientType,
  });
  if (res && !res.error) {
    alertEl.innerHTML = '<div class="alert alert-success"><span class="alert-icon">✅</span> Content sent.</div>';
    document.getElementById(`${p}-title`).value = '';
    document.getElementById(`${p}-body`).value  = '';
    document.querySelectorAll(`.${p}-color`).forEach(el => el.checked = false);
    setTimeout(() => alertEl.innerHTML = '', 3000);
  } else {
    alertEl.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">❌</span> ${escHtml(res?.error || 'Failed to send content.')}</div>`;
  }
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
  'content-send-members': ['Content', 'Send to Members'],
  'content-send-leaders': ['Content', 'Send to Leaders'],
  'content-info':      ['Content', 'Info'],
  'content-education': ['Content', 'Education'],
  'content-promotion': ['Content', 'Promotion'],
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
  const addLeaderBtn = document.getElementById('add-leader-btn');
  if (addLeaderBtn) addLeaderBtn.style.display = tab === 'leaders' ? '' : 'none';
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
  document.getElementById('sidebar-backdrop').classList.remove('open');
  if (!_initedContentSections.has(id)) {
    if (id === 'content-send-members') { _initedContentSections.add(id); renderContentSendForm(id, 'members'); }
    if (id === 'content-send-leaders') { _initedContentSections.add(id); renderContentSendForm(id, 'leaders'); }
  }
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
  return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}
