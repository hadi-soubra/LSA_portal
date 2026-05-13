# Structured Report Form — Change Documentation

## Problem

The old report form was a single textarea labelled "Report Body" with no structure. Reviewers receiving a report had no consistent way to find key information (who attended, what happened, was there a safety incident, what was the budget). There was also no way to view a submitted report after the fact — once sent, it was gone from the UI.

Additionally, the submit/clear/populate logic for the report form was duplicated across `leader.js`, `gc.js`, and `district.js`, meaning any change had to be made three times.

---

## What Was Built

### Backend — `backend/db.py`

#### `migrate_reports_v2()`

Idempotent migration that adds 13 structured columns to the `reports` table:

| Column | Type | Purpose |
|---|---|---|
| `leaders_count` | INTEGER | Number of leaders who attended |
| `members_count` | INTEGER | Number of members/scouts who attended |
| `guests_count` | INTEGER | Number of guests who attended |
| `objectives` | TEXT | Goals of the activity |
| `outcomes` | TEXT | What was achieved |
| `challenges` | TEXT | Difficulties encountered |
| `safety_incident` | INTEGER (bool) | Whether a safety incident occurred |
| `safety_details` | TEXT | Details if safety_incident is true |
| `budget_planned` | TEXT | Planned budget |
| `budget_actual` | TEXT | Actual budget spent |
| `recommendations` | TEXT | Suggestions for future activities |
| `photos_taken` | INTEGER (bool) | (reserved, unused in UI) |
| `photos_count` | INTEGER | (reserved, unused in UI) |

Safe to run multiple times — uses `PRAGMA table_info` to skip existing columns.

---

### Backend — `backend/server.py`

#### `POST /api/reports` (updated)

INSERT now writes all 11 active structured fields alongside the existing `title`, `body`, `request_id`, `required_approval_level`.

#### `GET /api/reports/<id>` (new)

Returns a single report with submitter details joined in:

```
submitter_name, submitter_color, submitter_role_title,
submitter_group, submitter_district,
request_title, request_location, request_start_date, request_end_date
```

**Access control:**
- Own submission — always allowed
- Admin dashboard users — allowed
- Group leaders without a color (group-level reviewers) — allowed if same group
- District/GC/EC users — allowed

Fixed a bug where district/gc/ec users were blocked from viewing reports they had approved.

---

### New File — `scripts/report-detail.js`

Shared across leader, gc, district, ec dashboards. Depends on globals defined by the loading dashboard script: `api()`, `escHtml()`, `fmtDate()`, `STATUS_BADGE_RPT`.

| Function | Description |
|---|---|
| `openReportDetail(id)` | Fetches `GET /api/reports/<id>`, opens modal, renders document HTML, populates print area. Sets print filename. |
| `closeReportDetail()` | Removes `open` class from modal overlay |
| `printReport()` | Sets `document.title` to `Report - {title} - {date}`, calls `window.print()`, restores title |
| `renderReportDetailHTML(r)` | Returns the full formatted document HTML — LSA header with logo, participant grid, all structured sections |

The print area (`#report-print-area`) is hidden on screen via CSS and shown only during `window.print()`. The modal and print area receive identical HTML so what you see in the modal is exactly what prints.

---

### New File — `scripts/shared-report-form.js`

Extracted from the three dashboard scripts to eliminate duplication. Depends on `api()`, `escHtml()`, `eligibleRequests`, `loadComms()` (all defined per-dashboard before this file loads).

| Function | Description |
|---|---|
| `populateReportRequestDropdown()` | Fills `#crpt-request` with approved requests that have no report yet |
| `onReportRequestChange()` | Shows location/date info below the dropdown when a request is selected |
| `toggleSafetyDetails()` | Shows/hides the safety details textarea based on the safety incident checkbox |
| `submitCommsReport()` | Validates, POSTs to `/api/reports`, shows toast + green card flash on success |
| `clearCommsReportForm()` | Resets all `crpt-*` inputs; uses `selectedIndex = 0` so each dashboard keeps its own approval-level default |

**Script loading order (all three dashboards):**
```html
<script src="scripts/<dashboard>.js"></script>
<script src="scripts/report-detail.js"></script>
<script src="scripts/shared-report-form.js"></script>
```

---

### HTML — Report Form (leader.html, gc.html, district.html)

