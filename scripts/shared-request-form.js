// ── Shared event request submission form ──────────────────────────────────────
// Used by: leader, gc, district dashboards.
//
// Depends on globals provided by the loading dashboard's script:
//   api(method, url, body)   — fetch wrapper
//   loadComms()              — reloads all comms data after submit
//
// The approval-level dropdown options (<select id="cr-approval-level">)
// are defined per-dashboard in each HTML file — this script never touches them
// beyond reading the selected value. clearCommsRequestForm() resets to the
// first option (selectedIndex = 0) so each dashboard keeps its own default.

function _flashRequestCard(type) {
  const card = document.getElementById('cr-alert')?.closest('.card');
  if (!card) return;
  card.classList.remove('card-flash-success', 'card-flash-error');
  void card.offsetWidth;
  card.classList.add(type === 'success' ? 'card-flash-success' : 'card-flash-error');
}

function setRequestDateToday() {
  document.getElementById('cr-date').value = new Date().toISOString().split('T')[0];
}

function toggleTransportDetails() {
  document.getElementById('cr-transport-details-group').style.display =
    document.getElementById('cr-transport').checked ? '' : 'none';
}

async function submitCommsRequest() {
  const title      = document.getElementById('cr-title').value.trim();
  const location   = document.getElementById('cr-location').value.trim();
  const start_date = document.getElementById('cr-date').value;
  const alertEl    = document.getElementById('cr-alert');

  if (!title || !location || !start_date) {
    alertEl.innerHTML = '<div class="alert alert-danger"><span class="alert-icon">❌</span> Title, location, and start date are required.</div>';
    _flashRequestCard('error');
    return;
  }

  const today    = new Date().toISOString().split('T')[0];
  const end_date = document.getElementById('cr-date-end').value;
  if (start_date < today) {
    alertEl.innerHTML = '<div class="alert alert-danger"><span class="alert-icon">❌</span> Start date cannot be in the past.</div>';
    _flashRequestCard('error');
    return;
  }
  if (end_date && end_date < start_date) {
    alertEl.innerHTML = '<div class="alert alert-danger"><span class="alert-icon">❌</span> End date cannot be before the start date.</div>';
    _flashRequestCard('error');
    return;
  }

  const transportNeeded = document.getElementById('cr-transport').checked;
  const res = await api('POST', '/api/events', {
    title,
    activity_type:    document.getElementById('cr-activity-type').value || null,
    description:      document.getElementById('cr-desc').value.trim() || null,
    location,
    start_date,
    start_time:       document.getElementById('cr-time-start').value || null,
    end_date:         document.getElementById('cr-date-end').value || null,
    end_time:         document.getElementById('cr-time-end').value || null,
    leaders_count:    parseInt(document.getElementById('cr-leaders-count').value) || null,
    members_count:    parseInt(document.getElementById('cr-members-count').value) || null,
    guests_count:     parseInt(document.getElementById('cr-guests-count').value)  || null,
    materials:        document.getElementById('cr-materials').value.trim() || null,
    transport_needed: transportNeeded,
    transport_details: transportNeeded ? (document.getElementById('cr-transport-details').value.trim() || null) : null,
    budget_estimated: document.getElementById('cr-budget').value.trim() || null,
    notes:            document.getElementById('cr-notes').value.trim() || null,
    required_approval_level: document.getElementById('cr-approval-level').value,
  });

  if (res && res.id) {
    alertEl.innerHTML = '';
    _flashRequestCard('success');
    toast('Request submitted.', 'success');
    clearCommsRequestForm();
    await loadComms();
  } else {
    _flashRequestCard('error');
    toast(res?.error || 'Error submitting.', 'danger');
  }
}

function clearCommsRequestForm() {
  ['cr-title', 'cr-desc', 'cr-date', 'cr-time-start', 'cr-date-end', 'cr-time-end',
   'cr-location', 'cr-leaders-count', 'cr-members-count', 'cr-guests-count',
   'cr-materials', 'cr-transport-details', 'cr-budget', 'cr-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('cr-activity-type').selectedIndex = 0;
  document.getElementById('cr-approval-level').selectedIndex = 0;
  document.getElementById('cr-transport').checked = false;
  document.getElementById('cr-transport-details-group').style.display = 'none';
}
