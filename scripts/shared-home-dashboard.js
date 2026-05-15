function renderHomeDashboard(opts) {
  const {
    displayName, groupName = '', roleTitle = 'Leader', colorLabel = '',
    sentRequests = [], sentReports = [],
    inboxRequests = [], inboxReports = [],
    groupUsers = [],
    showInbox = false, showPending = false, showGroup = false, showLeaderCount = false,
    showSubmissions = true, showSendButtons = true,
    summaryHtml = null,
    userColor = null,
  } = opts;

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 1. Welcome
  document.getElementById('home-greeting').textContent = `Welcome back, ${displayName}!`;
  document.getElementById('home-role-line').textContent =
    `${roleTitle}${colorLabel}${groupName ? ' · ' + groupName : ''}`;

  // 2. Stat counts
  const count = (arr, status) => arr.filter(x => x.status === status).length;
  const reqPending  = count(sentRequests, 'pending');
  const reqApproved = count(sentRequests, 'approved');
  const reqRejected = count(sentRequests, 'rejected');
  const rptPending  = count(sentReports,  'pending');
  const rptApproved = count(sentReports,  'approved');
  const rptRejected = count(sentReports,  'rejected');

  const memberCount = userColor
    ? groupUsers.filter(u => u.level === 'member' && u.color === userColor).length
    : groupUsers.filter(u => u.level === 'member').length;
  // The API excludes the current user from the list, so add 1 for themselves
  const leaderCount = groupUsers.filter(u => u.level !== 'member').length + 1;

  // Send buttons visibility
  const qaEl = document.getElementById('home-quick-actions');
  if (qaEl) qaEl.style.display = showSendButtons ? '' : 'none';

  // Summary box
  const summaryEl = document.getElementById('home-group-summary');
  if (summaryEl) {
    if (summaryHtml) {
      summaryEl.style.display = '';
      summaryEl.innerHTML = summaryHtml;
    } else if (showGroup) {
      summaryEl.style.display = '';
      summaryEl.innerHTML = `You have <strong>${leaderCount}</strong> leader${leaderCount !== 1 ? 's' : ''} in your group and you are currently managing <strong>${memberCount}</strong> member${memberCount !== 1 ? 's' : ''}.`;
    } else {
      summaryEl.style.display = 'none';
    }
  }

  const statsGrid = document.getElementById('home-stats-grid');
  statsGrid.innerHTML = `
    ${showPending ? `
    <div class="stat-card">
      <div class="stat-icon">⏳</div>
      <div class="stat-info">
        <div class="stat-value">${reqPending + rptPending}</div>
        <div class="stat-label">Pending Review</div>
      </div>
    </div>` : ''}
    ${showInbox ? `
    <div class="stat-card">
      <div class="stat-icon">📥</div>
      <div class="stat-info">
        <div class="stat-value">${inboxRequests.length + inboxReports.length}</div>
        <div class="stat-label">Needs Your Review</div>
      </div>
    </div>` : ''}
  `;
  statsGrid.style.display = statsGrid.childElementCount === 0 ? 'none' : '';

  // 3. My Submissions breakdown
  document.getElementById('home-submissions-body').innerHTML = `
    <div class="home-sub-table">
      <div class="home-sub-row home-sub-header">
        <span></span>
        <span class="badge badge-warning">Pending</span>
        <span class="badge badge-success">Approved</span>
        <span class="badge badge-danger">Rejected</span>
      </div>
      <div class="home-sub-row">
        <span class="font-semibold text-sm">Requests</span>
        <span class="text-sm">${reqPending}</span>
        <span class="text-sm">${reqApproved}</span>
        <span class="text-sm">${reqRejected}</span>
      </div>
      <div class="home-sub-row">
        <span class="font-semibold text-sm">Reports</span>
        <span class="text-sm">${rptPending}</span>
        <span class="text-sm">${rptApproved}</span>
        <span class="text-sm">${rptRejected}</span>
      </div>
    </div>
    <div style="margin-top:1rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
      <button class="btn btn-sm btn-secondary" onclick="showSection('tracker-requests', null)">View Request Tracker</button>
      <button class="btn btn-sm btn-secondary" onclick="showSection('tracker-reports', null)">View Report Tracker</button>
    </div>
  `;

  // Hide My Submissions card if not needed
  const submCard = document.getElementById('home-submissions-body')?.closest('.card');
  if (submCard) submCard.style.display = showSubmissions ? '' : 'none';

  // Collapse lower grid to single column when only one card is visible
  const lowerGrid = document.querySelector('#sec-home .home-lower-grid');
  if (lowerGrid) lowerGrid.style.gridTemplateColumns = (showInbox && showSubmissions) ? '' : '1fr';

  // 4. Inbox summary
  if (showInbox) {
    document.getElementById('home-inbox-card').style.display = '';
    const total = inboxRequests.length + inboxReports.length;
    document.getElementById('home-inbox-body').innerHTML = total === 0
      ? '<p class="text-muted text-sm">No items pending your review.</p>'
      : `
        <div class="home-sub-table">
          <div class="home-sub-row">
            <span class="font-semibold text-sm">Requests</span>
            <span class="badge badge-warning">${inboxRequests.length}</span>
          </div>
          <div class="home-sub-row">
            <span class="font-semibold text-sm">Reports</span>
            <span class="badge badge-warning">${inboxReports.length}</span>
          </div>
        </div>
        <div style="margin-top:1rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
          ${inboxRequests.length > 0 ? `<button class="btn btn-sm btn-primary" onclick="showSection('inbox-requests', null)">Review Requests</button>` : ''}
          ${inboxReports.length  > 0 ? `<button class="btn btn-sm btn-primary" onclick="showSection('inbox-reports', null)">Review Reports</button>` : ''}
        </div>
      `;
  }
}
