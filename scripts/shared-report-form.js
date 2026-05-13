// ── Shared report submission form ─────────────────────────────────────────────
// Used by: leader, gc, district dashboards.
//
// Depends on globals provided by the loading dashboard's script:
//   api(method, url, body)   — fetch wrapper
//   escHtml(str)             — HTML escaper
//   eligibleRequests         — array loaded by loadComms()
//   loadComms()              — reloads all comms data after submit
//
// Also depends on report-detail.js (loaded separately):
//   openReportDetail(id)     — opens the report detail modal
//
// The approval-level dropdown options (<select id="crpt-approval-level">)
// are defined per-dashboard in each HTML file — this script never touches them
// beyond reading the selected value. clearCommsReportForm() resets to the
// first option (selectedIndex = 0) so each dashboard keeps its own default.

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

function onReportRequestChange() {
  const val  = document.getElementById('crpt-request').value;
  const info = document.getElementById('crpt-activity-info');
  const req  = eligibleRequests.find(r => String(r.id) === val);
  if (!req) { info.style.display = 'none'; return; }
  const parts = [];
  if (req.location)   parts.push(`📍 ${escHtml(req.location)}`);
  if (req.start_date) parts.push(`📅 ${req.start_date}`);
  info.innerHTML = parts.join(' &nbsp;·&nbsp; ');
  info.style.display = parts.length ? '' : 'none';
}

function toggleSafetyDetails() {
  document.getElementById('crpt-safety-details-group').style.display =
    document.getElementById('crpt-safety-incident').checked ? '' : 'none';
}

async function submitCommsReport() {
  const title   = document.getElementById('crpt-title').value.trim();
  const body    = document.getElementById('crpt-body').value.trim();
  const reqId   = parseInt(document.getElementById('crpt-request').value) || null;
  const level   = document.getElementById('crpt-approval-level').value;
  const alertEl = document.getElementById('crpt-alert');

  if (!title || !body) {
    alertEl.innerHTML = '<div class="alert alert-danger"><span class="alert-icon">❌</span> Title and "What Happened" are required.</div>';
    return;
  }
  if (!reqId) {
    alertEl.innerHTML = '<div class="alert alert-danger"><span class="alert-icon">❌</span> Please select a linked activity.</div>';
    return;
  }

  const safetyIncident = document.getElementById('crpt-safety-incident').checked;
  const res = await api('POST', '/api/reports', {
    title, body,
    request_id:              reqId,
    required_approval_level: level,
    leaders_count:   parseInt(document.getElementById('crpt-leaders-count').value) || null,
    members_count:   parseInt(document.getElementById('crpt-members-count').value) || null,
    guests_count:    parseInt(document.getElementById('crpt-guests-count').value)  || null,
    objectives:      document.getElementById('crpt-objectives').value.trim()      || null,
    outcomes:        document.getElementById('crpt-outcomes').value.trim()        || null,
    challenges:      document.getElementById('crpt-challenges').value.trim()      || null,
    safety_incident: safetyIncident,
    safety_details:  safetyIncident ? (document.getElementById('crpt-safety-details').value.trim() || null) : null,
    budget_planned:  document.getElementById('crpt-budget-planned').value.trim()  || null,
    budget_actual:   document.getElementById('crpt-budget-actual').value.trim()   || null,
    recommendations: document.getElementById('crpt-recommendations').value.trim() || null,
  });
  if (res && res.id) {
    const reportId = res.id;
    alertEl.innerHTML = `<div class="alert alert-success"><span class="alert-icon">✅</span> Report submitted. <button class="btn btn-sm btn-secondary" style="margin-left:0.5rem;" onclick="openReportDetail(${reportId})">View Report</button></div>`;
    clearCommsReportForm();
    await loadComms();
  } else {
    alertEl.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">❌</span> ${res?.error || 'Error submitting.'}</div>`;
    setTimeout(() => alertEl.innerHTML = '', 4000);
  }
}

function clearCommsReportForm() {
  ['crpt-title', 'crpt-body', 'crpt-objectives', 'crpt-outcomes', 'crpt-challenges',
   'crpt-safety-details', 'crpt-budget-planned', 'crpt-budget-actual', 'crpt-recommendations',
   'crpt-leaders-count', 'crpt-members-count', 'crpt-guests-count'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('crpt-request').value = '';
  document.getElementById('crpt-approval-level').selectedIndex = 0;
  document.getElementById('crpt-safety-incident').checked = false;
  document.getElementById('crpt-safety-details-group').style.display = 'none';
  document.getElementById('crpt-activity-info').style.display        = 'none';
}
