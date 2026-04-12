"""
LSA Scout Portal — Flask backend
Run:  python backend/server.py
"""

import json
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

import jwt
from flask import Flask, g, jsonify, request, send_from_directory
from flask_cors import CORS

from db import get_db_path, hash_password, init_db, migrate_db

# ── App setup ─────────────────────────────────────────────────────────────────

STATIC_DIR = str(Path(__file__).parent.parent)
SECRET_KEY = 'lsa-portal-secret-key-2024-scouts-lebanon'

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path='')
CORS(app)

# ── DB helpers ────────────────────────────────────────────────────────────────

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(get_db_path())
        g.db.row_factory = sqlite3.Row
        g.db.execute('PRAGMA foreign_keys = ON')
    return g.db


@app.teardown_appcontext
def close_db(e=None):
    db = g.pop('db', None)
    if db:
        db.close()

# ── Auth helpers ──────────────────────────────────────────────────────────────

def make_token(user_id):
    payload = {
        'user_id': user_id,
        'exp': datetime.now(tz=timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm='HS256')


def require_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        raw = request.headers.get('Authorization', '')
        if not raw.startswith('Bearer '):
            return jsonify({'error': 'Unauthorized'}), 401
        token = raw[7:]
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        except jwt.PyJWTError:
            return jsonify({'error': 'Invalid or expired token'}), 401
        user = get_db().execute('SELECT * FROM users WHERE id=?',
                                (payload['user_id'],)).fetchone()
        if not user:
            return jsonify({'error': 'User not found'}), 401
        g.user = dict(user)
        return f(*args, **kwargs)
    return wrapper


def _enrich_user(user: dict, db) -> dict:
    """Attach district_name, group_name, group_code to a user dict."""
    if user.get('district_id'):
        row = db.execute('SELECT name FROM districts WHERE id=?',
                         (user['district_id'],)).fetchone()
        user['district_name'] = row['name'] if row else None
    if user.get('group_id'):
        row = db.execute('SELECT name, code FROM groups WHERE id=?',
                         (user['group_id'],)).fetchone()
        user['group_name'] = row['name'] if row else None
        user['group_code'] = row['code'] if row else None
    return user

# ── Role helpers ──────────────────────────────────────────────────────────────

def _is_group_leader(actor: dict) -> bool:
    """No-color group leader (Group Leader / Admin Leader)."""
    return (actor['dashboard'] == 'leader'
            and actor['level'] == 'group'
            and not actor['color'])


def _is_any_group_leader(actor: dict) -> bool:
    """Any group-level leader (with or without color, includes group_admin)."""
    return actor['dashboard'] == 'leader' and actor['level'] in ('group', 'group_admin')


def _can_submit(actor: dict) -> bool:
    """Can this user submit events and reports?"""
    return actor['dashboard'] == 'leader' or actor['level'] in ('district', 'gc')


def _submit_start_level(actor: dict) -> str:
    """Level at which an event request by this actor starts.
    Always one level above the submitter — no self-approval ever."""
    # Colored group leaders: _next_level('group') would skip to district,
    # so they must explicitly start at group_admin first.
    if actor['level'] == 'group' and actor.get('color'):
        return 'group_admin'
    # Everyone else: skip their own level entirely.
    return _next_level(actor['level'])


def _report_start_level(actor: dict) -> str:
    """Level at which a report submission starts.
    Uses the same forwarding chain as event requests."""
    if actor['dashboard'] == 'leader':
        return _submit_start_level(actor)
    return _next_level(actor['level'])

# ── Business-logic constants ─────────────────────────────────────────────────

LEVEL_ORDER = ['member', 'group_admin', 'group', 'district', 'gc', 'ec']


def _next_level(current: str) -> str | None:
    idx = LEVEL_ORDER.index(current)
    return LEVEL_ORDER[idx + 1] if idx + 1 < len(LEVEL_ORDER) else None

# ── Scope helpers ─────────────────────────────────────────────────────────────

_USER_BASE = '''SELECT u.*, d.name AS district_name,
                       g.code AS group_code, g.name AS group_name
                FROM users u
                LEFT JOIN districts d ON u.district_id = d.id
                LEFT JOIN groups g    ON u.group_id    = g.id'''


def _pack_users(rows, editable: bool) -> list[dict]:
    out = []
    for r in rows:
        d = dict(r)
        d.pop('password_hash', None)
        d['editable'] = editable
        out.append(d)
    return out


def _users_in_scope(actor: dict, db) -> list[dict]:
    """
    Users visible to actor, with per-user 'editable' flag.

    Edit ownership rules:
      Members             → group head/admin only
      Group leaders       → group head/admin only
      Group head/admin    → district head/admin only
      District leaders    → district head/admin only
      District head/admin → GC head/admin only
      GC leaders          → GC head/admin only
      GC head/admin       → EC only
      EC                  → outside UI
    """
    lvl     = actor['level']
    color   = actor['color']
    is_func = bool(actor.get('is_functional', 0))

    # ── Group-level leaders (dashboard='leader') ──────────────────────────────
    if actor['dashboard'] == 'leader':
        if color:
            # Colored group leader: view-only, same-color members in own group
            rows = db.execute(
                _USER_BASE + " WHERE u.group_id=? AND u.level='member' AND u.color=?",
                (actor['group_id'], color)).fetchall()
            return _pack_users(rows, False)
        # Group head (level='group', no color) or group admin (level='group_admin'):
        # view + edit everyone in group
        rows = db.execute(
            _USER_BASE + " WHERE u.group_id=? AND u.level IN ('group','group_admin','member') AND u.id!=?",
            (actor['group_id'], actor['id'])).fetchall()
        return _pack_users(rows, True)

    # ── District-level admins ─────────────────────────────────────────────────
    if lvl == 'district':
        if color:
            # Colored district: view-only, same-color users in district
            rows = db.execute(
                _USER_BASE + " WHERE u.district_id=? AND u.color=? AND u.id!=?",
                (actor['district_id'], color, actor['id'])).fetchall()
            return _pack_users(rows, False)
        if is_func:
            # Functional district (music/PR/finance/etc): no user management
            return []
        # District head/admin (is_functional=0, no color):
        #   editable → group heads (group, no color), group admins, district leaders (colored or functional)
        #   view-only → other district heads/admins, colored group leaders, members
        rows = db.execute(
            _USER_BASE + " WHERE u.district_id=? AND u.id!=?",
            (actor['district_id'], actor['id'])).fetchall()
        result = []
        for r in rows:
            u = dict(r); u.pop('password_hash', None)
            u['editable'] = (
                (u['level'] == 'group' and not u['color']) or              # group head
                u['level'] == 'group_admin' or                              # group admin
                (u['level'] == 'district' and (u['color'] or u['is_functional']))  # district leaders only
            )
            result.append(u)
        return result

    # ── GC-level admins ───────────────────────────────────────────────────────
    if lvl == 'gc':
        if color:
            # Colored GC: view-only, same-color users council-wide
            rows = db.execute(
                _USER_BASE + " WHERE u.color=? AND u.id!=?",
                (color, actor['id'])).fetchall()
            return _pack_users(rows, False)
        if is_func:
            # Functional GC (music/PR/finance/etc): no user management
            return []
        # GC head/admin (is_functional=0, no color):
        #   editable → GC leaders (colored or functional), district heads/admins
        #   view-only → other GC heads/admins, colored/functional district leaders, group level, members
        #   not visible → EC users
        rows = db.execute(
            _USER_BASE + " WHERE u.id!=? AND u.level!='ec'", (actor['id'],)).fetchall()
        result = []
        for r in rows:
            u = dict(r); u.pop('password_hash', None)
            u['editable'] = (
                (u['level'] == 'gc' and (u['color'] or u['is_functional'])) or     # GC leaders only
                (u['level'] == 'district' and not u['color'] and not u['is_functional'])  # district heads
            )
            result.append(u)
        return result

    # ── EC-level admins ───────────────────────────────────────────────────────
    if lvl == 'ec':
        # All EC users see everyone; only GC heads/admins are editable
        rows = db.execute(_USER_BASE + " WHERE u.id!=?", (actor['id'],)).fetchall()
        result = []
        for r in rows:
            u = dict(r); u.pop('password_hash', None)
            u['editable'] = (
                u['level'] == 'gc' and not u['color'] and not u['is_functional']
            )
            result.append(u)
        return result

    return []


def _events_in_scope(actor: dict, db) -> list[dict]:
    """Event requests visible to actor."""
    lvl = actor['level']
    color = actor['color']

    # Leader-dashboard users see their own submissions
    if actor['dashboard'] == 'leader':
        own = db.execute(
            '''SELECT r.*, u.name AS submitter_name, u.color AS submitter_color
               FROM event_requests r
               JOIN users u ON r.submitted_by = u.id
               WHERE r.submitted_by = ?
               ORDER BY r.created_at DESC''',
            (actor['id'],)).fetchall()
        result = [dict(r) for r in own]

        # No-color group leaders also see requests pending their review
        if actor['level'] == 'group_admin' and not actor['color']:
            review = db.execute(
                '''SELECT r.*, u.name AS submitter_name, u.color AS submitter_color
                   FROM event_requests r
                   JOIN users u ON r.submitted_by = u.id
                   WHERE r.current_level = 'group_admin' AND r.status = 'pending'
                     AND u.group_id = ? AND r.submitted_by != ?
                   ORDER BY r.created_at DESC''',
                (actor['group_id'], actor['id'])).fetchall()
            for r in review:
                d = dict(r)
                d['pending_my_review'] = True
                result.append(d)
        elif actor['level'] == 'group' and not actor['color']:
            review = db.execute(
                '''SELECT r.*, u.name AS submitter_name, u.color AS submitter_color
                   FROM event_requests r
                   JOIN users u ON r.submitted_by = u.id
                   WHERE r.current_level = 'group' AND r.status = 'pending'
                     AND u.group_id = ? AND r.submitted_by != ?
                   ORDER BY r.created_at DESC''',
                (actor['group_id'], actor['id'])).fetchall()
            for r in review:
                d = dict(r)
                d['pending_my_review'] = True
                result.append(d)

        return result

    # Admin users: review queue at their level
    review_rows = []
    if lvl == 'group':
        review_rows = db.execute(
            '''SELECT r.*, u.name AS submitter_name, u.color AS submitter_color
               FROM event_requests r
               JOIN users u ON r.submitted_by = u.id
               WHERE r.current_level = 'group' AND u.group_id = ?
               ORDER BY r.created_at DESC''',
            (actor['group_id'],)).fetchall()

    elif lvl == 'district':
        review_rows = db.execute(
            '''SELECT r.*, u.name AS submitter_name, u.color AS submitter_color
               FROM event_requests r
               JOIN users u ON r.submitted_by = u.id
               WHERE r.current_level = 'district' AND u.district_id = ?
               ORDER BY r.created_at DESC''',
            (actor['district_id'],)).fetchall()
        if color:
            review_rows = [r for r in review_rows
                           if not r['submitter_color'] or r['submitter_color'] == color]

    elif lvl == 'gc':
        review_rows = db.execute(
            '''SELECT r.*, u.name AS submitter_name, u.color AS submitter_color
               FROM event_requests r
               JOIN users u ON r.submitted_by = u.id
               WHERE r.current_level = 'gc'
               ORDER BY r.created_at DESC''').fetchall()
        if color:
            review_rows = [r for r in review_rows
                           if not r['submitter_color'] or r['submitter_color'] == color]

    elif lvl == 'ec':
        review_rows = db.execute(
            '''SELECT r.*, u.name AS submitter_name, u.color AS submitter_color
               FROM event_requests r
               JOIN users u ON r.submitted_by = u.id
               WHERE r.current_level = 'ec'
               ORDER BY r.created_at DESC''').fetchall()

    result = [dict(r) for r in review_rows]

    # District/GC admins who can submit also see their own submissions
    if lvl in ('district', 'gc'):
        review_ids = {r['id'] for r in result}
        own = db.execute(
            '''SELECT r.*, u.name AS submitter_name, u.color AS submitter_color
               FROM event_requests r
               JOIN users u ON r.submitted_by = u.id
               WHERE r.submitted_by = ?
               ORDER BY r.created_at DESC''',
            (actor['id'],)).fetchall()
        for r in own:
            if r['id'] not in review_ids:
                result.append(dict(r))

    return result


_RPT_SELECT = '''
    SELECT r.*,
           u.name  AS submitter_name,
           u.color AS submitter_color,
           e.title AS request_title,
           g.name  AS submitter_group,
           d.name  AS submitter_district
    FROM reports r
    JOIN users u ON r.submitted_by = u.id
    LEFT JOIN event_requests e ON r.request_id = e.id
    LEFT JOIN groups    g ON u.group_id    = g.id
    LEFT JOIN districts d ON u.district_id = d.id
'''

def _reports_in_scope(actor: dict, db) -> list[dict]:
    """Reports visible to actor."""
    lvl = actor['level']

    if actor['dashboard'] == 'leader':
        own_rows = db.execute(
            _RPT_SELECT + ' WHERE r.submitted_by = ? ORDER BY r.created_at DESC',
            (actor['id'],)).fetchall()
        result = [dict(r) for r in own_rows]

        # group_admin (no color) sees reports pending at group_admin level from their group
        if lvl == 'group_admin' and not actor.get('color'):
            review = db.execute(
                _RPT_SELECT + " WHERE r.current_level='group_admin' AND r.status='pending'"
                              " AND u.group_id=? AND r.submitted_by!=?"
                              " ORDER BY r.created_at DESC",
                (actor['group_id'], actor['id'])).fetchall()
            for r in review:
                d = dict(r)
                d['pending_my_review'] = True
                result.append(d)
        # no-color group leader sees reports pending at group level from their group
        elif lvl == 'group' and not actor.get('color'):
            review = db.execute(
                _RPT_SELECT + " WHERE r.current_level='group' AND r.status='pending'"
                              " AND u.group_id=? AND r.submitted_by!=?"
                              " ORDER BY r.created_at DESC",
                (actor['group_id'], actor['id'])).fetchall()
            for r in review:
                d = dict(r)
                d['pending_my_review'] = True
                result.append(d)

        return result

    # Admin review queue — pending reports at actor's level
    review_rows = []
    if lvl == 'group':
        review_rows = db.execute(
            _RPT_SELECT + " WHERE r.current_level='group' AND u.group_id=? ORDER BY r.created_at DESC",
            (actor['group_id'],)).fetchall()

    elif lvl == 'district':
        review_rows = db.execute(
            _RPT_SELECT + " WHERE r.current_level='district' AND u.district_id=? ORDER BY r.created_at DESC",
            (actor['district_id'],)).fetchall()

    elif lvl == 'gc':
        review_rows = db.execute(
            _RPT_SELECT + " WHERE r.current_level='gc' ORDER BY r.created_at DESC").fetchall()

    elif lvl == 'ec':
        review_rows = db.execute(
            _RPT_SELECT + " WHERE r.current_level='ec' ORDER BY r.created_at DESC").fetchall()

    result = [dict(r) for r in review_rows]

    # District/GC admins who can submit also see their own submissions
    if lvl in ('district', 'gc'):
        review_ids = {r['id'] for r in result}
        own = db.execute(
            _RPT_SELECT + ' WHERE r.submitted_by = ? ORDER BY r.created_at DESC',
            (actor['id'],)).fetchall()
        for r in own:
            if r['id'] not in review_ids:
                result.append(dict(r))

    return result


# ── Static file serving ───────────────────────────────────────────────────────

@app.route('/')
def serve_index():
    return send_from_directory(STATIC_DIR, 'index.html')


@app.route('/<path:filename>')
def serve_static(filename):
    if filename.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404
    return send_from_directory(STATIC_DIR, filename)

# ── AUTH ──────────────────────────────────────────────────────────────────────

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    username = data.get('username', '').strip().lower()
    password = data.get('password', '')

    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400

    db = get_db()
    user = db.execute('SELECT * FROM users WHERE username=?', (username,)).fetchone()

    if not user or user['password_hash'] != hash_password(password):
        return jsonify({'error': 'Invalid username or password'}), 401

    token = make_token(user['id'])
    u = _enrich_user(dict(user), db)
    u.pop('password_hash', None)
    return jsonify({'token': token, 'user': u})


@app.route('/api/auth/me')
@require_auth
def me():
    db = get_db()
    u = _enrich_user(dict(g.user), db)
    u.pop('password_hash', None)
    return jsonify(u)

# ── STATS ─────────────────────────────────────────────────────────────────────

@app.route('/api/stats')
@require_auth
def get_stats():
    db = get_db()
    actor = g.user
    stats = {}

    if actor['dashboard'] == 'member':
        stats = {}

    elif actor['dashboard'] == 'leader':
        evts = _events_in_scope(actor, db)
        rpts = _reports_in_scope(actor, db)
        stats = {
            'pending_requests': len([e for e in evts if e['status'] == 'pending']),
            'approved_events':  len([e for e in evts if e['status'] == 'approved']),
            'submitted_reports': len(rpts),
        }

    elif actor['dashboard'] == 'admin':
        all_evts = _events_in_scope(actor, db)
        all_rpts = _reports_in_scope(actor, db)
        managed  = _users_in_scope(actor, db)

        # Separate review queue from own submissions (for district/gc who can submit)
        own_id = actor['id']
        review_evts = [e for e in all_evts if e.get('submitted_by') != own_id]
        own_evts    = [e for e in all_evts if e.get('submitted_by') == own_id]
        review_rpts = [r for r in all_rpts if r.get('submitted_by') != own_id]
        own_rpts    = [r for r in all_rpts if r.get('submitted_by') == own_id]

        stats = {
            'pending_requests':    len([e for e in review_evts if e['status'] == 'pending']),
            'total_managed_users': len([u for u in managed if u.get('editable')]),
            'pending_reports':     len([r for r in review_rpts if r['status'] == 'pending']),
        }

        if actor['level'] == 'district':
            total = db.execute(
                'SELECT COUNT(*) FROM users WHERE district_id=?',
                (actor['district_id'],)).fetchone()[0]
            stats['users_in_district'] = total

        # Extra stats for district/gc who can also submit
        if actor['level'] in ('district', 'gc'):
            stats['my_pending_events']   = len([e for e in own_evts if e['status'] == 'pending'])
            stats['my_approved_events']  = len([e for e in own_evts if e['status'] == 'approved'])
            stats['my_submitted_reports'] = len(own_rpts)

    return jsonify(stats)

# ── USERS ─────────────────────────────────────────────────────────────────────

@app.route('/api/users', methods=['GET'])
@require_auth
def list_users():
    actor = g.user
    if actor['dashboard'] != 'admin' and not _is_any_group_leader(actor):
        return jsonify({'error': 'Forbidden'}), 403
    return jsonify(_users_in_scope(actor, get_db()))


@app.route('/api/users', methods=['POST'])
@require_auth
def create_user():
    actor = g.user
    is_group_lvl = _is_any_group_leader(actor)

    if actor['dashboard'] != 'admin' and not is_group_lvl:
        return jsonify({'error': 'Forbidden'}), 403

    data = request.get_json() or {}

    # ── Group-leader path: can only add member-level users to their own group ──
    if is_group_lvl:
        for field in ('name', 'username', 'password'):
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400

        new_color = data.get('color') or None
        if actor['color'] and new_color and actor['color'] != new_color:
            return jsonify({'error': 'Color silo violation'}), 403

        db = get_db()
        try:
            db.execute(
                '''INSERT INTO users
                   (name,email,username,password_hash,dashboard,color,level,
                    role_title,group_id,district_id,is_functional)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
                (data['name'], data.get('email'), data['username'],
                 hash_password(data['password']), 'member',
                 new_color, 'member', data.get('role_title'),
                 actor['group_id'], actor['district_id'], 0))
            db.commit()
            new_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]
            u = dict(db.execute('SELECT * FROM users WHERE id=?', (new_id,)).fetchone())
            u.pop('password_hash')
            return jsonify(u), 201
        except sqlite3.IntegrityError as exc:
            return jsonify({'error': str(exc)}), 409

    # ── Admin path ────────────────────────────────────────────────────────────
    for field in ('name', 'username', 'password', 'dashboard', 'level'):
        if not data.get(field):
            return jsonify({'error': f'{field} is required'}), 400

    target_level = data['level']
    allowed = {
        'ec':       ('gc',),
        'gc':       ('district',),
        'district': ('group', 'member'),
    }
    if target_level not in allowed.get(actor['level'], ()):
        return jsonify({'error': f'You cannot create users at level "{target_level}"'}), 403

    new_color = data.get('color')
    if actor['color'] and new_color and actor['color'] != new_color:
        return jsonify({'error': 'Color silo violation'}), 403

    db = get_db()
    try:
        db.execute(
            '''INSERT INTO users
               (name,email,username,password_hash,dashboard,color,level,
                role_title,group_id,district_id,is_functional)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
            (data['name'], data.get('email'), data['username'],
             hash_password(data['password']), data['dashboard'],
             new_color or None, target_level, data.get('role_title'),
             data.get('group_id'), data.get('district_id'),
             int(data.get('is_functional', 0))))
        db.commit()
        new_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]
        u = dict(db.execute('SELECT * FROM users WHERE id=?', (new_id,)).fetchone())
        u.pop('password_hash')
        return jsonify(u), 201
    except sqlite3.IntegrityError as exc:
        return jsonify({'error': str(exc)}), 409


