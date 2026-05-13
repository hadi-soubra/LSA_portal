# shared-report-form.js

Shared report submission form logic used by the **leader**, **gc**, and **district** dashboards. Extracted to avoid duplicating the same form functions across three scripts.

## Functions

| Function | Purpose |
|---|---|
| `populateReportRequestDropdown()` | Fills the linked-activity select from `eligibleRequests` |
| `onReportRequestChange()` | Shows location/date info bar when an activity is selected |
| `toggleSafetyDetails()` | Shows/hides the incident details textarea |
| `submitCommsReport()` | Validates and POSTs the structured report form |
| `clearCommsReportForm()` | Resets all form fields to empty/default state |

## Dependencies

These globals must be defined by the dashboard script loaded before this file:

- `api(method, url, body)` — fetch wrapper with auth header
- `escHtml(str)` — HTML escape helper
- `eligibleRequests` — array of approved requests without a report, populated by `loadComms()`
- `loadComms()` — called after successful submit to refresh all lists

`openReportDetail(id)` is provided by `report-detail.js`, which must also be loaded.

## Loading order (in each HTML)

```html
<script src="scripts/<dashboard>.js"></script>
<script src="scripts/report-detail.js"></script>
<script src="scripts/shared-report-form.js"></script>
```

## Per-dashboard differences

The only thing that differs between dashboards is the **approval level dropdown options**, defined directly in each HTML file:

- **leader**: district / gc / ec
- **district**: gc / ec
- **gc**: ec only

`clearCommsReportForm()` resets the dropdown to `selectedIndex = 0` (first option) rather than hardcoding a value, so each dashboard keeps its own natural default.

## Adding a new shared field

1. Add the input to the form HTML in each dashboard's HTML file (same `id`)
2. Add the field to the `api('POST', ...)` payload in `submitCommsReport()`
3. Add the `id` to the reset list in `clearCommsReportForm()`
4. Add the DB column in `db.py` (`migrate_reports_vN`) and to the INSERT in `server.py`
5. Add it to `renderReportDetailHTML()` in `report-detail.js`
