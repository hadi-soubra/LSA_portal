// ── Shared event request detail & print ───────────────────────────────────────
// Depends on: api(), escHtml(), fmtDate(), STATUS_BADGE  (defined per-dashboard)

let _requestPrintTitle = 'Event Request';

async function openRequestDetail(eventId) {
  const modal = document.getElementById('request-detail-modal');
  const body  = document.getElementById('request-detail-body');
  body.innerHTML = '<div class="text-muted text-sm" style="padding:2rem;">Loading…</div>';
  modal.classList.add('open');
  const r = await api('GET', `/api/events/${eventId}`);
  if (!r || r.error) {
    body.innerHTML = `<div class="alert alert-danger" style="margin:1rem;">${r?.error || 'Failed to load request.'}</div>`;
    return;
  }
  const date = r.start_date || (r.created_at || '').slice(0, 10);
  _requestPrintTitle = `Request - ${r.title}${date ? ' - ' + date : ''}`;
  const html = renderRequestDetailHTML(r);
  body.innerHTML = html;
  document.getElementById('request-print-area').innerHTML = html;
}

function closeRequestDetail() {
  document.getElementById('request-detail-modal').classList.remove('open');
}

function printRequest() {
  document.getElementById('report-print-area').innerHTML = '';
  const prev = document.title;
  document.title = _requestPrintTitle;
  window.print();
  document.title = prev;
}

function renderRequestDetailHTML(r) {
  const total = (r.leaders_count || 0) + (r.members_count || 0) + (r.guests_count || 0);
  const esc   = escHtml;
  const field = (label, val) => val
    ? `<div class="rpt-field-row"><span class="rpt-field-label">${label}</span><span class="rpt-field-value">${esc(String(val))}</span></div>`
    : '';
  const section = (title, content) =>
    `<div class="rpt-section"><div class="rpt-section-title">${title}</div>${content}</div>`;

  const dateRange = r.start_date
    ? fmtDate(r.start_date) + (r.end_date ? ' → ' + fmtDate(r.end_date) : '')
    : null;
  const timeRange = r.start_time
    ? r.start_time + (r.end_time ? ' – ' + r.end_time : '')
    : null;

  const hasParticipants = r.leaders_count || r.members_count || r.guests_count;

  return `
  <div class="rpt-doc">
    <div class="rpt-header">
      <img src="assets/LSA-logo-header-compact.png" alt="LSA" class="rpt-logo" />
      <div class="rpt-header-text">
        <div class="rpt-org">Lebanese Scouts Association</div>
        <div class="rpt-doc-type">Event Request</div>
      </div>
      <span class="badge ${STATUS_BADGE[r.status] || 'badge-neutral'} rpt-status-badge" style="text-transform:capitalize;">${r.status}</span>
    </div>

    <div class="rpt-title">${esc(r.title)}</div>
    <div class="rpt-meta-row">
      <span>Submitted: ${fmtDate(r.created_at)}</span>
      <span>Approval level: ${(r.required_approval_level || '').toUpperCase()}</span>
    </div>

    ${section('Submitted By', `
      ${field('Name',     r.submitter_name)}
      ${field('Role',     r.submitter_role_title)}
      ${field('Unit',     r.submitter_color ? r.submitter_color.charAt(0).toUpperCase() + r.submitter_color.slice(1) : null)}
      ${field('Group',    r.submitter_group)}
      ${field('District', r.submitter_district)}
    `)}

    ${section('Activity Details', `
      ${field('Type',     r.activity_type)}
      ${field('Location', r.location)}
      ${field('Date',     dateRange)}
      ${field('Time',     timeRange)}
    `)}

    ${hasParticipants ? section('Expected Participants', `
      <div class="rpt-participation-grid">
        <div class="rpt-stat"><div class="rpt-stat-val">${r.leaders_count ?? '—'}</div><div class="rpt-stat-label">Leaders</div></div>
        <div class="rpt-stat"><div class="rpt-stat-val">${r.members_count ?? '—'}</div><div class="rpt-stat-label">Members</div></div>
        <div class="rpt-stat"><div class="rpt-stat-val">${r.guests_count  ?? '—'}</div><div class="rpt-stat-label">Guests</div></div>
        <div class="rpt-stat"><div class="rpt-stat-val">${total || '—'}</div><div class="rpt-stat-label">Total</div></div>
      </div>
    `) : ''}

    ${r.description ? section('Objectives & Description', `<div class="rpt-body-text">${esc(r.description)}</div>`) : ''}

    ${r.materials ? section('Materials & Equipment', `<div class="rpt-body-text">${esc(r.materials)}</div>`) : ''}

    ${section('Transport', `
      ${field('Transport needed', r.transport_needed ? 'Yes' : 'No')}
      ${r.transport_needed && r.transport_details ? `<div class="rpt-body-text" style="margin-top:0.4rem;">${esc(r.transport_details)}</div>` : ''}
    `)}

    ${r.budget_estimated ? section('Budget', `
      ${field('Estimated', r.budget_estimated)}
    `) : ''}

    ${r.notes ? section('Notes for Approver', `<div class="rpt-body-text">${esc(r.notes)}</div>`) : ''}

    <div class="rpt-footer">
      <div class="rpt-sig-label">Submitted by</div>
      <div class="rpt-sig-name">${esc(r.submitter_name || '—')}</div>
      ${r.submitter_role_title ? `<div class="rpt-sig-role">${esc(r.submitter_role_title)}</div>` : ''}
      <div class="rpt-sig-date">Date: ${fmtDate(r.created_at)}</div>
    </div>
  </div>`;
}