@app.route('/api/users/<int:user_id>', methods=['PUT'])
@require_auth
def update_user(user_id):
    actor = g.user
    if actor['dashboard'] != 'admin' and not _is_any_group_leader(actor):
        return jsonify({'error': 'Forbidden'}), 403

    db = get_db()
    target = db.execute('SELECT * FROM users WHERE id=?', (user_id,)).fetchone()
    if not target:
        return jsonify({'error': 'User not found'}), 404
    target = dict(target)

    # Use _users_in_scope to check permission (editable flag)
    in_scope = _users_in_scope(actor, db)
    entry = next((u for u in in_scope if u['id'] == user_id), None)
    if not entry or not entry.get('editable'):
        return jsonify({'error': 'Forbidden'}), 403

    data = request.get_json() or {}
    updates = {k: data[k] for k in ('name', 'email', 'role_title', 'group_id', 'district_id')
               if k in data}
    if data.get('password'):
        updates['password_hash'] = hash_password(data['password'])

    if not updates:
        return jsonify({'error': 'No updates provided'}), 400

    set_clause = ', '.join(f'{k}=?' for k in updates)
    db.execute(f'UPDATE users SET {set_clause} WHERE id=?',
               list(updates.values()) + [user_id])
    db.commit()

    u = dict(db.execute('SELECT * FROM users WHERE id=?', (user_id,)).fetchone())
    u.pop('password_hash')
    return jsonify(u)


