const ADMIN_LEVEL_PAGES = { district: 'district.html', gc: 'gc.html', ec: 'ec.html' };
const DASHBOARD_PAGES  = { member: 'member.html', leader: 'leader.html' };

function getDashboardPage(user) {
  if (user.dashboard === 'admin') {
    return ADMIN_LEVEL_PAGES[user.level] || 'admin.html';
  }
  return DASHBOARD_PAGES[user.dashboard] || 'index.html';
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-error');
  const username = document.getElementById('username').value.trim().toLowerCase();
  const password = document.getElementById('password').value;

  err.classList.remove('show');
  btn.classList.add('loading');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      btn.classList.remove('loading');
      document.getElementById('login-error-msg').textContent =
        data.error || 'Invalid username or password.';
      err.classList.add('show');
      return;
    }

    sessionStorage.setItem('lsa_token', data.token);
    sessionStorage.setItem('lsa_user', JSON.stringify(data.user));
    window.location.href = getDashboardPage(data.user);
  } catch (ex) {
    btn.classList.remove('loading');
    document.getElementById('login-error-msg').textContent =
      'Cannot reach server. Make sure the backend is running.';
    err.classList.add('show');
  }
}

function togglePw() {
  const pw = document.getElementById('password');
  const btn = document.getElementById('pw-toggle-btn');
  const isHidden = pw.type === 'password';
  pw.type = isHidden ? 'text' : 'password';
  btn.textContent = isHidden ? 'hide' : 'show';
}

// ── Credentials panel ──────────────────────────────────────────────────────
const DISTRICTS = [
  { name: 'Beirut',        prefix: 'bei' },
  { name: 'Bekaa',         prefix: 'bek' },
  { name: 'Mount Lebanon', prefix: 'mnt' },
  { name: 'South',         prefix: 'sth' },
];
const GROUPS = [
  { code: 'BEI-B1', label: 'B1',            dist: 0 },
  { code: 'BEI-B2', label: 'B2',            dist: 0 },
  { code: 'BEI-B3', label: 'B3',            dist: 0 },
  { code: 'BEI-B4', label: 'B4',            dist: 0 },
  { code: 'BEI-B7', label: 'B7',            dist: 0 },
  { code: 'BEK-Z1', label: 'Z1 (Zahlé)',    dist: 1 },
  { code: 'BEK-Z2', label: 'Z2',            dist: 1 },
  { code: 'BEK-Z3', label: 'Z3',            dist: 1 },
  { code: 'BEK-Z4', label: 'Z4',            dist: 1 },
  { code: 'BEK-Z5', label: 'Z5',            dist: 1 },
  { code: 'MNT-B1', label: 'B1 (Brumana)',  dist: 2 },
  { code: 'MNT-R1', label: 'R1 (Rabieh)',   dist: 2 },
  { code: 'MNT-A1', label: 'A1 (Aley)',     dist: 2 },
  { code: 'MNT-M1', label: 'M1 (Monsef)',   dist: 2 },
  { code: 'STH-S1', label: 'S1 (Saida)',    dist: 3 },
  { code: 'STH-S4', label: 'S4',            dist: 3 },
  { code: 'STH-S5', label: 'S5',            dist: 3 },
  { code: 'STH-S6', label: 'S6',            dist: 3 },
  { code: 'STH-H1', label: 'H1 (Hasbaya)',  dist: 3 },
];