`sec-send-report` was replaced with a structured multi-section form using `crpt-` prefixed IDs:

**Section: Linked Activity**
- `crpt-request` — dropdown of approved requests without a report
- `crpt-activity-info` — auto-filled location/date info on selection
- `crpt-no-requests` — shown if no eligible requests exist

**Section: Report Info**
- `crpt-title`, `crpt-approval-level`

**Section: Participation**
- `crpt-leaders-count`, `crpt-members-count`, `crpt-guests-count`

**Section: Activity**
- `crpt-objectives` (what you planned), `crpt-body` (what happened — required)

**Section: Outcomes**
- `crpt-outcomes`, `crpt-challenges`

**Section: Safety**
- `crpt-safety-incident` (checkbox), `crpt-safety-details-group` / `crpt-safety-details` (conditional)

**Section: Budget**
- `crpt-budget-planned`, `crpt-budget-actual`

**Section: Recommendations**
- `crpt-recommendations`

The approval-level options differ per dashboard — this is intentional and `clearCommsReportForm()` never hardcodes the default value.

---

### HTML — Report Detail Modal (all four dashboards)

Added to leader.html, gc.html, district.html, ec.html:

```html
<div class="modal-overlay" id="report-detail-modal"> … </div>
<div id="report-print-area"></div>
```

---

### CSS — `styles/shared.css`

Added `.rpt-*` document styles used by `renderReportDetailHTML()`:
- `.rpt-doc`, `.rpt-header`, `.rpt-logo`, `.rpt-title`, `.rpt-meta-row`
- `.rpt-section`, `.rpt-section-title`, `.rpt-field-row`, `.rpt-field-label`, `.rpt-field-value`
- `.rpt-participation-grid`, `.rpt-stat`, `.rpt-body-text`
- `.rpt-footer`, `.rpt-sig-*`
- `#report-print-area { display: none }` + `@media print` block

Moved `.form-section-label` from `leader.css` to `shared.css`.

---

### JS — Functions Removed from Dashboard Scripts

The following functions were deleted from `leader.js`, `gc.js`, and `district.js` (now live in shared scripts):

- `submitCommsReport()`
- `clearCommsReportForm()`
- `populateReportRequestDropdown()`
- `onReportRequestChange()`
- `toggleSafetyDetails()`

Each dashboard still owns: `api()`, `escHtml()`, `fmtDate()`, `STATUS_BADGE_RPT`, `eligibleRequests`, `loadComms()`.

---

### View Buttons on Sent Reports

`renderSentReports()` in all three dashboard scripts was updated to include a "View" button on each report card that calls `openReportDetail(id)`.

---

## Files Changed

| File | Change |
|---|---|
| `backend/db.py` | Added `migrate_reports_v2()` |
| `backend/server.py` | Updated `POST /api/reports`; added `GET /api/reports/<id>`; fixed district/gc/ec access control |
| `scripts/report-detail.js` | New — shared modal + print logic |
| `scripts/shared-report-form.js` | New — shared form logic |
| `scripts/leader.js` | Removed 5 duplicated functions; added View button to sent reports |
| `scripts/gc.js` | Same |
| `scripts/district.js` | Same |
| `leader.html` | Replaced report form; added modal + print area; added script tags |
| `gc.html` | Same |
| `district.html` | Same |
| `ec.html` | Added report detail modal + print area + script tag |
| `styles/shared.css` | Added `.rpt-*` styles, print block, `.form-section-label` |
| `styles/leader.css` | Removed `.form-section-label` (moved to shared) |
| `docs/shared-report-form.md` | New — dependency and usage documentation |

---

## Testing

**Submit a report (as a leader):**
1. Log in as a group leader — submit and get an event request approved first
2. Navigate to Send Report
3. Select the approved activity from the dropdown — location/date should auto-fill below
4. Fill in participation counts, objectives, body (required), outcomes, etc.
5. Check "Safety incident" — details textarea should appear
6. Submit — green card flash + success toast with a "View" button should appear
7. Click View in the toast or find the report in Sent Reports History and click View
8. Report detail modal opens with LSA header, all sections populated
9. Click Print / Save as PDF — filename should be `Report - {title} - {date}`

**Validation:**
- Submitting without title or body → red card flash + inline error
- Submitting without a linked activity → red card flash + inline error