@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@require_auth
def delete_user(user_id):
    actor = g.user
    if not _is_any_group_leader(actor):
        return jsonify({'error': 'Forbidden'}), 403

    db = get_db()
    target = db.execute('SELECT * FROM users WHERE id=?', (user_id,)).fetchone()
    if not target:
        return jsonify({'error': 'User not found'}), 404
    target = dict(target)

    # Only members in the leader's own group may be deleted
    if target['level'] != 'member':
        return jsonify({'error': 'Only member-level users can be deleted'}), 403
    if target['group_id'] != actor['group_id']:
        return jsonify({'error': 'Forbidden'}), 403
    # Colored leaders may only delete same-color members
    if actor['color'] and target['color'] != actor['color']:
        return jsonify({'error': 'Color silo violation'}), 403

    db.execute('DELETE FROM users WHERE id=?', (user_id,))
    db.commit()
    return jsonify({'message': 'User deleted'})


@app.route('/api/groups')
@require_auth
def list_groups():
    db = get_db()
    actor = g.user
    if actor['level'] == 'district':
        rows = db.execute(
            'SELECT g.*, d.name AS district_name FROM groups g JOIN districts d ON g.district_id=d.id WHERE g.district_id=?',
            (actor['district_id'],)).fetchall()
    else:
        rows = db.execute(
            'SELECT g.*, d.name AS district_name FROM groups g JOIN districts d ON g.district_id=d.id'
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/districts')
@require_auth
def list_districts():
    rows = get_db().execute('SELECT * FROM districts').fetchall()
    return jsonify([dict(r) for r in rows])

# ── EVENT REQUESTS ────────────────────────────────────────────────────────────

@app.route('/api/events', methods=['GET'])
@require_auth
def list_events():
    return jsonify(_events_in_scope(g.user, get_db()))


@app.route('/api/events', methods=['POST'])
@require_auth
def submit_event():
    actor = g.user
    if not _can_submit(actor):
        return jsonify({'error': 'You are not permitted to submit event requests'}), 403

    data = request.get_json() or {}
    if not data.get('title'):
        return jsonify({'error': 'title is required'}), 400
    if data.get('required_approval_level') not in ('group', 'district', 'gc', 'ec'):
        return jsonify({'error': 'required_approval_level must be group/district/gc/ec'}), 400

    start_level = _submit_start_level(actor)

    db = get_db()
    db.execute(
        '''INSERT INTO event_requests
           (title,description,location,start_date,end_date,participants,
            materials,notes,submitted_by,required_approval_level,current_level,status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)''',
        (data['title'], data.get('description'), data.get('location'),
         data.get('start_date'), data.get('end_date'), data.get('participants'),
         data.get('materials'), data.get('notes'),
         actor['id'], data['required_approval_level'], start_level, 'pending'))
    db.commit()
    new_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]
    return jsonify(dict(db.execute('SELECT * FROM event_requests WHERE id=?',
                                   (new_id,)).fetchone())), 201


