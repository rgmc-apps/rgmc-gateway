# Handoff

## Goal

Maintain and extend the **RGMC Gateway** — an internal Flask web portal for RGMC Group that serves as a central hub for:
- Accessing internal systems (RGMC, SBIC, NAV Sites, Windows-based apps, task launchers)
- Submitting IT helpdesk tickets and general helpdesk requests
- Admin management of users, access requests, systems, and configuration tables
- Issue tracking with rich resolution workflows (actions, dev items, tasks, common fixes)
- Developer board with Kanban, list view, analytics, and epics

The portal uses Flask + Supabase (PostgREST API) for the backend and vanilla JS + HTML/CSS for the frontend. No build step — everything is served directly from Flask.

---

## Current State

**Working tree is clean — all changes committed.** Last commit: `4d02f67 added developer transfer item`.

All features added in recent sessions are fully implemented and committed:

1. **Epic Sections** (`5d1e439`) — Active Epics / other / Done Epics sections in the epics view, with count badges per section.
2. **Epic Modal Redesign** (`4095370`) — Rich dev item cards in the epic modal (type badge, assignee avatar, date row). Status + Active in one row. Scoped CSS fixes so no fields are clipped or out-of-bounds.
3. **Resolution Remarks on Issues** (in `6f92217` or nearby) — `resolution_remarks` textarea shown on issues not linked to a task or dev item; saved to DB column added via Supabase migration.
4. **Promotion Notifications** — When promoting an issue to dev item/task/epic, always updates `assigned_to` on the issue, sends email (`send_issue_promoted_to_dev_email`, `send_issue_promoted_to_task_email`), and fires IT bot notification.
5. **Epic Modal Layout Fix** (`903667a`) — Scoped CSS overrides in `#epicDetailModal` fixed overflow clipping (`overflow: visible` on `.item-detail-form`), flex layout for `modal-body`, and `height: 42px` on `.epic-active-toggle`.
6. **Assign Dev Item to Developer** (`4d02f67`) — **Fully implemented.** Dev items can now be assigned to any developer (not just the creator). All views respect `assigned_to`: Kanban `mine` filter, list view `mine` filter, list view dev filter, sort by developer, dev dropdown in list filters, list row developer cell, parked items (mine + devF + cell display), analytics mine filter, epic item rows.

---

## Files Actively Being Edited

No files are mid-edit. All changes are committed. Key files modified across the recent feature sessions:

- `static/developer.js` — All developer board JS. Major changes: epic section rendering, `_renderEpicItemRow()` rich cards, `openDetailModal()` populated `#itemAssignedTo` select, `_execSaveItem()` sends `assigned_to`, Kanban `renderCard()` uses `assigned_to || created_by`, all list/parked/analytics `mine`+`devF` filters updated to include `assigned_to`, `_populateListFilters()` dev dropdown uses all `_members`.
- `static/css/dev-board.css` — Epic section styles, epic form styles, epic item card styles, scoped `#epicDetailModal` layout fixes.
- `templates/developer.html` — Epic sections HTML (`#epicSectionsWrap` with three section divs), `#itemAssignedTo` select added to item detail form before the Status row.
- `controllers/developer.py` — `dev_create_item` accepts and saves `assigned_to` (defaults to creator); `dev_update_item` allows patching `assigned_to`.
- `controllers/issues.py` — Promotion notifications added (email + IT bot) for both dev item and task promotions; `resolution_remarks` added to allowed patch set.
- `services/email.py` — `send_issue_promoted_to_dev_email()` and `send_issue_promoted_to_task_email()` added.
- `services/it_bot.py` — `notify_issue_promoted_to_dev()` and `notify_issue_promoted_to_task()` added.
- `templates/admin.html` — `#issueRemarksGroup` textarea added (shown only for unlinked issues).
- `static/admin.js` — `openIssueModal`: shows/hides `#issueRemarksGroup` based on whether issue is linked; `saveIssue` sends `resolution_remarks`.

