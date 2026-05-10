# Identity / Role Split — Change Documentation

## Problem

All 211 user accounts were **role accounts**, not personal accounts. To log in as the Reds B2 leader, you used the shared username `bei_b2_reds_leader` and password `123`. This meant:

- No personal identity — two people sharing a role had to share credentials
- Personal future features (message history, AI chat history) had nowhere to attach
- Role reassignment was destructive — you'd lose or have to manually migrate history
- No way to know *which person* performed an action when a role had co-holders

---

## The Core Idea

Split identity from position:

| Table | What it represents |
|---|---|
| `persons` | A real human being — name, email, password |
| `users` | An organizational role slot — "Reds B2 Leader", "Beirut Commissioner" |
| `person_role_assignments` | Who holds which role right now (and historically) |

A person logs in with their own email and password. They get access to the data of whichever role they're currently assigned to. Multiple people can hold the same role simultaneously (e.g., a main leader + assistant both logging in to Reds B2 data).

---

## Database Changes

### New tables (`backend/db.py`)

```sql
CREATE TABLE IF NOT EXISTS persons (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS person_role_assignments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id     INTEGER NOT NULL REFERENCES persons(id),
    role_id       INTEGER NOT NULL REFERENCES users(id),
    assigned_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    unassigned_at DATETIME DEFAULT NULL   -- NULL = currently active
);

-- One active role per person at a time
CREATE UNIQUE INDEX IF NOT EXISTS ux_person_one_active_role
    ON person_role_assignments(person_id)
    WHERE unassigned_at IS NULL;
```

### Audit trail columns

`actor_person_id INTEGER REFERENCES persons(id)` added (nullable) to both:
- `event_request_history`
- `report_history`

This records *which specific person* approved or rejected an action, not just which role.

### Migration (`migrate_identity_split()`)

Idempotent function that runs on every server startup (after `migrate_db()`):
- For each existing `users` row, creates a `persons` row with email `{username}@lsa.lb` and the same `password_hash`
- Creates a `person_role_assignments` row linking that person to the role
- Skips rows that already exist (safe to re-run)
- Adds the `actor_person_id` columns via `ALTER TABLE` if they don't exist yet

All 211 seeded accounts get placeholder emails (`ec_president@lsa.lb`, `bei_b2_reds_leader@lsa.lb`, etc.) and keep password `123`.

---

## Authentication Changes

### JWT format

| Before | After |
|---|---|
| `{ user_id, exp }` | `{ person_id, role_id, exp }` |

New helper: `make_role_token(person_id, role_id)`

### `require_auth` decorator

Backward-compatible bridge: if the token contains `user_id` (old format), it still works so existing sessions survive the rollout. New tokens use `person_id` + `role_id`, verify the assignment is still active, and populate both `g.person` (the human) and `g.user` (the role dict).

### Login endpoint (`POST /api/auth/login`)

- Accepts `email` instead of `username`
- Looks up `persons` by email, verifies password
- Finds the person's active role via `person_role_assignments`
- Returns `{ token, user: <role data>, person: { id, name, email } }`
- 403 if person exists but has no active role assignment

### `GET /api/auth/me`

Now returns both `user` (role) and `person` objects.

---

## Backend Endpoint Changes

### `GET /api/users`

The `_USER_BASE` query was extended to LEFT JOIN `person_role_assignments` and `persons`, so every row now includes:

| Field | Source |
|---|---|
| `person_id` | `persons.id` |
| `person_name` | `persons.name` |
| `person_email` | `persons.email` |
| all existing role fields | `users.*` |

If a role slot has no active assignment, `person_id/name/email` are `null`. If a role has two co-holders, it appears as two rows (one per person). `person_id` is the unique key for UI rows, not `users.id`.

### `POST /api/users` (unchanged for group leaders)

Group leaders creating members still use this. It creates a `persons` row + `users` row (member-level role slot) + assignment atomically. Returns 409 on duplicate email.

### `POST /api/persons` (new)

Admin dashboards use this to create a person. Optionally assigns them to an existing role slot.

- Required: `name`, `email`, `password`
- Optional: `role_id` (must be editable by the calling actor)
- 409 on duplicate email

### `PUT /api/users/<person_id>`

The `<id>` parameter is now a **person_id**, not a role id.

