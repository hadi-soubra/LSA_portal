import sqlite3
import hashlib
from pathlib import Path

DB_PATH = Path(__file__).parent / 'lsa.db'


def get_db_path():
    return str(DB_PATH)


def hash_password(pw):
    return hashlib.sha256(pw.encode()).hexdigest()


SCHEMA = """
CREATE TABLE IF NOT EXISTS districts (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    code        TEXT NOT NULL UNIQUE,
    district_id INTEGER NOT NULL REFERENCES districts(id)
);

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    dashboard     TEXT NOT NULL CHECK(dashboard IN ('member','leader','admin')),
    color         TEXT CHECK(color IN ('pink','yellow','green','red') OR color IS NULL),
    level         TEXT NOT NULL CHECK(level IN ('member','group_admin','group','district','gc','ec')),
    role_title    TEXT,
    group_id      INTEGER REFERENCES groups(id),
    district_id   INTEGER REFERENCES districts(id),
    is_functional INTEGER NOT NULL DEFAULT 0,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_requests (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    title                  TEXT NOT NULL,
    description            TEXT,
    location               TEXT,
    start_date             TEXT,
    end_date               TEXT,
    participants           INTEGER,
    materials              TEXT,
    notes                  TEXT,
    submitted_by           INTEGER NOT NULL REFERENCES users(id),
    required_approval_level TEXT NOT NULL CHECK(required_approval_level IN ('group','district','gc','ec')),
    current_level          TEXT NOT NULL CHECK(current_level IN ('group_admin','group','district','gc','ec')),
    status                 TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    created_at             DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at             DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_request_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL REFERENCES event_requests(id),
    action     TEXT NOT NULL,
    actor_id   INTEGER NOT NULL REFERENCES users(id),
    note       TEXT,
    acted_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS content (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    title                TEXT NOT NULL,
    body                 TEXT,
    content_type         TEXT NOT NULL CHECK(content_type IN ('activity','resource','training','notification')),
    sent_by              INTEGER NOT NULL REFERENCES users(id),
    target_colors        TEXT,
    target_recipient_type TEXT NOT NULL CHECK(target_recipient_type IN ('leaders','members','both')),
    target_district_ids  TEXT,
    target_group_ids     TEXT,
    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    title                   TEXT NOT NULL,
    body                    TEXT NOT NULL,
    submitted_by            INTEGER NOT NULL REFERENCES users(id),
    request_id              INTEGER REFERENCES event_requests(id),
    required_approval_level TEXT NOT NULL CHECK(required_approval_level IN ('group','district','gc','ec')),
    current_level           TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS report_history (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id         INTEGER NOT NULL REFERENCES reports(id),
    action            TEXT NOT NULL,
    actor_id          INTEGER NOT NULL REFERENCES users(id),
    forwarded_to_level TEXT,
    note              TEXT,
    acted_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);
"""

# ── Seed data constants ────────────────────────────────────────────────────────

_PW = hash_password('123')

# (district_name, username_prefix, district_id_order)
DISTRICTS = [
    ('Beirut',         'bei', 1),
    ('Bekaa',          'bek', 2),
    ('Mount Lebanon',  'mnt', 3),
    ('South',          'sth', 4),
]

# (code, display_name, district_index 0-based, group_id_order)
GROUPS = [
    # Beirut (district 1)
    ('BEI-B1', 'B1',           0,  1),
    ('BEI-B2', 'B2',           0,  2),
    ('BEI-B3', 'B3',           0,  3),
    ('BEI-B4', 'B4',           0,  4),
    ('BEI-B7', 'B7',           0,  5),
    # Bekaa (district 2)
    ('BEK-Z1', 'Z1 (Zahlé)',   1,  6),
    ('BEK-Z2', 'Z2',           1,  7),
    ('BEK-Z3', 'Z3',           1,  8),
    ('BEK-Z4', 'Z4',           1,  9),
    ('BEK-Z5', 'Z5',           1, 10),
    # Mount Lebanon (district 3)
    ('MNT-B1', 'B1 (Brumana)', 2, 11),
    ('MNT-R1', 'R1 (Rabieh)',  2, 12),
    ('MNT-A1', 'A1 (Aley)',    2, 13),
    ('MNT-M1', 'M1 (Monsef)',  2, 14),
    # South (district 4)
    ('STH-S1', 'S1 (Saida)',   3, 15),
    ('STH-S4', 'S4',           3, 16),
    ('STH-S5', 'S5',           3, 17),
    ('STH-S6', 'S6',           3, 18),
    ('STH-H1', 'H1 (Hasbaya)', 3, 19),
]

INSERT_USER = '''INSERT INTO users
    (name,email,username,password_hash,dashboard,color,level,
     role_title,group_id,district_id,is_functional)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)'''


def _u(name, username, dashboard, color, level, role_title,
        group_id=None, district_id=None, is_functional=0):
    return (name, None, username, _PW, dashboard, color, level,
            role_title, group_id, district_id, is_functional)