@app.route('/api/events/<int:event_id>/approve', methods=['PUT'])
@require_auth
def approve_event(event_id):
    actor = g.user
    is_group_reviewer = (actor['dashboard'] == 'leader'
                         and actor['level'] in ('group', 'group_admin')
                         and not actor['color'])
    if actor['dashboard'] != 'admin' and not is_group_reviewer:
        return jsonify({'error': 'Forbidden'}), 403

    db = get_db()
    evt = db.execute('SELECT * FROM event_requests WHERE id=?', (event_id,)).fetchone()
    if not evt:
        return jsonify({'error': 'Not found'}), 404
    evt = dict(evt)

    if evt['status'] != 'pending':
        return jsonify({'error': 'Request is already resolved'}), 400
    if evt['current_level'] != actor['level']:
        return jsonify({'error': 'This request is not at your level'}), 403

    submitter = dict(db.execute('SELECT * FROM users WHERE id=?',
                                (evt['submitted_by'],)).fetchone())
    if actor['level'] in ('group', 'group_admin') and submitter['group_id'] != actor['group_id']:
        return jsonify({'error': 'Out of scope'}), 403
    if actor['level'] == 'district' and submitter['district_id'] != actor['district_id']:
        # Also allow district admins approving their own submissions (shouldn't happen, but safe)
        if evt['submitted_by'] != actor['id']:
            return jsonify({'error': 'Out of scope'}), 403

    note = (request.get_json() or {}).get('note', '')
    now  = datetime.utcnow().isoformat()

    if evt['current_level'] == evt['required_approval_level']:
        db.execute('UPDATE event_requests SET status=?,updated_at=? WHERE id=?',
                   ('approved', now, event_id))
        db.execute(
            'INSERT INTO event_request_history (request_id,action,actor_id,note) VALUES (?,?,?,?)',
            (event_id, 'approved', actor['id'], note))
    else:
        nxt = _next_level(evt['current_level'])
        db.execute('UPDATE event_requests SET current_level=?,updated_at=? WHERE id=?',
                   (nxt, now, event_id))
        db.execute(
            'INSERT INTO event_request_history (request_id,action,actor_id,note) VALUES (?,?,?,?)',
            (event_id, f'forwarded_to_{nxt}', actor['id'], note))

    db.commit()
    return jsonify(dict(db.execute('SELECT * FROM event_requests WHERE id=?',
                                   (event_id,)).fetchone()))


