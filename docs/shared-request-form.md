# shared-request-form.js

Shared logic for the event request submission form (`sec-send-request`), used by the leader, gc, and district dashboards.

## Functions

| Function | Description |
|---|---|
| `submitCommsRequest()` | Validates fields, POSTs to `/api/events`, shows success/error alert, calls `clearCommsRequestForm()` and `loadComms()` |
| `clearCommsRequestForm()` | Clears all `cr-*` inputs; resets approval level to `selectedIndex = 0` |

## Dependencies

These globals must be defined by the loading dashboard's script **before** this file loads:

| Global | Provided by |
|---|---|
| `api(method, url, body)` | leader.js / gc.js / district.js |
| `loadComms()` | leader.js / gc.js / district.js |

## Script loading order

```html
<script src="scripts/<dashboard>.js"></script>
<script src="scripts/report-detail.js"></script>
<script src="scripts/shared-report-form.js"></script>
<script src="scripts/shared-request-form.js"></script>
```

## Per-dashboard differences (HTML only)

The approval-level dropdown (`<select id="cr-approval-level">`) is defined in each dashboard's HTML and is never modified by this script beyond reading its value. `clearCommsRequestForm()` uses `selectedIndex = 0` so each dashboard retains its own default.

| Dashboard | Default approval level | Options available |
|---|---|---|
| leader | district | group, district, gc, ec |
| district | gc | gc, ec |
| gc | ec | ec |

## Adding fields

1. Add the input to the `sec-send-request` form in each relevant HTML file (use the `cr-` prefix).
2. Add the field to the `api('POST', '/api/events', {...})` call in `submitCommsRequest()`.
3. Add the field's ID to the `forEach` clear list in `clearCommsRequestForm()` if it needs resetting.
4. Update the backend (`/api/events` POST handler and the `events` table) if it's a new column.