def _build_users():
    users = []

    # ── EC (7) ────────────────────────────────────────────────────────────────
    ec_roles = [
        ('ec_honorary_president',  'Honorary President'),
        ('ec_president',           'President'),
        ('ec_vp_general_dev',      'Vice President of General Development'),
        ('ec_secretary',           'Secretary'),
        ('ec_treasurer',           'Treasurer'),
        ('ec_advisor',             'Advisor'),
        ('ec_assistant',           'Assistant'),
    ]
    for username, role in ec_roles:
        name = 'EC ' + role
        users.append(_u(name, username, 'admin', None, 'ec', role,
                        is_functional=1))

    # ── GC Functional (7) ─────────────────────────────────────────────────────
    # is_functional=0 → management head/admin; 1 → support/functional role
    gc_func = [
        ('gc_general_commissioner', 'General Commissioner',                        0),
        ('gc_deputy_commissioner',  'Deputy General Commissioner',                 0),
        ('gc_admin',                'Administrative Commissioner',                 0),
        ('gc_leadership_dev',       'Commissioner for Leadership Development',      1),
        ('gc_finance',              'Financial Commissioner',                       1),
        ('gc_pr_media',             'Commissioner for PR & Media',                  1),
        ('gc_music',                'Music Commissioner',                           1),
    ]
    for username, role, is_func in gc_func:
        users.append(_u('GC ' + role, username, 'admin', None, 'gc', role,
                        is_functional=is_func))

    # ── GC Color (4) ──────────────────────────────────────────────────────────
    gc_color = [
        ('gc_cubs_commissioner',    'Commissioner for Cubs Branch',          'pink'),
        ('gc_yellows_commissioner', 'Commissioner for Yellows Branch',       'yellow'),
        ('gc_scouts_commissioner',  'Commissioner for Scouts/Guides Branch', 'green'),
        ('gc_rovers_commissioner',  'Commissioner for Rovers/Rangers Branch','red'),
    ]
    for username, role, color in gc_color:
        users.append(_u('GC ' + role.split(' for ')[1],
                        username, 'admin', color, 'gc', role))

    # ── District users (10 per district × 4) ─────────────────────────────────
    dist_func_roles = [
        ('commissioner',   'District Commissioner',                       None, 0),
        ('admin',          'District Assistant for Administration',        None, 0),
        ('music',          'District Assistant for Music',                 None, 1),
        ('pr_media',       'District Assistant for PR & Media',            None, 1),
        ('finance',        'District Assistant for Finance',               None, 1),
        ('leadership_dev', 'District Assistant for Leadership Development', None, 1),
    ]
    dist_color_roles = [
        ('cubs',   'District Assistant for Cubs',           'pink'),
        ('yellows','District Assistant for Yellows',        'yellow'),
        ('scouts', 'District Assistant for Scouts/Guides',  'green'),
        ('rovers', 'District Assistant for Rovers/Rangers', 'red'),
    ]

    for dist_name, prefix, dist_id in DISTRICTS:
        for suffix, role, color, is_func in dist_func_roles:
            username = f'{prefix}_{suffix}'
            name     = f'{dist_name} {role.replace("District ", "")}'
            users.append(_u(name, username, 'admin', color, 'district', role,
                            district_id=dist_id, is_functional=is_func))
        for suffix, role, color in dist_color_roles:
            username = f'{prefix}_{suffix}'
            name     = f'{dist_name} {role.replace("District ", "")}'
            users.append(_u(name, username, 'admin', color, 'district', role,
                            district_id=dist_id))

    # ── Group users (6 per group × 19) ───────────────────────────────────────
    # (suffix, role_title, color, dashboard, level)
    grp_roles = [
        ('group_leader',      'Group Leader',            None,     'leader', 'group'),
        ('admin_leader',      'Administrative Leader',   None,     'leader', 'group_admin'),
        ('cubs_leader',       'Cubs Leader',             'pink',   'leader', 'group'),
        ('yellow_leader',     'Yellow Unit Leader',      'yellow', 'leader', 'group'),
        ('boyscouts_leader',  'Boy Scouts Troop Leader', 'green',  'leader', 'group'),
        ('girlscouts_leader', 'Girl Scouts Troop Leader','green',  'leader', 'group'),
        ('rovers_leader',     'Rovers Crew Leader',      'red',    'leader', 'group'),
        ('pioneers_leader',   'Pioneers Crew Leader',    'red',    'leader', 'group'),
    ]

    for code, display, dist_idx, grp_id in GROUPS:
        dist_name, prefix, dist_id = DISTRICTS[dist_idx]
        # derive group username prefix: lower-case code without hyphen
        grp_prefix = code.lower().replace('-', '_')
        for suffix, role, color, dashboard, level in grp_roles:
            username = f'{grp_prefix}_{suffix}'
            name     = f'{code} {role}'
            users.append(_u(name, username, dashboard, color, level, role,
                            group_id=grp_id, district_id=dist_id))

    return users


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)

    if conn.execute('SELECT COUNT(*) FROM users').fetchone()[0] > 0:
        conn.close()
        return

    # ── Districts ─────────────────────────────────────────────────────────────
    conn.executemany('INSERT INTO districts (name) VALUES (?)', [
        ('Beirut',), ('Bekaa',), ('Mount Lebanon',), ('South',),
    ])

    # ── Groups ────────────────────────────────────────────────────────────────
    conn.executemany(
        'INSERT INTO groups (name, code, district_id) VALUES (?,?,?)',
        [(display, code, DISTRICTS[dist_idx][2])
         for code, display, dist_idx, _ in GROUPS]
    )

    # ── Users (172) ───────────────────────────────────────────────────────────
    for u in _build_users():
        conn.execute(INSERT_USER, u)

    conn.commit()
    conn.close()
    print('Database initialized: 210 users seeded.')


def migrate_db():
    """Fix is_functional for management roles incorrectly seeded as functional."""
    conn = sqlite3.connect(DB_PATH)
    mgmt_usernames = (
        # District heads/admins
        [f'{prefix}_commissioner' for _, prefix, _ in DISTRICTS] +
        [f'{prefix}_admin'        for _, prefix, _ in DISTRICTS] +
        # GC heads/admins
        ['gc_general_commissioner', 'gc_deputy_commissioner', 'gc_admin']
    )
    for username in mgmt_usernames:
        conn.execute('UPDATE users SET is_functional=0 WHERE username=?', (username,))
    conn.commit()
    conn.close()


if __name__ == '__main__':
    init_db()
    migrate_db()
