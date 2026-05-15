# LSA Portal

**A full-stack web portal for the Lebanese Scout Association (LSA), built for scout leaders, members, and administrators across all organizational levels.**

The LSA Portal centralizes scout management into one system: leaders submit event requests that flow through a hierarchical approval chain, file post-event reports, and broadcast content to their units. Members see their content feed and profile. Administrators at every level manage users within their scope and review submissions. An integrated AI assistant (powered by Claude Haiku) answers portal and scouting questions in context — and for leaders, a single click opens ScoutMind for AI-generated weekly meeting plans.

---

## Table of Contents

1. [Why the LSA Portal Exists](#1-why-the-lsa-portal-exists)
2. [How It Works — Conceptual Overview](#2-how-it-works--conceptual-overview)
3. [Architecture Overview](#3-architecture-overview)
4. [Role & Permission System](#4-role--permission-system)
5. [Event Request Workflow](#5-event-request-workflow)
6. [Report Workflow](#6-report-workflow)
7. [Content Broadcasting](#7-content-broadcasting)
8. [AI Assistant](#8-ai-assistant)
9. [ScoutMind SSO Integration](#9-scoutmind-sso-integration)
10. [Database Schema](#10-database-schema)
11. [API Reference](#11-api-reference)
12. [Tech Stack](#12-tech-stack)
13. [Project Structure](#13-project-structure)
14. [Setup & Installation](#14-setup--installation)
15. [Environment Variables](#15-environment-variables)
16. [Running the Application](#16-running-the-application)
17. [Seed Data](#17-seed-data)
18. [API Performance Benchmarks](#18-api-performance-benchmarks)
19. [Future Work](#19-future-work)

---

## 1. Why the LSA Portal Exists

The Lebanese Scout Association spans four districts (Beirut, Bekaa, Mount Lebanon, South) with dozens of groups and hundreds of leaders and members. Before the portal, event approvals were handled through informal channels — phone calls, WhatsApp messages, paper forms — with no audit trail and no consistent process.

The LSA Portal provides a single structured system where:
- Leaders submit event requests and get them approved up the chain automatically
- Reports are filed after events and reviewed by the same chain
- Content (announcements, training materials, promotions) reaches the right members instantly
- Administrators at every level manage their own scope without stepping on each other
- An AI assistant answers questions in real time, with full awareness of who the user is and what they can do

---

## 2. How It Works — Conceptual Overview

The experience depends entirely on who is logged in. The portal adapts its interface, its data scope, and its AI assistant behavior based on the authenticated user's role, level, and color.

**A colored group leader** (e.g., Boy Scouts Troop Leader) submits an event request from their dashboard. The system automatically routes it to their Group Admin for first-level review. If the event is district-wide, it continues up to District, then GC, then EC. Each reviewer approves or rejects with an optional note, and the history is preserved. After the event happens, the leader files a report through the same chain.

**A group admin** sees both their own submissions and requests pending their review in the same interface. They can approve, reject, or forward with a note.

**A district commissioner** manages all groups in their district, reviews district-level event submissions, and can broadcast content to leaders or members in their district.

**A GC or EC administrator** has council-wide visibility and handles the top of the approval chain.

**A member** logs in to see content their leaders have broadcast to them and to manage their profile.

The **AI assistant** sits in a sliding panel on every dashboard. It knows who the user is (name, role, group, district, color) and gives context-aware answers — never off-topic.

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    BROWSER (Vanilla JS)                       │
│   index.html → login        → redirects to dashboard         │
│   member.html               → Member dashboard               │
│   leader.html               → Leader dashboard               │
│   gc.html                   → GC/District/EC dashboard       │
│                                                               │
│   shared-chat.js            → AI assistant panel (all roles) │
│   shared-report-form.js     → Report submission modal        │
│   shared-request-form.js    → Event request modal            │
└───────────────────────────┬──────────────────────────────────┘
                            │  REST API (fetch + JWT)
                            │
┌───────────────────────────▼──────────────────────────────────┐
│                  FLASK BACKEND (server.py)                    │
│                                                               │
│   Auth        → /api/auth/login, /api/auth/me                │
│   Users       → /api/users (CRUD, scoped)                    │
│   Events      → /api/events (submit, approve, reject)        │
│   Reports     → /api/reports (submit, approve, reject)       │
│   Content     → /api/content, /api/member/content            │
│   Chat        → /api/chat (Claude Haiku, rate-limited)       │
│   SSO         → /api/sso/token, /api/scoutmind/health        │
│   Profile     → /api/profile                                 │
└───────────────────────────┬──────────────────────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │    SQLite (lsa.db)         │
              │  via db.py + raw sqlite3  │
              └───────────────────────────┘

Supporting layers:
  ├── PyJWT          (session tokens + SSO tokens)
  ├── Anthropic SDK  (Claude Haiku for AI chat)
  ├── python-dotenv  (environment variables)
  └── flask-cors     (cross-origin for dev)
```

---

## 4. Role & Permission System

The portal uses a two-table identity model: **persons** (human beings with an email and password) and **users** (role slots with organizational attributes). A person is linked to one active role at a time via `person_role_assignments`. This allows roles to be transferred between people without losing history.

### Dashboards

Every role belongs to one of three dashboards:

| Dashboard | Who | Interface |
|---|---|---|
| `member` | Scout members | Content feed, profile |
| `leader` | Group-level leaders | Event requests, reports, content broadcasting, members |
| `admin` | District, GC, EC administrators | Review queues, user management, content broadcasting |

### Levels

| Level | Scope | Notes |
|---|---|---|
| `member` | Their group, their color | View-only |
| `group_admin` | Their group | First reviewer for colored leaders |
| `group` | Their group | Group head; second reviewer |
| `district` | Their district | District commissioner and assistants |
| `gc` | Council-wide | General Committee |
| `ec` | Council-wide | Executive Committee; top of chain |

### Color System

Colors identify scout unit branches:

| Color | Branch |
|---|---|
| `pink` | Beavers / Pinks (ages 3–7) |
| `yellow` | Cubs / Yellows (ages 7–11) |
| `green` | Boy Scouts / Girl Scouts (ages 11–16) |
| `red` | Rovers / Pioneers (ages 16–19) |

A colored leader sees and manages only members of their own color. A no-color leader (Group Leader, Group Admin) sees all colors in their group.

### Visibility & Edit Scope

Each actor can only see and edit users within their scope. The rules are layered:

| Actor | Can Edit | Can View |
|---|---|---|
| Colored group leader | Nobody (view-only) | Same-color members + all leaders in group |
| Group Admin (no color) | All members + leaders in their group | Same |
| Group Leader (no color) | All members + leaders in their group | Same |
| District head/admin | Group heads, group admins, district-level leaders | Everyone in district |
| GC head/admin | GC leaders, district heads/admins | Everyone (except EC) |
| EC | GC heads/admins | Everyone |

### Functional Roles

Roles with `is_functional = 1` are support/specialist roles (Music, PR, Finance, Leadership Development). These roles have **no user management access** — they exist only to receive relevant content and submit events within their scope.

---

## 5. Event Request Workflow

Event requests flow upward through the level chain. Each level can approve (forwarding to the next) or reject (ending the flow).

### Approval Chain

```
Colored Group Leader submits
        │
        ▼
Group Admin (group_admin level) — first review
        │ approves
        ▼
Group Leader (group level) — second review
        │ approves
        ▼
District Commissioner — if required_approval_level ≥ district
        │ approves
        ▼
GC — if required_approval_level ≥ gc
        │ approves
        ▼
EC — if required_approval_level = ec → APPROVED
```

A no-color Group Leader (level `group`, no color) submitting goes directly to District level — skipping both `group_admin` and `group`. A Group Admin (level `group_admin`) submitting starts at Group level (skipping `group_admin`). A District or GC administrator submitting starts one level above themselves.

### Required Approval Level

The submitter selects the required approval level when creating the request:

| Scope | Required Level |
|---|---|
| Group-only event | `group` |
| Multi-group or district event | `district` |
| National or cross-district | `gc` |
| Executive-level | `ec` |

### Event Request Fields

| Field | Type | Description |
|---|---|---|
| `title` | TEXT | Event name |
| `description` | TEXT | Detailed description |
| `location` | TEXT | Venue or location |
| `start_date` / `end_date` | TEXT | Date range |
| `start_time` / `end_time` | TEXT | Time window |
| `activity_type` | TEXT | Type of activity |
| `leaders_count` | INTEGER | Number of leaders present |
| `members_count` | INTEGER | Number of members |
| `guests_count` | INTEGER | Number of guests |
| `transport_needed` | BOOLEAN | Whether transport is required |
| `transport_details` | TEXT | Transport arrangements |
| `budget_estimated` | TEXT | Estimated cost |
| `materials` | TEXT | Required materials |
| `notes` | TEXT | Additional notes |
| `required_approval_level` | ENUM | group / district / gc / ec |

### History

Every approve/reject/forward action is recorded in `event_request_history` with the actor, timestamp, and optional note. This full audit trail is accessible via `GET /api/events/:id/history`.

---

## 6. Report Workflow

After an approved event is held, the submitter files a post-event activity report. Reports follow the same approval chain as the original event request.

### Linking to Events

A report can optionally be linked to an approved event request (`request_id`). Only requests that belong to the actor and have no report yet are eligible. An approved request can only have one report.

### Report Fields

| Field | Type | Description |
|---|---|---|
| `title` | TEXT | Report title |
| `body` | TEXT | Narrative summary |
| `objectives` | TEXT | What the event aimed to achieve |
| `outcomes` | TEXT | What was actually achieved |
| `challenges` | TEXT | Difficulties encountered |
| `recommendations` | TEXT | Suggestions for future events |
| `leaders_count` | INTEGER | Leaders present |
| `members_count` | INTEGER | Members present |
| `guests_count` | INTEGER | Guests present |
| `safety_incident` | BOOLEAN | Whether a safety incident occurred |
| `safety_details` | TEXT | Details if incident occurred |
| `budget_planned` | TEXT | Planned budget |
| `budget_actual` | TEXT | Actual spend |
| `photos_taken` | BOOLEAN | Whether photos were taken |
| `photos_count` | INTEGER | Number of photos |

---

## 7. Content Broadcasting

Leaders and administrators can send content to their members or leaders. Content is scoped automatically based on the sender's level.

### Content Types

| Type | Use Case |
|---|---|
| `notification` | Announcements and alerts |
| `training` | Training materials |
| `activity` | Activity descriptions |
| `resource` | Links, documents, resources |

### Target Filtering

| Sender Level | Target Scope |
|---|---|
| Group Leader / Group Admin | Members of their group only |
| District | Members or leaders in their district |
| GC / EC | Council-wide (no spatial restriction) |

Members see only content addressed to `members` or `both` and that passes their color, group, and district filters. Leaders see content addressed to `leaders` or `both`.

---

## 8. AI Assistant

Every dashboard includes a sliding AI chat panel powered by **Claude Haiku** (`claude-haiku-4-5-20251001`). The assistant is context-aware — it knows exactly who it is talking to and adapts its answers accordingly.

### Context Injection

The system prompt is built dynamically from the authenticated user's attributes:

```
You are a professional assistant for the Lebanese Scout Association (LSA) portal.
You are talking to [name], [role] in [group], [district] district, [color] branch.
```

The system prompt then includes portal knowledge (event fields, approval chain, report sections, content broadcasting) and role-specific instructions:

| Dashboard | Assistant Focus |
|---|---|
| `leader` | Event request drafting, approval level selection, report sections, activity suggestions for their branch; refers leaders to ScoutMind for full meeting plans |
| `member` | Scouting skills (first aid, knots, navigation, campfire), badge requirements, portal navigation |
| `admin` (district) | Content drafting for leaders and members, approval workflow guidance |
| `admin` (gc) | Council-wide content, district-level review workflows |
| `admin` (ec) | National announcements, GC-level submissions |

### Guardrails

The assistant enforces strict topic boundaries. If a user asks anything unrelated to LSA portal usage, scouting activities, event planning, reports, approvals, or scout leadership, it responds only with:

> "I can only assist with LSA portal and scouting-related questions."

It will not engage with personal, political, or off-topic questions under any circumstances.

### Response Rules

- Maximum 3 to 6 sentences or a short bullet list
- No closing questions or filler phrases ("I hope this helps", "Let me know if...")
- No emojis, em dashes, or en dashes
- Formal, professional tone
- One clarifying question at a time if needed

### Rate Limiting

Each user is limited to **20 messages per day**. The limit resets at midnight UTC. Rate limiting is enforced in-memory (resets on server restart). When the limit is reached, the server returns HTTP 429 and the frontend displays:

> "You have reached your daily message limit. Please try again tomorrow."

---

## 9. ScoutMind SSO Integration

Scout leaders can open [ScoutMind](https://github.com/moussa-elshami/scoutmind-ai) — an AI weekly meeting plan generator — directly from the LSA Portal chat panel with a single click. No separate login is required.

### How It Works

```
Leader clicks "Generate Weekly Meeting Plan"
        │
        ▼
GET /api/scoutmind/health          ← server-side health check (avoids CORS)
        │ 200 OK
        ▼
POST /api/sso/token                ← LSA Portal signs a 5-minute JWT
        │ { token: "eyJ..." }
        ▼
window.open("http://localhost:8501?token=<JWT>")
        │
        ▼
ScoutMind verifies token with shared SSO_SECRET
        │ valid
        ▼
ScoutMind auto-creates account (if first login) → opens chat directly
```

### JWT Payload

| Field | Source | Example |
|---|---|---|
| `name` | Person record | `"Moussa Shamix"` |
| `email` | Person record | `"moussa@lsa.org.lb"` |
| `role` | Role title | `"Boy Scouts Troop Leader"` |
| `group` | Group name | `"Group Beirut 1"` |
| `district` | District name | `"Beirut"` |
| `color` | Unit color tag | `"green"` |
| `exp` | Issued + 5 min | JWT standard claim |

### Error Handling

If ScoutMind is not running, the health check returns 503 and the frontend shows:

> "ScoutMind is not running. Please start it and try again."

If the SSO token request fails for any other reason:

> "Could not open ScoutMind. Please try again."

The button is disabled with a spinner while the health check and token request are in flight, and is restored to its original state whether the flow succeeds or fails.

### Required Configuration

Add `SSO_SECRET` to `backend/.env` — must match the `SSO_SECRET` in ScoutMind's `agents/.env`:

```env
SSO_SECRET=your-shared-sso-secret-here
```

Without this variable, the `/api/sso/token` endpoint returns 503 and the SSO flow is disabled.

---

## 10. Database Schema

The database is SQLite, accessed via raw `sqlite3` in Python. `db.py` contains the schema, seed data, and four idempotent migration functions called at every server startup.

### Tables

**`districts`**
```
id, name
```
Four districts: Beirut, Bekaa, Mount Lebanon, South.

**`groups`**
```
id, name, code (UNIQUE), district_id → districts
```
19 groups across 4 districts (e.g., BEI-B1, BEK-Z1, MNT-B1, STH-S1).

**`persons`**
```
id, name, email (UNIQUE), password_hash, created_at
```
Human beings. Email is the login credential.

**`users`**
```
id, name, email, username (UNIQUE), password_hash,
dashboard (member|leader|admin),
color (pink|yellow|green|red|NULL),
level (member|group_admin|group|district|gc|ec),
role_title, group_id → groups, district_id → districts,
is_functional (0|1), created_at
```
Organizational role slots. One row per role, not per person.

**`person_role_assignments`**
```
id, person_id → persons, role_id → users,
assigned_at, unassigned_at (NULL = active)
```
Links persons to roles. Only one active assignment per person is enforced by a partial unique index.

**`event_requests`**
```
id, title, description, location, start_date, end_date,
activity_type, start_time, end_time,
leaders_count, members_count, guests_count,
transport_needed, transport_details, budget_estimated,
materials, notes,
submitted_by → users, required_approval_level, current_level,
status (pending|approved|rejected), created_at, updated_at
```

**`event_request_history`**
```
id, request_id → event_requests, action, actor_id → users,
actor_person_id → persons, note, acted_at
```

**`reports`**
```
id, title, body, submitted_by → users, request_id → event_requests,
required_approval_level, current_level,
status (pending|approved|rejected),
leaders_count, members_count, guests_count,
objectives, outcomes, challenges, recommendations,
safety_incident, safety_details,
budget_planned, budget_actual,
photos_taken, photos_count,
created_at, updated_at
```

**`report_history`**
```
id, report_id → reports, action, actor_id → users,
actor_person_id → persons, forwarded_to_level, note, acted_at
```

**`content`**
```
id, title, body, content_type (activity|resource|training|notification),
sent_by → users,
target_colors (JSON array or NULL),
target_recipient_type (leaders|members|both),
target_district_ids (JSON array or NULL),
target_group_ids (JSON array or NULL),
created_at
```

### Migrations

Four idempotent migration functions run at every server startup:

| Function | What It Does |
|---|---|
| `migrate_db()` | Fixes `is_functional` flag for management roles seeded incorrectly |
| `migrate_identity_split()` | Creates `persons` and `person_role_assignments` rows for legacy `users` records; adds `actor_person_id` columns to history tables |
| `migrate_reports_v2()` | Adds structured fields (objectives, outcomes, budget, safety, photos) to `reports` table |
| `migrate_events_v2()` | Adds structured fields (activity type, timing, transport, budget) to `event_requests` table |

---

## 11. API Reference

All API endpoints (except `/api/auth/login`) require a `Bearer <token>` header. Tokens are 7-day JWTs signed with `SECRET_KEY`.

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Login with email + password. Returns `{ token, user, person }` |
| GET | `/api/auth/me` | Get current authenticated user |

### Users & Persons

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/users` | List users in scope (admin and group leaders only) |
| POST | `/api/users` | Create a new user + person account |
| PUT | `/api/users/:person_id` | Update a person's name, email, password, role fields |
| DELETE | `/api/users/:person_id` | Remove a member (group leaders only) |
| POST | `/api/persons` | Create a person account only (optionally link to existing role) |
| GET | `/api/groups` | List groups in scope |
| GET | `/api/districts` | List all districts |

### Role Assignments (Admin)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/admin/roles/:role_id/assign` | Assign an existing or new person to a role slot |
| DELETE | `/api/admin/roles/:role_id/persons/:person_id` | Remove one person from a role without affecting co-holders |

### Event Requests

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/events` | List events in scope |
| POST | `/api/events` | Submit a new event request |
| GET | `/api/events/:id` | Get one event request with submitter details |
| PUT | `/api/events/:id/approve` | Approve or forward event request |
| PUT | `/api/events/:id/reject` | Reject event request |
| GET | `/api/events/:id/history` | Full approval history for an event |
| GET | `/api/events/inbox-history` | Events this user has acted on as reviewer |

### Reports

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/reports` | List reports in scope |
| POST | `/api/reports` | Submit a new report |
| GET | `/api/reports/:id` | Get one report with linked event details |
| PUT | `/api/reports/:id/approve` | Approve or forward report |
| PUT | `/api/reports/:id/reject` | Reject report |
| GET | `/api/reports/eligible-requests` | Approved events with no report yet (for linking) |
| GET | `/api/reports/inbox-history` | Reports this user has acted on as reviewer |

### Content

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/content` | Send content to members or leaders |
| GET | `/api/member/content` | Get content targeted to the current member |

### Profile

| Method | Endpoint | Description |
|---|---|---|
| PUT | `/api/profile` | Update name, email, or password for the current person |

### Stats

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/stats` | Role-specific dashboard statistics |

### AI Chat

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/chat` | Send a message to Claude Haiku. Returns `{ reply }`. Rate-limited to 20/day |

### ScoutMind Integration

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/scoutmind/health` | Server-side health check for ScoutMind (avoids browser CORS) |
| POST | `/api/sso/token` | Generate a 5-minute SSO JWT for ScoutMind |

---

## 12. Tech Stack

| Layer | Technology | Version | Role |
|---|---|---|---|
| **Frontend** | Vanilla JS + HTML | — | Dashboards, forms, chat panel |
| **Backend** | Flask | 3.0+ | REST API + static file serving |
| **CORS** | flask-cors | 4.0+ | Cross-origin support for development |
| **Auth** | PyJWT | 2.8+ | Session tokens (7-day) + SSO tokens (5-min) |
| **AI** | Anthropic Claude Haiku (`claude-haiku-4-5-20251001`) | — | Context-aware chat assistant |
| **Anthropic SDK** | anthropic | 0.40.0+ | Python client for Claude API |
| **Database** | SQLite + sqlite3 | — | All application data |
| **Config** | python-dotenv | 1.0+ | Environment variable management |
| **Password Hashing** | hashlib SHA-256 | stdlib | User credential storage |

---

## 13. Project Structure

```
LSA-portal/
│
├── backend/
│   ├── server.py                   # Flask application — all routes and business logic
│   ├── db.py                       # Schema, seed data, migrations
│   ├── lsa.db                      # SQLite database (auto-created)
│   ├── .env                        # Environment variables (gitignored)
│   ├── .env.example                # Template for required variables
│   └── requirements.txt            # Python dependencies
│
├── scripts/
│   ├── index.js                    # Login page logic
│   ├── member.js                   # Member dashboard logic
│   ├── leader.js                   # Leader dashboard logic (event requests, reports, members)
│   ├── gc.js                       # GC/District/EC admin dashboard logic
│   ├── shared-chat.js              # AI assistant panel (all dashboards)
│   ├── shared-report-form.js       # Shared report submission modal
│   ├── shared-request-form.js      # Shared event request modal
│   ├── report-detail.js            # Report detail view
│   └── request-detail.js          # Event request detail view
│
├── styles/
│   ├── shared.css                  # Global layout, components, chat panel
│   ├── index.css                   # Login page styles
│   ├── member.css                  # Member dashboard styles
│   ├── leader.css                  # Leader dashboard styles
│   ├── gc.css                      # Admin dashboard styles
│   ├── district.css                # District-specific overrides
│   └── ec.css                      # EC-specific overrides
│
├── assets/
│   ├── LSA-logo-header.png         # Full LSA logo
│   └── LSA-logo-header-compact.png # Compact logo for sidebar
│
├── docs/                           # Ticket documentation
│
├── index.html                      # Login page
├── member.html                     # Member dashboard
├── leader.html                     # Leader dashboard
└── gc.html                         # GC / District / EC admin dashboard
```

---

## 14. Setup & Installation

**Prerequisites:** Python 3.10+, pip

```bash
# 1. Clone the repository
git clone <repo-url>
cd LSA-portal

# 2. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate      # Linux / macOS
# .venv\Scripts\activate       # Windows

# 3. Install dependencies
pip install -r backend/requirements.txt

# 4. Configure environment variables (see §15)
cp backend/.env.example backend/.env
# Edit backend/.env and fill in your API key

# 5. Start the server (initializes the database automatically)
python backend/server.py
```

The database is created and seeded automatically on first run. No separate init step is needed.

---

## 15. Environment Variables

Create a `backend/.env` file (copy from `backend/.env.example`):

```env
# Required — Anthropic API key for Claude Haiku (AI assistant)
ANTHROPIC_API_KEY=your-anthropic-api-key-here

# Optional — Shared secret for ScoutMind SSO (must match ScoutMind's agents/.env)
# Without this, the SSO flow is disabled and the ScoutMind button will return 503
SSO_SECRET=your-shared-sso-secret-here

# Optional — ScoutMind base URL (defaults to http://localhost:8501)
SCOUTMIND_URL=http://localhost:8501
```

Only `ANTHROPIC_API_KEY` is strictly required. Without it, the `/api/chat` endpoint returns 503. Without `SSO_SECRET`, the ScoutMind SSO button is disabled.

---

## 16. Running the Application

```bash
python backend/server.py
```

The server starts at `http://localhost:5000`. Flask serves all static files (HTML, CSS, JS, assets) directly — no separate frontend build step is needed.

On first launch:
1. The SQLite database is created at `backend/lsa.db`
2. The schema is applied
3. Seed data is inserted (4 districts, 19 groups, ~210+ role accounts)
4. Four idempotent migrations run to add any missing columns

Open `http://localhost:5000` in your browser to reach the login page.

---

## 17. Seed Data

The database is seeded with a complete organizational structure representing the real LSA hierarchy.

### Districts (4)

| ID | Name |
|---|---|
| 1 | Beirut |
| 2 | Bekaa |
| 3 | Mount Lebanon |
| 4 | South |

### Groups (19)

| Code | Name | District |
|---|---|---|
| BEI-B1 through BEI-B7 | B1, B2, B3, B4, B7 | Beirut |
| BEK-Z1 through BEK-Z5 | Z1 (Zahlé) through Z5 | Bekaa |
| MNT-B1, MNT-R1, MNT-A1, MNT-M1 | Brumana, Rabieh, Aley, Monsef | Mount Lebanon |
| STH-S1, STH-S4 through STH-S6, STH-H1 | Saida, S4, S5, S6, Hasbaya | South |

### Role Types per Group (8 per group)

| Role | Dashboard | Level | Color |
|---|---|---|---|
| Group Leader | leader | group | None |
| Administrative Leader | leader | group_admin | None |
| Beavers/Pinks Leader | leader | group | pink |
| Cubs/Yellow Unit Leader | leader | group | yellow |
| Boy Scouts Troop Leader | leader | group | green |
| Girl Scouts Troop Leader | leader | group | green |
| Rovers Crew Leader | leader | group | red |
| Pioneers Crew Leader | leader | group | red |

### District Roles (10 per district)

6 functional/management roles (Commissioner, Admin, Music, PR, Finance, Leadership Development) + 4 color roles (pink, yellow, green, red assistant commissioners).

### GC Roles (11 total)

3 management (General Commissioner, Deputy, Admin) + 4 functional (Leadership Dev, Finance, PR, Music) + 4 color commissioners.

### EC Roles (7 total)

Honorary President, President, VP General Development, Secretary, Treasurer, Advisor, Assistant.

All seeded accounts use the password `123` and have placeholder emails in the format `username@lsa.lb`. Real users should update their email and password through the profile page.

---

## 18. API Performance Benchmarks

All measurements taken against a local Flask development server (`python backend/server.py`) with the SQLite database pre-seeded with 210+ role accounts across 4 districts and 19 groups. Each endpoint was called 10 times; the AI chat endpoint was called 3 times. Timings reflect end-to-end round-trip from the Python client — no browser overhead included.

**Test environment:** Windows 11, Python 3.10.11, Flask 3.x, SQLite (local file), Anthropic Claude Haiku (`claude-haiku-4-5-20251001`)

### Authentication & Profile

| Test | Min | Avg | Max | p95 |
|---|---|---|---|---|
| POST `/api/auth/login` — SHA-256 verify + JWT sign | 3.4 ms | 15.0 ms | 27.7 ms | 27.7 ms |
| GET `/api/auth/me` — JWT decode + DB lookup | 3.5 ms | 9.9 ms | 27.7 ms | 27.7 ms |

### Data Queries (Scoped)

| Test | Min | Avg | Max | p95 |
|---|---|---|---|---|
| GET `/api/stats` — role-scoped aggregation | 3.8 ms | 10.0 ms | 26.9 ms | 26.9 ms |
| GET `/api/events` — scoped event list | 3.5 ms | 7.9 ms | 16.6 ms | 16.6 ms |
| GET `/api/reports` — scoped report list | 3.2 ms | 12.8 ms | 21.5 ms | 21.5 ms |
| GET `/api/users` — group leader (own group only) | 3.7 ms | 14.0 ms | 28.1 ms | 28.1 ms |
| GET `/api/users` — district admin (all groups in district) | 4.6 ms | 17.2 ms | 36.5 ms | 36.5 ms |
| GET `/api/users` — GC admin (council-wide, all 210+ users) | 6.9 ms | 16.9 ms | 32.7 ms | 32.7 ms |

### Writes

| Test | Min | Avg | Max | p95 |
|---|---|---|---|---|
| POST `/api/events` — submit event request | 8.8 ms | 27.4 ms | 31.8 ms | 31.8 ms |

### Static File Serving

| Test | Min | Avg | Max | p95 |
|---|---|---|---|---|
| GET `/` — index.html | 2.4 ms | 7.2 ms | 45.3 ms | 45.3 ms |

### AI Chat (Claude Haiku)

| Test | Min | Avg | Max | p95 |
|---|---|---|---|---|
| POST `/api/chat` — single message, context-aware response | 1310.2 ms | 1581.6 ms | 1935.5 ms | 1935.5 ms |

### Analysis

**All non-AI endpoints respond in under 37 ms** at p95, confirming that the SQLite + Flask stack is fast enough for this organizational scale. The GC admin user list query (210+ users, cross-district JOIN) runs in 16.9 ms average — only marginally slower than a single-group query — demonstrating that scoped filtering adds negligible overhead at this data size.

**Event submission** (27.4 ms avg) is the slowest non-AI write operation, reflecting the INSERT + commit cycle on SQLite with `PRAGMA foreign_keys = ON`.

**Claude Haiku** averages **1.58 seconds** end-to-end including network round-trip to the Anthropic API, which is well within acceptable bounds for a chat interface. The 1.3–1.9 s range reflects natural variance in LLM inference latency.

---

## 19. Future Work

### 1. Email Notifications

When an event request is forwarded or rejected, the submitter currently has no notification outside the portal. Future versions should send email notifications at each approval step using an SMTP integration, keeping leaders informed without requiring them to check the portal.

### 2. Push Notifications

For mobile users, browser push notifications would allow real-time alerts for pending reviews, approvals, and new content without polling.

### 3. Multi-Role Support

The current identity model allows one active role per person. A future enhancement could allow a person to hold multiple roles simultaneously (e.g., a Group Leader who is also a District Music Commissioner) and switch between contexts in the UI.

### 4. File Attachments

Event requests and reports currently accept only text fields. Future versions should support file attachments (photos, PDFs, documents) stored in object storage and linked to records.

### 5. Analytics Dashboard

Administrators at district and GC level would benefit from aggregate analytics: event frequency by group, approval cycle times, content reach rates, and member engagement. A read-only analytics view could be built on top of the existing data without schema changes.

### 6. Mobile Application

The current portal is a responsive web app. A dedicated mobile application (React Native or Flutter) would improve the experience for leaders in the field, with offline support for drafting event requests and reports without connectivity.

### 7. Arabic Language Support

Many LSA leaders and members work primarily in Arabic. Future versions should support Arabic-language content, RTL layout, and an Arabic AI assistant prompt to make the portal accessible to all members regardless of language preference.

### 8. Annual Event Calendar

A shared calendar view showing all approved events across a district or the full council would help administrators avoid scheduling conflicts and give members visibility into upcoming activities.

*The LSA Portal is built as a university software engineering project demonstrating full-stack web development, hierarchical authorization, and AI assistant integration in a real-world organizational context.*