@app.route('/api/events/<int:event_id>/reject', methods=['PUT'])
@require_auth
def reject_event(event_id):
    actor = g.user
    is_group_reviewer = (actor['dashboard'] == 'leader'
                         and actor['level'] in ('group', 'group_admin')
                         and not actor['color'])
    if actor['dashboard'] != 'admin' and not is_group_reviewer:
        return jsonify({'error': 'Forbidden'}), 403

    db = get_db()
    evt = db.execute('SELECT * FROM event_requests WHERE id=?', (event_id,)).fetchone()
    if not evt:
        return jsonify({'error': 'Not found'}), 404
    evt = dict(evt)

    if evt['status'] != 'pending':
        return jsonify({'error': 'Already resolved'}), 400
    if evt['current_level'] != actor['level']:
        return jsonify({'error': 'Not at your level'}), 403

    note = (request.get_json() or {}).get('note', '')
    now  = datetime.utcnow().isoformat()
    db.execute('UPDATE event_requests SET status=?,updated_at=? WHERE id=?',
               ('rejected', now, event_id))
    db.execute(
        'INSERT INTO event_request_history (request_id,action,actor_id,note) VALUES (?,?,?,?)',
        (event_id, 'rejected', actor['id'], note))
    db.commit()
    return jsonify(dict(db.execute('SELECT * FROM event_requests WHERE id=?',
                                   (event_id,)).fetchone()))


