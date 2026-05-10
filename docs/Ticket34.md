# Member Content — Change Documentation

## Problem

The member dashboard (`member.html`) had Info, Education, and Promotion sections in the sidebar but they were completely empty — no API, no data, nothing rendered. Similarly, every admin and leader dashboard had "Send Content" sections that were also entirely unimplemented. Content sent by leaders and admins had nowhere to go and no one to receive it.

Additionally, the `create_user` endpoint had two bugs that silently prevented member creation:
- `username` column (NOT NULL) was never set on the `users` row
- `password_hash` column (NOT NULL) was never set on the `users` row

Both bugs caused a database constraint error whenever a leader tried to add a member.

---

## What Was Built

### Backend — `backend/server.py`

#### `POST /api/content`
Allows leaders and admins to send content items to members or leaders.

**Access:** Any `leader` or `admin` dashboard user.

**Request body:**
```json
{
  "title": "Pink Unit Camping Trip",
  "body": "Join us this weekend at the cedar forest.",
  "content_type": "notification | training | activity | resource",
  "target_colors": ["pink", "yellow"] | null,
  "target_recipient_type": "members | leaders | both"
}
```

**Scoping by sender level:**

| Sender level | Auto-scope applied |
|---|---|
| `group` / `group_admin` | `target_group_ids = [sender.group_id]` |
| `district` | `target_district_ids = [sender.district_id]` |
| `gc` / `ec` | No spatial restriction (national) |

`target_colors: null` means the content targets all units. A populated list restricts it to only those unit colors.

---

#### `GET /api/member/content`
Returns content items visible to the authenticated member, filtered by their unit, group, and district.

**Access:** `member` dashboard users only.

**Filtering logic (all conditions must pass):**

| Field | Rule |
|---|---|
| `target_recipient_type` | Must be `members` or `both` |
| `target_colors` | If set, member's `color` must be in the list. If null, passes. |
| `target_district_ids` | If set, member's `district_id` must be in the list. If null, passes. |
| `target_group_ids` | If set, member's `group_id` must be in the list. If null, passes. |

Results are ordered newest first.

---

#### Bug fix: `create_user` — missing `username` and `password_hash`
Both the group-leader path and the admin path in `POST /api/users` were inserting into the `users` table without setting `username` or `password_hash`, which are `NOT NULL`. The fix auto-generates `username` from the email local part (e.g. `sara@test.lb` → `username = sara`) and sets `password_hash` from the provided password.

---

### Frontend — `scripts/member.js`

Content sections now lazy-load when the user navigates to them.

**Content type → section mapping:**

| Section | Content types shown |
|---|---|
| Info | `notification`, `resource` |
| Education | `training` |
| Promotion | `activity` |

Content is fetched once and cached in `_contentCache`. Navigating between sections does not trigger additional API calls.

Each item renders as a card showing title, date, body text, and sender name. An empty state message is shown when no content is available.

---

### Frontend — `scripts/leader.js`, `scripts/gc.js`, `scripts/ec.js`, `scripts/district.js`

All four dashboards now render a send form when the user first navigates to "Send to Members" or "Send to Leaders". The form is injected once into the empty section div and not re-rendered on subsequent visits (`_initedContentSections` set tracks this).

**Send form fields:**
- Title (required)
- Message body
- Category: Info / Announcement → `notification`, Education / Training → `training`, Promotion / Activity → `activity`
- Target Units checkboxes: Pink / Yellow / Green / Red (leave unchecked to send to all units)

The backend auto-scopes the spatial targeting based on the sender's role level (see table above).

---

## Files Changed

| File | Change |
|---|---|
| `backend/server.py` | Added `POST /api/content`, `GET /api/member/content`; fixed `username` + `password_hash` in `create_user` |
| `scripts/member.js` | Added `_fetchContent()`, `renderContentSection()`, hooked into `showSection` |
| `scripts/leader.js` | Added `renderContentSendForm()`, `submitContent()`, hooked into `showSection` |
| `scripts/gc.js` | Same as leader.js |
| `scripts/ec.js` | Same as leader.js |
| `scripts/district.js` | Same as leader.js |

---

## Testing

**Send content (as a leader):**
1. Log in as any group leader (e.g. `bei_b1_pinks_leader@lsa.lb` / `123`)
2. Navigate to Content → Send to Members
3. Fill in a title, body, pick a category, optionally check unit colors
4. Click Send — success toast should appear

**Receive content (as a member):**
1. Log in as a member in the same group with a matching unit color
2. Navigate to Content → Info / Education / Promotion depending on category sent
3. Content card should appear with title, date, body, and sender name

**Filtering verification:**
- Send content targeted to `yellow` only → a `pink` member should NOT see it
- Send content with no color filter → all members in the group should see it
- A district admin sending content scopes to their whole district, not just one group
