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

**Working tree is clean — all changes committed.** Last commit: `9081348 added report issue fix`.

All features added in recent sessions are fully implemented and committed:

1. **Assign Dev Item to Developer** (`4d02f67`) — Dev items can be assigned to any developer (not just the creator). All views respect `assigned_to`: Kanban `mine` filter, list view `mine` filter, list view dev filter, sort by developer, dev dropdown in list filters, list row developer cell, parked items, analytics mine filter, epic item rows.

2. **Epic Design Improvements** (`4095370`) — Rich epic item cards in the epic modal (type badge, assignee avatar, date row). Status + Active toggle in one row. Scoped CSS for `#epicDetailModal` prevents overflow clipping.

3. **Promotion Notifications** (`6f92217`) — When promoting an issue to dev item or task:
   - `assigned_to` on the issue is **always overwritten** (not just when empty)
   - Email sent to IT team via `send_issue_promoted_to_dev_email` / `send_issue_promoted_to_task_email`
   - Assignment email sent to the assigned developer via `send_issue_assigned_email`
   - IT bot notified via `notify_issue_promoted_to_dev` / `notify_issue_promoted_to_task`
   - `resolution_remarks` field added to the allowed patch set for issues

4. **Resolution Remarks on Issues** (`6f92217`) — `#issueRemarksGroup` textarea in admin.html shown only for issues not linked to a task or dev item. `admin.js` toggles visibility and sends `resolution_remarks` on save.

5. **Epic Active Sections CSS** (`903667a`) — Additional CSS for active epic sections styling in `static/css/dev-board.css`.

6. **Report Issue Form Fix** (`9081348`) — `static/report_issue.js` fixed subcategory group visibility logic: when `?system=` param is present, `riSubcategoryGroup` is hidden immediately (before categories load) so the form never silently rejects submission due to a missing `riSiteName` value while the async fetch is in flight.

---

## Files Actively Being Edited

No files are mid-edit. All changes are committed. Key files modified across the recent feature sessions:

- `static/developer.js` — All developer board JS. Major changes: epic section rendering, `_renderEpicItemRow()` rich cards, `openDetailModal()` populated `#itemAssignedTo` select, `_execSaveItem()` sends `assigned_to`, Kanban `renderCard()` uses `assigned_to || created_by`, all list/parked/analytics `mine`+`devF` filters updated to include `assigned_to`, `_populateListFilters()` dev dropdown uses all `_members`.
- `static/css/dev-board.css` — Epic section styles, epic form styles, epic item card styles, scoped `#epicDetailModal` layout fixes.
- `templates/developer.html` — Epic sections HTML (`#epicSectionsWrap` with three section divs), `#itemAssignedTo` select added to item detail form before the Status row.
- `controllers/developer.py` — `dev_create_item` accepts and saves `assigned_to` (defaults to creator); `dev_update_item` allows patching `assigned_to`.
- `controllers/issues.py` — Promotion notifications added (email + IT bot) for both dev item and task promotions; `assigned_to` on issue always overwritten on promote; `resolution_remarks` added to allowed patch set.
- `services/email.py` — `send_issue_promoted_to_dev_email()` and `send_issue_promoted_to_task_email()` added.
- `services/it_bot.py` — `notify_issue_promoted_to_dev()` and `notify_issue_promoted_to_task()` added.
- `templates/admin.html` — `#issueRemarksGroup` textarea added (shown only for unlinked issues).
- `static/admin.js` — `openIssueModal`: shows/hides `#issueRemarksGroup` based on whether issue is linked; `saveIssue` sends `resolution_remarks`.
- `static/report_issue.js` — Subcategory group visibility set immediately on page load (before async category fetch) when `?system=` param is present, preventing silent form rejection.

**DB Migrations applied (Supabase):**
- `add_resolution_remarks_to_issues`: `ALTER TABLE issues ADD COLUMN IF NOT EXISTS resolution_remarks text;`
- `add_assigned_to_dev_items`: `ALTER TABLE dev_items ADD COLUMN IF NOT EXISTS assigned_to text REFERENCES users(username) ON DELETE SET NULL;`

---

## Failed Attempts