@app.route('/api/events/<int:event_id>/history')
@require_auth
def event_history(event_id):
    db = get_db()
    rows = db.execute(
        '''SELECT h.*, u.name AS actor_name
           FROM event_request_history h
           JOIN users u ON h.actor_id = u.id
           WHERE h.request_id = ?
           ORDER BY h.acted_at ASC''',
        (event_id,)).fetchall()
    return jsonify([dict(r) for r in rows])

# ── REPORTS ───────────────────────────────────────────────────────────────────

@app.route('/api/reports', methods=['GET'])
@require_auth
def list_reports():
    return jsonify(_reports_in_scope(g.user, get_db()))


@app.route('/api/reports/eligible-requests')
@require_auth
def eligible_requests_for_report():
    """Approved event_requests that belong to the actor and have no report yet."""
    actor = g.user
    if not _can_submit(actor):
        return jsonify({'error': 'Forbidden'}), 403
    db = get_db()
    rows = db.execute('''
        SELECT e.id, e.title, e.start_date, e.location
        FROM event_requests e
        WHERE e.submitted_by = ?
          AND e.status = 'approved'
          AND e.id NOT IN (SELECT request_id FROM reports WHERE request_id IS NOT NULL)
        ORDER BY e.start_date DESC
    ''', (actor['id'],)).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/reports', methods=['POST'])