**DB Migrations applied (Supabase):**
- `add_resolution_remarks_to_issues`: `ALTER TABLE issues ADD COLUMN IF NOT EXISTS resolution_remarks text;`
- `add_assigned_to_dev_items`: `ALTER TABLE dev_items ADD COLUMN IF NOT EXISTS assigned_to text REFERENCES users(username) ON DELETE SET NULL;`

---

## Failed Attempts

- **`_getSession()` not defined**: In `openDetailModal()`, used `_getSession()?.username` which doesn't exist in this codebase. Fixed to `loadSession()?.username`.
- **Epic modal dropdown clipping**: `sys-multi-dropdown` uses `position: absolute` inside `.item-detail-form` which had `overflow-y: auto`. CSS `overflow: auto/hidden/scroll` clips absolutely-positioned children regardless of z-index. Fixed by setting `overflow: visible` on the form column scoped to `#epicDetailModal`.
- **`epic-active-toggle` height mismatch**: Was `36px` while the select input renders at ~42px. Fixed to `height: 42px`.

---

## Next Step

The codebase is clean and fully up to date. The most useful next action is to **smoke-test the assign-to-developer feature on the live dev board**:

1. Open the Developer board → create or open a dev item
2. Change "Assigned To" to a different developer → save
3. Verify the item appears under that developer's filter in List view
4. Verify Kanban's "Mine" filter correctly shows items assigned to the current user (even if created by someone else)
5. Verify epic item rows show the correct assignee avatar/name

If all looks good, there is no pending work from recent sessions.

---

## Context & Gotchas

**Architecture:**
- Flask + Supabase (PostgREST) + Vanilla JS — no build step, no bundler
- CSS manifest: `static/style.css` imports all partials via `@import url('css/...')`. Add new CSS files to this manifest.
- `static/developer.js` is monolithic (~2100+ lines). Key globals: `_items` (all dev items), `_members` (`{username → {displayName, avatarUrl}}`), `_epics`, `_systems`, `_filter` (`'all'` or `'mine'`), `_viewMode` (`'kanban'`, `'list'`, `'analytics'`, `'epics'`).
- `static/admin.js` is monolithic (~1900+ lines). Key globals: `_issuesCache`, `_issFilteredRows`, `_currentIssueStatus`.

**`assigned_to` semantics:**
- `assigned_to` defaults to `created_by`/current user when creating items (set in `dev_create_item` in `controllers/developer.py`).
- All display and filter logic falls back to `created_by` when `assigned_to` is null: `item.assigned_to || item.created_by`.
- The `_members` object is keyed by `username` (not display name). Always look up via `_members[username]?.displayName`.

**Epic status values:** `planning`, `active`, `on_hold`, `done`, `cancelled`
- Active epics: status is `active` or `planning`
- Done epics: status is `done` or `cancelled`

**Epic modal overflow fix:**
- `#epicDetailModal .item-detail-form { overflow: visible; }` — this is the key fix that lets `sys-multi-dropdown` escape the scroll container. Do not revert this.
- The `sys-multi-dropdown` uses `position: absolute; z-index: 500` and works correctly as long as no ancestor has `overflow: hidden/auto/scroll`.

**Bot notifications:**
- `services/it_bot.py` → posts to `IT_BOT_URL/api/notify/ticket-updated`
- `services/email.py` → uses SMTP config in `EMAIL_CONFIG["developer_email"]`

**Auth pattern:**
- `_require_admin()` / `_require_developer()` in `services/guards.py`
- Session stored in `localStorage` under `rgmc_gateway_session`

**Supabase calls:**
- All DB access via `supabase_req(method, path, params, data, extra_headers)` in `services/supabase.py`
- PostgREST URL params: `"status": "eq.pending"`, `"order": "created_at.desc"`

**Systems cache:**
- `get_sites()` is memory-cached. After any system CRUD, call `_invalidate_sites_cache()`.

**Storage buckets:**
- Windows launcher/manifest files → `system-files` bucket
- Issue attachments and common-fix attachments → `issue-attachments` bucket

**User roles:**
- `is_admin`, `is_developer`, `is_management`, `is_department_head` are boolean columns on `users` table.

**Supabase MCP:**
- DB migrations can be applied via `mcp__supabase__apply_migration`. Available for future schema changes.