- **`_getSession()` not defined**: In `openDetailModal()`, used `_getSession()?.username` which doesn't exist in this codebase. Fixed to `loadSession()?.username`.
- **Epic modal dropdown clipping**: `sys-multi-dropdown` uses `position: absolute` inside `.item-detail-form` which had `overflow-y: auto`. CSS `overflow: auto/hidden/scroll` clips absolutely-positioned children regardless of z-index. Fixed by setting `overflow: visible` on the form column scoped to `#epicDetailModal`.
- **`epic-active-toggle` height mismatch**: Was `36px` while the select input renders at ~42px. Fixed to `height: 42px`.
- **Report issue `riSiteName` silent failure**: When `?system=` param is in the URL the subcategory group (`riSubcategoryGroup`) must be hidden and `riSiteName` pre-filled before categories are loaded. The original code did this after the async fetch, leaving a window where `riSiteName` was empty and submission silently failed. Fixed by moving the visibility toggle above the `await _fetchAndPopulateCategories()` call.
- **Promote issue `assigned_to` not updating**: Original code used `if not issue.get("assigned_to")` guard, so re-assigning a previously-assigned issue didn't update `assigned_to`. Fixed by removing the guard — `assigned_to` is always overwritten on promote.

---

## Next Step

The codebase is clean and fully up to date. The most useful next action is to **smoke-test the report issue fix and promotion notifications end-to-end**:

1. **Report Issue fix**: Navigate to `/report-issue?system=SomeName` — verify the form loads with the subcategory group hidden, the system strip shown, and that submitting without filling the description shows an error (not a silent fail).
2. **Promotion notifications**: In admin panel, open an existing issue → Promote to Dev Item (assign to a developer) → verify:
   - The issue's `assigned_to` is updated to the new developer (not the previous value)
   - IT team receives `send_issue_promoted_to_dev_email`
   - Assigned developer receives assignment email
   - IT bot is notified
3. **Assign dev item**: On the Developer board, open an existing item → change "Assigned To" to a different developer → save → verify list/kanban filters reflect the new assignee.

---

## Context & Gotchas

**Architecture:**
- Flask + Supabase (PostgREST) + Vanilla JS — no build step, no bundler
- CSS manifest: `static/style.css` imports all partials via `@import url('css/...')`. Add new CSS files to this manifest.
- `static/developer.js` is monolithic (~2200+ lines). Key globals: `_items` (all dev items), `_members` (`{username → {displayName, avatarUrl}}`), `_epics`, `_systems`, `_filter` (`'all'` or `'mine'`), `_viewMode` (`'kanban'`, `'list'`, `'analytics'`, `'epics'`).
- `static/admin.js` is monolithic (~1900+ lines). Key globals: `_issuesCache`, `_issFilteredRows`, `_currentIssueStatus`.

**`assigned_to` semantics (dev items):**
- `assigned_to` defaults to `created_by`/current user when creating items (set in `dev_create_item` in `controllers/developer.py`).
- All display and filter logic falls back to `created_by` when `assigned_to` is null: `item.assigned_to || item.created_by`.
- The `_members` object is keyed by `username` (not display name). Always look up via `_members[username]?.displayName`.

**`assigned_to` semantics (issues):**
- During promotion to dev item or task, `assigned_to` on the issue is **always** overwritten regardless of whether the issue already had an assignee. This is intentional — the promoter picks who handles it.

**Epic status values:** `planning`, `active`, `on_hold`, `done`, `cancelled`
- Active epics (shown in Active section): status is `active` or `planning`
- Done epics (shown in Done section): status is `done` or `cancelled`

**Epic modal overflow fix:**
- `#epicDetailModal .item-detail-form { overflow: visible; }` — this is the key fix that lets `sys-multi-dropdown` escape the scroll container. Do not revert this.
- The `sys-multi-dropdown` uses `position: absolute; z-index: 500` and works correctly as long as no ancestor has `overflow: hidden/auto/scroll`.

**Report issue subcategory group:**
- `riSubcategoryGroup` display must be toggled synchronously at page load before any async fetch. Setting it inside an async callback creates a timing window where the form silently fails to validate `riSiteName`.
- After `form.reset()` on success, `riSiteName` is intentionally re-set to `siteName` so the same system is pre-filled for a follow-up report.

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