@require_auth
def submit_report():
    actor = g.user
    if not _can_submit(actor):
        return jsonify({'error': 'You are not permitted to submit reports'}), 403

    data = request.get_json() or {}
    if not data.get('title') or not data.get('body'):
        return jsonify({'error': 'title and body are required'}), 400
    if not data.get('required_approval_level'):
        return jsonify({'error': 'required_approval_level is required'}), 400
    if data['required_approval_level'] not in ('group', 'district', 'gc', 'ec'):
        return jsonify({'error': 'required_approval_level must be group/district/gc/ec'}), 400

    request_id = data.get('request_id') or None
    db = get_db()

    # Validate the linked request if provided
    if request_id:
        req = db.execute(
            'SELECT id FROM event_requests WHERE id=? AND submitted_by=? AND status=?',
            (request_id, actor['id'], 'approved')).fetchone()
        if not req:
            return jsonify({'error': 'Invalid or ineligible request'}), 400
        existing = db.execute(
            'SELECT id FROM reports WHERE request_id=?', (request_id,)).fetchone()
        if existing:
            return jsonify({'error': 'A report already exists for this request'}), 400

    start_level = _report_start_level(actor)
    now = datetime.utcnow().isoformat()

    db.execute(
        '''INSERT INTO reports
           (title, body, submitted_by, request_id, required_approval_level,
            current_level, status, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?)''',
        (data['title'], data['body'], actor['id'], request_id,
         data['required_approval_level'], start_level, 'pending', now, now))
    db.commit()
    new_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]
    return jsonify(dict(db.execute('SELECT * FROM reports WHERE id=?',
                                   (new_id,)).fetchone())), 201


@app.route('/api/reports/<int:report_id>/approve', methods=['PUT'])
@require_auth
def approve_report(report_id):
    actor = g.user
    is_leader_reviewer = (actor['dashboard'] == 'leader'
                          and not actor.get('color')
                          and actor['level'] in ('group_admin', 'group'))
    if actor['dashboard'] != 'admin' and not is_leader_reviewer:
        return jsonify({'error': 'Forbidden'}), 403

    db = get_db()
    report = db.execute('SELECT * FROM reports WHERE id=?', (report_id,)).fetchone()
    if not report:
        return jsonify({'error': 'Not found'}), 404
    report = dict(report)

    if report['status'] != 'pending':
        return jsonify({'error': 'Report is already resolved'}), 400
    if report['current_level'] != actor['level']:
        return jsonify({'error': 'Report is not at your level'}), 403

    note = (request.get_json() or {}).get('note', '')
    now  = datetime.utcnow().isoformat()

    if report['current_level'] == report['required_approval_level']:
        db.execute('UPDATE reports SET status=?,updated_at=? WHERE id=?',
                   ('approved', now, report_id))
        db.execute(
            'INSERT INTO report_history (report_id,action,actor_id,note) VALUES (?,?,?,?)',
            (report_id, 'approved', actor['id'], note))
    else:
        nxt = _next_level(report['current_level'])
        db.execute('UPDATE reports SET current_level=?,updated_at=? WHERE id=?',
                   (nxt, now, report_id))
        db.execute(
            'INSERT INTO report_history (report_id,action,actor_id,forwarded_to_level,note) VALUES (?,?,?,?,?)',
            (report_id, f'forwarded_to_{nxt}', actor['id'], nxt, note))

    db.commit()
    updated = dict(db.execute('SELECT * FROM reports WHERE id=?', (report_id,)).fetchone())
    return jsonify(updated)


