# Better Request Form — Change Documentation

## Problem

The old event request form had seven fields in a flat layout: title, description, dates, location, participant count (single number), approval level, and notes. This was too minimal for a scouts organisation — reviewers had no visibility into activity type, expected breakdown of leaders vs members, transport needs, or budget. There was also no way to view a submitted request after sending it, and no visual feedback on form submission.

Additionally, `submitCommsRequest()` and `clearCommsRequestForm()` were duplicated across `leader.js`, `gc.js`, and `district.js`.

---

## What Was Built

### Backend — `backend/db.py`

#### `migrate_events_v2()`

Idempotent migration adding 9 new columns to `event_requests`:

| Column | Type | Purpose |
|---|---|---|
| `activity_type` | TEXT | Camping / Day Trip / Training / Community Service / Meeting / Competition / Cultural Event / Other |
| `start_time` | TEXT | Time the activity starts |
| `end_time` | TEXT | Time the activity ends |
| `leaders_count` | INTEGER | Expected number of leaders |
| `members_count` | INTEGER | Expected number of members/scouts |
| `guests_count` | INTEGER | Expected number of guests |
| `transport_needed` | INTEGER (bool) | Whether transport is required |
| `transport_details` | TEXT | Transport arrangements (shown only if transport_needed) |
| `budget_estimated` | TEXT | Estimated budget (free-text to allow LBP/USD/ranges) |

Safe to run multiple times — uses `PRAGMA table_info` to skip existing columns.

---

### Backend — `backend/server.py`

#### `POST /api/events` (updated)

INSERT now writes all 9 new fields alongside the existing ones. The old single `participants` column is no longer written to (kept in DB for backward compatibility with old records).

#### `GET /api/events/<id>` (new)

Returns a single event request with submitter details joined in:

```
submitter_name, submitter_color, submitter_role_title,
submitter_group, submitter_district
```

**Access control:**
- Own submission — always allowed
- Admin dashboard users (district/gc/ec) — allowed
- Group leaders without a color (group-level reviewers) — allowed if same group

---

### New File — `scripts/request-detail.js`

Shared across leader, gc, district, ec dashboards. Depends on `api()`, `escHtml()`, `fmtDate()`, `STATUS_BADGE` (all defined per-dashboard before this file loads).

| Function | Description |
|---|---|
| `openRequestDetail(id)` | Fetches `GET /api/events/<id>`, opens modal, renders document HTML, populates print area. Sets print filename. |
| `closeRequestDetail()` | Removes `open` class from modal overlay |
| `printRequest()` | Sets `document.title` to `Request - {title} - {start_date}`, calls `window.print()`, restores title |
| `renderRequestDetailHTML(r)` | Returns full formatted document HTML — LSA header, participant grid, all structured sections |

PDF filename falls back to submitted date if no start date is set.

Both `printReport()` and `printRequest()` clear the other dashboard's print area before printing, so they never bleed into each other.

---

### New File — `scripts/shared-request-form.js`

Extracted from the three dashboard scripts. Depends on `api()`, `loadComms()`, and `toast()` (all defined per-dashboard).

| Function | Description |
|---|---|
| `setRequestDateToday()` | Sets `#cr-date` to today's ISO date |
| `toggleTransportDetails()` | Shows/hides transport details textarea based on checkbox |
| `submitCommsRequest()` | Validates fields and dates, POSTs to `/api/events`, shows toast + green flash on success |
| `clearCommsRequestForm()` | Resets all `cr-*` inputs; uses `selectedIndex = 0` to preserve each dashboard's approval-level default |
| `_flashRequestCard(type)` | Internal — triggers green or red CSS animation on the form card |

**Date validation (before API call):**
- Start date is required and cannot be in the past
- End date, if set, cannot be before start date
- Errors show inline in `#cr-alert` + red card flash

**Script loading order (all three dashboards):**
```html
<script src="scripts/<dashboard>.js"></script>
<script src="scripts/report-detail.js"></script>
<script src="scripts/request-detail.js"></script>
<script src="scripts/shared-report-form.js"></script>
<script src="scripts/shared-request-form.js"></script>
```

---

### HTML — Request Form (leader.html, gc.html, district.html)

`sec-send-request` was replaced with a structured multi-section form using `cr-` prefixed IDs:

**Section: Activity Info**
- `cr-title` (required), `cr-activity-type` (dropdown), `cr-date` (required) + Today button + `cr-time-start`, `cr-date-end` + `cr-time-end`, `cr-location` (required)

**Section: Participants**
- `cr-leaders-count`, `cr-members-count`, `cr-guests-count` — side by side in a form-row

**Section: Planning**
- `cr-desc` (objectives & description), `cr-materials` (equipment/supplies), `cr-transport` (checkbox) + `cr-transport-details-group` / `cr-transport-details` (conditional), `cr-budget`

**Section: Notes & Approval**
- `cr-notes`, `cr-approval-level`

The approval-level options differ per dashboard — clearCommsRequestForm() never hardcodes a value.

| Dashboard | Approval options |
|---|---|
| leader | Group Leader only, District Commissioner (default), GC, EC |
| district | GC Level (default), EC Level |
| gc | EC Level (only option) |

---

### HTML — Request Detail Modal (leader, gc, district, ec)

Added to all four dashboards:

```html
<div class="modal-overlay" id="request-detail-modal"> … </div>
<div id="request-print-area"></div>
```

`ec.html` previously had no request-side modal at all — both the modal and `request-detail.js` script tag were added.

---

### View Buttons — All Dashboards

A "View" button calling `openRequestDetail(id)` was added to every place where requests appear:

| Dashboard | Location | Button label |
|---|---|---|
| leader | Sent Requests History | View |
| leader | Inbox Requests Pending | 📋 View Request |
| leader | Inbox Requests History | View |
| leader | Tracker (Requests tab) | View |
| gc | Sent Requests History | View |
| gc | Inbox Requests Pending | 📋 View Request |
| gc | Inbox Requests History | View |
| gc | Tracker (Requests tab) | View |
| district | Sent Requests History | View |
| district | Pending Events cards | 📋 View Request |
| district | All Requests table | View |
| district | Inbox Requests Pending | 📋 View Request |
| district | Inbox Requests History | View |
| district | Tracker (Requests tab) | View |
| ec | Inbox Requests Pending | 📋 View Request |
| ec | Inbox Requests History | View |

Report "View" buttons (`openReportDetail`) were already present in most places from Ticket #15 — no gaps remained.

---

### CSS — `styles/shared.css`

**Card flash animations:**

```css
@keyframes cardFlashSuccess { /* green glow ring, 0.8s */ }
@keyframes cardFlashError   { /* red glow ring, 0.8s */  }
.card-flash-success { animation: cardFlashSuccess 0.8s ease forwards; }
.card-flash-error   { animation: cardFlashError   0.8s ease forwards; }
```

Triggered on the form card's `.card` element via `_flashRequestCard()` / `_flashReportCard()`.

**Print fix:**

```css
#report-print-area,
#request-print-area { display: none; }

@media print {
  body > *:not(#report-print-area):not(#request-print-area) { display: none !important; }
  #report-print-area, #request-print-area { display: block !important; … }
}
```

Previously only `#report-print-area` was in this rule, so `#request-print-area` content was rendering visibly on the page after opening a request detail.

---

### Visual Feedback

Both shared form scripts (`shared-request-form.js`, `shared-report-form.js`) now use:

- **Validation errors** — inline `alertEl` (stays visible so the user can see what to fix) + red card flash
- **API success** — `toast('Request submitted.', 'success')` + green card flash; alert div cleared
- **API errors** — `toast(error, 'danger')` + red card flash

The report success toast includes an inline "View" button that opens the detail modal directly.

---

### PDF Filename Fix

Before this ticket, `window.print()` used the browser default filename (usually the page URL).

Now both print functions temporarily set `document.title` before calling `window.print()` and restore it after:

| Document | Filename format |
|---|---|
| Report | `Report - {title} - {submitted date}` |
| Request | `Request - {title} - {event start date}` |

`window.print()` blocks until the dialog is dismissed, so restoring the title afterward is safe.

---

### JS — Functions Removed from Dashboard Scripts

Deleted from `leader.js`, `gc.js`, `district.js` (now in `shared-request-form.js`):
- `submitCommsRequest()`
- `clearCommsRequestForm()`

Each dashboard still owns: `api()`, `escHtml()`, `fmtDate()`, `STATUS_BADGE`, `loadComms()`, `toast()`.

---

## Files Changed

| File | Change |
|---|---|
| `backend/db.py` | Added `migrate_events_v2()` |
| `backend/server.py` | Updated `POST /api/events`; added `GET /api/events/<id>` |
| `scripts/request-detail.js` | New — shared modal + print logic |
| `scripts/shared-request-form.js` | New — shared form logic |
| `scripts/report-detail.js` | `printReport()` now sets document.title + clears request print area |
| `scripts/shared-report-form.js` | API results now use toast + flash; validation errors also flash |
| `scripts/leader.js` | Removed 2 duplicated functions; View buttons added to all request render functions |
| `scripts/gc.js` | Same |
| `scripts/district.js` | Same; View button also added to `renderPendingEvents()` and `renderAllEventsTable()` |
| `scripts/ec.js` | View buttons added to both request render functions |
| `leader.html` | Replaced request form; added request modal + print area; added script tags |
| `gc.html` | Same |
| `district.html` | Same |
| `ec.html` | Added request modal + print area + `request-detail.js` script tag |
| `styles/shared.css` | Card flash animations; fixed print area CSS |
| `docs/shared-request-form.md` | New — dependency and usage documentation |

---

## Testing

**Submit a request (as a leader):**
1. Log in as any group leader
2. Navigate to Send Request
3. Try submitting empty — red card flash + inline error
4. Set a past date — red card flash + inline "Start date cannot be in the past"
5. Click Today button — start date fills to today
6. Fill in title, activity type, location, participant counts, transport (check box — details field should appear), budget
7. Submit — green card flash + "Request submitted." toast
8. Find the request in Sent Requests History — click View
9. Request detail modal opens with LSA header, all fields populated
10. Click Print / Save as PDF — filename should be `Request - {title} - {start date}`

**View as a reviewer (district/gc/ec):**
1. Log in as a district/gc/ec admin and navigate to Inbox → Requests
2. Pending request cards now have a 📋 View Request button
3. Clicking it opens the full request detail — activity type, participant breakdown, transport, budget all visible
4. History cards also have a View button