- Updates `name`, `email`, `password` in the `persons` table
- For member-level role slots: also updates `color`, `group_id`, `role_title` in `users`

### `DELETE /api/users/<person_id>`

Does **not** delete any rows. Closes the active assignment:

```sql
UPDATE person_role_assignments
SET unassigned_at = CURRENT_TIMESTAMP
WHERE person_id = ? AND unassigned_at IS NULL
```

Person account and role slot are preserved for history integrity.

### `PUT /api/profile`

Now writes to `persons` table (name, email, password), not `users`.

### `POST /api/admin/roles/<role_id>/assign` (new)

Assigns an existing or new person to a pre-existing role slot. If the person already has an active role, closes that assignment first. Other co-holders of the target role are unaffected.

### `DELETE /api/admin/roles/<role_id>/persons/<person_id>` (new)

Removes one specific person from a role without affecting co-holders.

---

## Frontend Changes

### Login page (`index.html` + `scripts/index.js`)

- Username field → Email field (`type="email"`)
- `handleLogin` sends `{ email, password }` and stores `lsa_person` in `sessionStorage` alongside `lsa_user`
- Credentials panel shows `{username}@lsa.lb` format emails and auto-fills the email field

### All dashboard scripts

**`logout()`** — all five scripts (`leader.js`, `district.js`, `gc.js`, `ec.js`, `member.js`) now clear `lsa_person` from `sessionStorage` on logout.

**Profile display** — sidebar name/avatar and profile section now read from `personData` (from `lsa_person` sessionStorage) with fallback to `userData`.

**User list / table** — shows `person_name` + `person_email` as the primary identity. Role info (title, color, level) shown as secondary context. Edit/delete buttons pass `person_id`, not `users.id`.

**Add/edit modals** — "Username" field removed everywhere. "Email" field is now required. On add: calls `POST /api/persons`. On edit: calls `PUT /api/users/<person_id>`.

**Table headers** — "Username" column removed from all dashboards; replaced with "Person" (showing name + email in one cell). Colspans updated accordingly.

### `member.js`

- Profile form reads name and email from `personData` (personal account), not `userData` (role)
- `saveProfile` updates `lsa_person` in sessionStorage on success
- Defaults to showing the Profile section on load (home section is empty)

### Default section on load

The home sections in gc.html, district.html, and ec.html are empty placeholders. These dashboards now navigate to `inbox-requests` automatically after init completes. Members land on `profile`.

### Add button

"+ Add User" button added to the users section of gc.html, district.html, and ec.html (previously there was no create button in these dashboards).

### Add Person modal (gc, district, ec)

Simplified from a role-creation form to a person-creation form:
- Fields: Full Name, Email, Password, optional Role dropdown
- Role dropdown populated from the actor's editable role slots, labeled with role title + color + location + `(vacant)` if unoccupied
- In edit mode, the role dropdown is hidden — only name/email/password are editable

---

## Bug Fixes During Implementation

### White screen on gc/district/ec dashboards

All three HTML files had a missing `</div>` closing tag for the email field's inner div inside the user modal. This caused the `modal-overlay` div to never close, so the entire `.app` div ended up nested inside `display: none`. Fixed by adding the missing closing tag.

### `renderHomePendingEvents` / `renderHomePendingReports` not defined

These functions were called inside `loadComms()` in gc.js, district.js, and ec.js but never implemented. Added no-op stubs to prevent the ReferenceError.

---

## Permission Model (unchanged)

Who can create/edit whom:

| Actor | Can create | Can edit |
|---|---|---|
| Group head / group admin | Members in their group | Members and group leaders in their group |
| District head / district admin | Group leaders, members in their district | Group heads, group admins, colored district leaders |
| GC head / GC admin | District commissioners | Colored/functional GC leaders, district heads |
| EC | GC commissioners | GC heads/admins |

Color silo rule: a colored actor can only create/edit users of the same color.

---

## What Did NOT Change

- All foreign keys (`event_requests.submitted_by`, `reports.submitted_by`, history `actor_id`) still point to `users.id` (the role slot) — unit-level data stays with the unit
- Scoping/permission logic in `_users_in_scope`, `_events_in_scope`, `_reports_in_scope`
- Event submission and approval workflow
- Report submission and approval workflow
- Content/broadcast system
- `users` table still exists with all its columns intact (credentials will be stripped in a future phase once fully verified)