@app.route('/api/reports/<int:report_id>/reject', methods=['PUT'])
@require_auth
def reject_report(report_id):
    actor = g.user
    is_leader_reviewer = (actor['dashboard'] == 'leader'
                          and not actor.get('color')
                          and actor['level'] in ('group_admin', 'group'))
    if actor['dashboard'] != 'admin' and not is_leader_reviewer:
        return jsonify({'error': 'Forbidden'}), 403

    db = get_db()
    report = db.execute('SELECT * FROM reports WHERE id=?', (report_id,)).fetchone()
    if not report:
        return jsonify({'error': 'Not found'}), 404
    if dict(report)['current_level'] != actor['level']:
        return jsonify({'error': 'Report is not at your level'}), 403

    note = (request.get_json() or {}).get('note', '')
    now  = datetime.utcnow().isoformat()
    db.execute('UPDATE reports SET status=?,updated_at=? WHERE id=?',
               ('rejected', now, report_id))
    db.execute(
        'INSERT INTO report_history (report_id,action,actor_id,note) VALUES (?,?,?,?)',
        (report_id, 'rejected', actor['id'], note))
    db.commit()
    return jsonify({'message': 'Report rejected'})

# ── PROFILE ───────────────────────────────────────────────────────────────────

@app.route('/api/events/inbox-history')
@require_auth
def events_inbox_history():
    """Events this user has acted on as a reviewer (not their own submissions)."""
    actor = g.user
    db = get_db()
    rows = db.execute('''
        SELECT DISTINCT r.*, u.name AS submitter_name, u.color AS submitter_color,
               g.name AS submitter_group, d.name AS submitter_district
        FROM event_requests r
        JOIN users u ON r.submitted_by = u.id
        LEFT JOIN groups g ON u.group_id = g.id
        LEFT JOIN districts d ON u.district_id = d.id
        WHERE r.id IN (
            SELECT DISTINCT request_id FROM event_request_history WHERE actor_id = ?
        ) AND r.submitted_by != ?
        ORDER BY r.updated_at DESC
    ''', (actor['id'], actor['id'])).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/reports/inbox-history')
@require_auth
def reports_inbox_history():
    """Reports this user has acted on as a reviewer (not their own submissions)."""
    actor = g.user
    db = get_db()
    rows = db.execute('''
        SELECT DISTINCT r.*, u.name AS submitter_name, u.color AS submitter_color,
               e.title AS request_title,
               g.name AS submitter_group, d.name AS submitter_district
        FROM reports r
        JOIN users u ON r.submitted_by = u.id
        LEFT JOIN event_requests e ON r.request_id = e.id
        LEFT JOIN groups g ON u.group_id = g.id
        LEFT JOIN districts d ON u.district_id = d.id
        WHERE r.id IN (
            SELECT DISTINCT report_id FROM report_history WHERE actor_id = ?
        ) AND r.submitted_by != ?
        ORDER BY r.updated_at DESC
    ''', (actor['id'], actor['id'])).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/profile', methods=['PUT'])
@require_auth
def update_profile():
    actor = g.user
    data  = request.get_json() or {}
    db    = get_db()
    updates = {k: data[k] for k in ('name', 'email') if k in data}

    if data.get('current_password') and data.get('new_password'):
        user = db.execute('SELECT password_hash FROM users WHERE id=?',
                          (actor['id'],)).fetchone()
        if user['password_hash'] != hash_password(data['current_password']):
            return jsonify({'error': 'Incorrect current password'}), 400
        updates['password_hash'] = hash_password(data['new_password'])

    if not updates:
        return jsonify({'error': 'No updates provided'}), 400

    set_clause = ', '.join(f'{k}=?' for k in updates)
    db.execute(f'UPDATE users SET {set_clause} WHERE id=?',
               list(updates.values()) + [actor['id']])
    db.commit()
    u = dict(db.execute('SELECT * FROM users WHERE id=?', (actor['id'],)).fetchone())
    u.pop('password_hash')
    return jsonify(u)

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    init_db()
    migrate_db()
    app.run(debug=True, port=5000)