const CREDS = {
  EC: [
    ['ec_honorary_president',  'Honorary President'],
    ['ec_president',           'President'],
    ['ec_vp_general_dev',      'VP of General Development'],
    ['ec_secretary',           'Secretary'],
    ['ec_treasurer',           'Treasurer'],
    ['ec_advisor',             'Advisor'],
    ['ec_assistant',           'Assistant'],
  ],
  GC: [
    ['gc_general_commissioner', 'General Commissioner'],
    ['gc_deputy_commissioner',  'Deputy General Commissioner'],
    ['gc_leadership_dev',       'Commissioner for Leadership Dev'],
    ['gc_admin',                'Administrative Commissioner'],
    ['gc_finance',              'Financial Commissioner'],
    ['gc_pr_media',             'Commissioner for PR & Media'],
    ['gc_music',                'Music Commissioner'],
    ['gc_pinks_commissioner',    'Commissioner for pinks'],
    ['gc_yellows_commissioner', 'Commissioner for Yellows'],
    ['gc_scouts_commissioner',  'Commissioner for Scouts/Guides'],
    ['gc_rovers_commissioner',  'Commissioner for Rovers/Pioneers'],
  ],
  District: DISTRICTS.flatMap(d => [
    [`${d.prefix}_commissioner`,   `${d.name} — Commissioner`],
    [`${d.prefix}_admin`,          `${d.name} — Admin`],
    [`${d.prefix}_music`,          `${d.name} — Music`],
    [`${d.prefix}_pr_media`,       `${d.name} — PR & Media`],
    [`${d.prefix}_finance`,        `${d.name} — Finance`],
    [`${d.prefix}_leadership_dev`, `${d.name} — Leadership Dev`],
    [`${d.prefix}_pinks`,           `${d.name} — pinks`],
    [`${d.prefix}_yellows`,        `${d.name} — Yellows`],
    [`${d.prefix}_scouts`,         `${d.name} — Scouts/Guides`],
    [`${d.prefix}_rovers`,         `${d.name} — Rovers/Pioneers`],
  ]),
  Group: GROUPS.flatMap(g => {
    const p = g.code.toLowerCase().replace('-', '_');
    const dist = DISTRICTS[g.dist].name;
    return [
      [`${p}_group_leader`,      `${dist} ${g.label} — Group Leader`],
      [`${p}_admin_leader`,      `${dist} ${g.label} — Admin Leader`],
      [`${p}_pinks_leader`,       `${dist} ${g.label} — pinks Leader`],
      [`${p}_yellow_leader`,     `${dist} ${g.label} — Yellow Leader`],
      [`${p}_boyscouts_leader`,  `${dist} ${g.label} — Boy Scouts Leader`],
      [`${p}_girlscouts_leader`, `${dist} ${g.label} — Girl Scouts Leader`],
      [`${p}_rovers_leader`,     `${dist} ${g.label} — Rovers Leader`],
      [`${p}_pioneers_leader`,   `${dist} ${g.label} — Pioneers Leader`],
    ];
  }),
};

let activeCredsTab = 'EC';

function toggleCreds() {
  const panel = document.getElementById('creds-panel');
  const arrow = document.getElementById('creds-arrow');
  const open = panel.style.display === 'none';
  panel.style.display = open ? '' : 'none';
  arrow.style.transform = open ? 'rotate(180deg)' : '';
  if (open && !document.getElementById('creds-tabs').children.length) renderCredsTabs();
}

function renderCredsTabs() {
  const tabs = document.getElementById('creds-tabs');
  tabs.innerHTML = Object.keys(CREDS).map(k => `
    <button onclick="switchCredsTab('${k}')" id="ctab-${k}"
      style="padding:0.25rem 0.65rem;border-radius:4px;border:1px solid var(--border-light);
             background:${k===activeCredsTab?'var(--primary)':'var(--surface-alt)'};
             color:${k===activeCredsTab?'#fff':'var(--text-secondary)'};
             cursor:pointer;font-size:0.75rem;font-weight:500;">
      ${k}
    </button>`).join('');
  renderCredsContent();
}

function switchCredsTab(tab) {
  activeCredsTab = tab;
  Object.keys(CREDS).forEach(k => {
    const btn = document.getElementById('ctab-' + k);
    if (!btn) return;
    btn.style.background = k === tab ? 'var(--primary)' : 'var(--surface-alt)';
    btn.style.color = k === tab ? '#fff' : 'var(--text-secondary)';
  });
  renderCredsContent();
}

function renderCredsContent() {
  const el = document.getElementById('creds-content');
  el.innerHTML = CREDS[activeCredsTab].map(([u, label]) => `
    <div onclick="fillCred('${u}')"
         style="display:flex;justify-content:space-between;align-items:center;
                padding:0.3rem 0.4rem;border-radius:4px;cursor:pointer;gap:1rem;"
         onmouseover="this.style.background='var(--primary-bg)'"
         onmouseout="this.style.background=''">
      <span style="color:var(--text-muted);font-size:0.77rem;">${label}</span>
      <code style="font-size:0.78rem;white-space:nowrap;">${u}</code>
    </div>`).join('');
}

function fillCred(username) {
  document.getElementById('username').value = username;
  document.getElementById('password').value = '123';
  toggleCreds();
}

// Redirect if already logged in
window.addEventListener('load', () => {
  const token = sessionStorage.getItem('lsa_token');
  const user  = JSON.parse(sessionStorage.getItem('lsa_user') || 'null');
  if (token && user) {
    window.location.href = getDashboardPage(user);
  }
});
