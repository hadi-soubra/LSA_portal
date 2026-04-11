# LSA Scouts Digital Portal

A role-based management portal for the **Lebanese Scout Association (LSA)**, built with Flask + SQLite on the backend and plain HTML/CSS/JS on the frontend. No build step required.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Architecture](#architecture)
  - [Hierarchy & Roles](#hierarchy--roles)
  - [Color Silos](#color-silos)
  - [Dashboard Routing](#dashboard-routing)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Demo Accounts](#demo-accounts)
- [Feature Map](#feature-map)
- [Contributing](#contributing)

---

## Overview

The portal enforces a **5-level hierarchy** with strict **color-silo** access control. Each user belongs to a level (EC → GC → District → Group → Member) and optionally a color branch (Pink/Cubs, Yellow, Green/Scouts, Red/Rovers). Data flows in one direction per type:

- **Content** (activities, resources, training) flows **downward**
- **Reports** flow **upward**
- **Event requests** travel **upward through the approval chain**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3, Flask, Flask-CORS |
| Auth | JWT (PyJWT), SHA-256 password hashing |
| Database | SQLite (`backend/lsa.db`) |
| Frontend | Static HTML + CSS + Vanilla JS |
| Serving | Flask serves the static files directly |

No Node.js, no bundler, no frontend framework — just files.

---

## Project Structure

```
lsa-portal/
├── backend/
│   ├── server.py          # Flask app + all API routes (~916 lines)
│   ├── db.py              # Schema, seed data, DB helpers (~286 lines)
│   ├── requirements.txt   # Python dependencies
│   └── lsa.db             # SQLite database (auto-created on first run)
├── index.html             # Login page
├── member.html            # Member dashboard
├── leader.html            # Leader dashboard (group/colored leaders)
├── gc.html                # General Commissioner dashboard
├── district.html          # District Commissioner dashboard
├── ec.html                # Executive Committee dashboard
├── styles.css             # Shared CSS (~1200 lines)
└── README.md
```

---

## Getting Started

**Prerequisites:** Python 3.9+

```bash
# 1. Clone the repo
git clone <repo-url>
cd lsa-portal

# 2. Install dependencies
pip install -r backend/requirements.txt

# 3. Run the server
cd backend
python server.py

# 4. Open in browser
# http://localhost:5000
```

The database is created and seeded automatically on first run with ~210 demo users across all levels. Default password for all seeded accounts is `123`.

---

## Architecture

### Hierarchy & Roles

```
EC  (Executive Committee)
 └── GC  (General Commissioner)
      └── District Commissioner
           └── Group Leader / Group Admin Leader
                └── Member
```

Each level can only manage and view users and data **within their own scope** (enforced server-side in `_users_in_scope()` in `server.py`).

| Level | `level` value | `dashboard` value |
|---|---|---|
| Executive Committee | `ec` | `admin` |
| General Commissioner | `gc` | `admin` |
| District Commissioner | `district` | `admin` |
| Group Leader (no-color) | `group` | `leader` |
| Group Admin Leader | `group_admin` | `leader` |
| Colored Group Leader | `group` | `leader` |
| Member | `member` | `member` |

### Color Silos

Each user optionally belongs to a **color branch**:

| Color | Branch |
|---|---|
| `pink` | Cubs |
| `yellow` | Yellows |
| `green` | Scouts / Guides |
| `red` | Rovers / Rangers |

Color-silo rules (enforced server-side):
- A **colored leader** can only see members of the same color in their group.
- A **no-color group leader** can see all leaders and members in their group.
- A **colored district/GC commissioner** can only see users of the same color or no-color below them.
- A **no-color district/GC** commissioner sees everyone below them.

### Dashboard Routing

After login, the server returns a `dashboard` field and a `level` field. The frontend (`index.html`) redirects to the correct page:

| `dashboard` | `level` | Page |
|---|---|---|
| `member` | `member` | `member.html` |
| `leader` | `group` / `group_admin` | `leader.html` |
| `admin` | `district` | `district.html` |
| `admin` | `gc` | `gc.html` |
| `admin` | `ec` | `ec.html` |

---

## Database Schema

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `name` | TEXT | Display name |
| `username` | TEXT UNIQUE | Login credential |
| `password_hash` | TEXT | SHA-256 |
| `dashboard` | TEXT | `member`, `leader`, or `admin` |
| `color` | TEXT | `pink`, `yellow`, `green`, `red`, or NULL |
| `level` | TEXT | `member`, `group`, `group_admin`, `district`, `gc`, `ec` |
| `role_title` | TEXT | e.g. "Group Leader", "District Commissioner" |
| `group_id` | INTEGER FK | References `groups` |
| `district_id` | INTEGER FK | References `districts` |
| `is_functional` | INTEGER | 1 = functional role (GC/EC board positions) |

### `event_requests`
Event requests submitted by any level, traveling upward through the approval chain. Each request tracks `current_level` (where it currently sits for approval) and `required_approval_level` (where final approval must come from).

Status: `pending` → `approved` or `rejected`

### `reports`
Reports submitted upward (leader → district → GC → EC). Each report tracks `current_level` and status.

Status: `submitted` → `forwarded` → `closed`

### `content`
Content pushed downward by higher levels (activities, resources, training, notifications). Supports targeting by color and recipient type.

### `event_request_history` / `report_history`
Audit trail tables — every approve/reject/forward action is logged with actor, timestamp, and optional note.

### `districts` / `groups`
Reference tables. 4 districts (Beirut, Bekaa, Mount Lebanon, South) with 19 groups seeded.

---

## API Reference

All endpoints under `/api/`. Protected endpoints require `Authorization: Bearer <token>`.

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Login. Returns `token` + `user` object |
| GET | `/api/auth/me` | Returns current user from token |

### Users
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/users` | List users in scope (filtered by caller's level/color) |
| POST | `/api/users` | Create a user (scoped by caller's level) |
| PUT | `/api/users/:id` | Update user (must be editable in caller's scope) |
| DELETE | `/api/users/:id` | Delete member (group leaders only, own group) |

### Events (Requests)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/events` | List events visible to caller |
| POST | `/api/events` | Submit a new event request |
| PUT | `/api/events/:id/approve` | Approve (and forward if needed) |
| PUT | `/api/events/:id/reject` | Reject a request |
| GET | `/api/events/:id/history` | Approval history for a request |

### Reports
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/reports` | List reports visible to caller |
| POST | `/api/reports` | Submit a new report |
| PUT | `/api/reports/:id/forward` | Forward report to next level |
| PUT | `/api/reports/:id/close` | Close a report |

### Other
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/stats` | Dashboard stats for current user |
| GET | `/api/groups` | All groups (used when creating district-level users) |
| GET | `/api/districts` | All districts |
| PUT | `/api/profile` | Update own name/email/password |

---

## Demo Accounts

Default password for all seeded accounts is `123`.

### Named test accounts (non-standard passwords)

| Username | Password | Level | Color | Dashboard |
|---|---|---|---|---|
| `member` | `member123` | member | green | member.html |
| `leader` | `leader123` | group | green | leader.html |
| `group_leader` | `group123` | group | none | leader.html |
| `red_leader` | `leader123` | group | red | leader.html |
| `dist_bei_green` | `dist123` | district | green | district.html |
| `gc_commissioner` | `gc123` | gc | none | gc.html |
| `gc_green` | `gc123` | gc | green | gc.html |
| `ec_president` | `ec123` | ec | none | ec.html |

### Seeded accounts (password: `123`)

The seed generates usernames following these patterns:

- **EC board:** `ec_president`, `ec_secretary`, `ec_treasurer`, `ec_honorary_president`, etc.
- **GC board:** `gc_general_commissioner`, `gc_deputy_commissioner`, `gc_cubs_commissioner` (pink), `gc_scouts_commissioner` (green), etc.
- **District commissioners:** `bei_commissioner`, `bek_commissioner`, `mnt_commissioner`, `sth_commissioner`, etc.
- **Group leaders:** `bei_b1_group_leader`, `bei_b1_cubs_leader` (pink), `bei_b1_boyscouts_leader` (green), etc.

---

## Feature Map

### Member (`member.html`)
- View personal dashboard with activity feed
- Update own profile (name, email, password)

### Leader (`leader.html`)
- **Dashboard** — pending requests and stats
- **My Group** (group admin / no-color leaders only)
  - **Leaders** tab — view/edit leader-level users in the group
  - **Members** tab — view/edit/add/delete members
- **Communications**
  - Send Event Request (upward to district/GC/EC)
  - Send Report (upward)
  - Tracker — status of own submissions
  - Approvals tab (no-color group leaders only) — approve/reject requests from colored leaders

### District Commissioner (`district.html`)
- **Dashboard** — stats, pending requests, pending reports
- **My Group**
  - **Leaders** tab — group leaders in district
  - **Members** tab — members in district
- **Communications**
  - Send Request / Send Report / Tracker (upward to GC)
  - **Approve Requests** — pending/all requests from group leaders (approve → forwards to GC, or final-approves if EC-level not required)
  - **Approve Reports** — forward or close reports from group leaders

### GC Commissioner (`gc.html`)
- **Dashboard** — stats, pending requests, pending reports
- **My Group**
  - **Leaders** tab — district commissioners and GC peers
  - **Members** tab — members visible at GC scope
- **Communications**
  - Send Request / Send Report / Tracker (upward to EC)
  - **Approve Requests** — pending/all requests from district commissioners
  - **Approve Reports** — forward or close reports from districts

### EC (`ec.html`)
- **Dashboard** — national stats, final approvals, open reports
- **My Group**
  - **Leaders** tab — GC commissioners and EC peers
  - **Members** tab — members visible at EC scope
- **Communications**
  - **Approve Requests** — final approval for all escalated event requests
  - **Approve Reports** — close all escalated reports

---

## Contributing

The codebase is intentionally simple — no build pipeline, no framework. Each page is self-contained.

### Adding a new feature

**Backend:** Add a route in `backend/server.py`. Follow the `@require_auth` + scope-check pattern already used throughout.

**Frontend:** Edit the relevant `.html` file. Each page's JS is in a `<script>` tag at the bottom. The `api(method, path, body)` helper handles auth headers automatically.

**New page:** If adding a new role/dashboard, follow the structure of an existing page (e.g. `leader.html`). The sidebar structure is:
```
Main  → Dashboard
My Group → Leaders, Members
Communications → Communications
```

### Key patterns to follow

- **Server-side scoping** — never trust the frontend to filter data. All visibility rules live in `_users_in_scope()`, `_events_in_scope()` equivalents in `server.py`.
- **Color silo** — check `actor['color']` and `target['color']` before exposing data. Colored users only see same-color or no-color data below them.
- **Approval chain** — event requests have a `current_level` that advances upward on each approval. Check `server.py` routes `PUT /api/events/:id/approve` for the forwarding logic.
- **Audit trail** — write to `event_request_history` or `report_history` on every action.

### Changing the secret key

`SECRET_KEY` in `server.py` line 21. Change before any real deployment.

### Database reset

Delete `backend/lsa.db` and restart the server. The DB and seed data will be recreated automatically.
