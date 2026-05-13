// ── Shared report detail & print ─────────────────────────────
// Depends on: escHtml(), fmtDate(), STATUS_BADGE_RPT  (defined per-dashboard)

let _reportPrintTitle = 'Activity Report';

async function openReportDetail(reportId) {
  const modal = document.getElementById('report-detail-modal');
  const body  = document.getElementById('report-detail-body');
  body.innerHTML = '<div class="text-muted text-sm" style="padding:2rem;">Loading…</div>';
  modal.classList.add('open');
  const r = await api('GET', `/api/reports/${reportId}`);
  if (!r || r.error) {
    body.innerHTML = `<div class="alert alert-danger" style="margin:1rem;">${r?.error || 'Failed to load report.'}</div>`;
    return;
  }
  const date = (r.created_at || '').slice(0, 10);
  _reportPrintTitle = `Report - ${r.title}${date ? ' - ' + date : ''}`;
  const html = renderReportDetailHTML(r);
  body.innerHTML = html;
  document.getElementById('report-print-area').innerHTML = html;
}

function closeReportDetail() {
  document.getElementById('report-detail-modal').classList.remove('open');
}

function printReport() {
  document.getElementById('request-print-area').innerHTML = '';
  const prev = document.title;
  document.title = _reportPrintTitle;
  window.print();
  document.title = prev;
}

function renderReportDetailHTML(r) {
  const total = (r.leaders_count || 0) + (r.members_count || 0) + (r.guests_count || 0);
  const esc   = escHtml;
  const field = (label, val) => val
    ? `<div class="rpt-field-row"><span class="rpt-field-label">${label}</span><span class="rpt-field-value">${esc(String(val))}</span></div>`
    : '';
  const section = (title, content) =>
    `<div class="rpt-section"><div class="rpt-section-title">${title}</div>${content}</div>`;

  return `
  <div class="rpt-doc">
    <div class="rpt-header">
      <img src="assets/LSA-logo-header-compact.png" alt="LSA" class="rpt-logo" />
      <div class="rpt-header-text">
        <div class="rpt-org">Lebanese Scouts Association</div>
        <div class="rpt-doc-type">Activity Report</div>
      </div>
      <span class="badge ${STATUS_BADGE_RPT[r.status] || 'badge-neutral'} rpt-status-badge" style="text-transform:capitalize;">${r.status}</span>
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

    ${r.request_title ? section('Activity Details', `
      ${field('Activity', r.request_title)}
      ${field('Location', r.request_location)}
      ${r.request_start_date ? field('Date', fmtDate(r.request_start_date) + (r.request_end_date ? ' → ' + fmtDate(r.request_end_date) : '')) : ''}
    `) : ''}

    ${section('Participation', `
      <div class="rpt-participation-grid">
        <div class="rpt-stat"><div class="rpt-stat-val">${r.leaders_count ?? '—'}</div><div class="rpt-stat-label">Leaders</div></div>
        <div class="rpt-stat"><div class="rpt-stat-val">${r.members_count ?? '—'}</div><div class="rpt-stat-label">Members</div></div>
        <div class="rpt-stat"><div class="rpt-stat-val">${r.guests_count  ?? '—'}</div><div class="rpt-stat-label">Guests</div></div>
        <div class="rpt-stat"><div class="rpt-stat-val">${total || '—'}</div><div class="rpt-stat-label">Total</div></div>
      </div>
    `)}

    ${r.objectives ? section('Objectives', `<div class="rpt-body-text">${esc(r.objectives)}</div>`) : ''}

    ${section('What Happened', `<div class="rpt-body-text">${esc(r.body || '')}</div>`)}

    ${r.outcomes   ? section('Outcomes & Achievements', `<div class="rpt-body-text">${esc(r.outcomes)}</div>`)   : ''}
    ${r.challenges ? section('Challenges',              `<div class="rpt-body-text">${esc(r.challenges)}</div>`) : ''}

    ${section('Safety', `
      ${field('Incident reported', r.safety_incident ? 'Yes' : 'No')}
      ${r.safety_incident && r.safety_details ? `<div class="rpt-body-text" style="margin-top:0.4rem;color:#dc2626;">${esc(r.safety_details)}</div>` : ''}
    `)}

    ${r.budget_planned || r.budget_actual ? section('Budget', `
      ${field('Planned', r.budget_planned)}
      ${field('Actual',  r.budget_actual)}
    `) : ''}

    ${r.recommendations ? section('Recommendations', `<div class="rpt-body-text">${esc(r.recommendations)}</div>`) : ''}

    <div class="rpt-footer">
      <div class="rpt-sig-label">Submitted by</div>
      <div class="rpt-sig-name">${esc(r.submitter_name || '—')}</div>
      ${r.submitter_role_title ? `<div class="rpt-sig-role">${esc(r.submitter_role_title)}</div>` : ''}
      <div class="rpt-sig-date">Date: ${fmtDate(r.created_at)}</div>
    </div>
  </div>`;
}
