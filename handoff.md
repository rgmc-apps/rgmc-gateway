# Handoff

## Goal

Maintain and extend the **RGMC Gateway** — a Flask-based internal portal for RGMC Group that handles system access requests, issue reporting, a developer Kanban board, and an admin panel. The app uses Supabase as the database/storage backend and vanilla JS + HTML/CSS on the frontend (no framework).

No deployment pipeline exists — changes are served directly via Flask and committed to the `master` branch.

---

## Current State

**Code is UNCOMMITTED. All changes are staged in the working tree but not yet committed to git.** The last clean commit is `feff8d4`. All JS files pass `node --check` syntax validation.

### What was done this session

Added two new fields to the issue/dev item/task **resolution** flow:

1. **Actions Taken checklist** — users check which actions were performed (remote assist, reboot, etc.) when resolving/marking done. Backed by a new `actions` lookup table (12 seeded entries). Selected IDs saved as `resolution_action_ids integer[]` on the target record.

2. **Resolution Image Attachments** — users can attach images (screenshots, photos) when resolving. Stored in a new Supabase storage bucket `resolution-attachments`. URLs saved as `resolution_attachment_urls text[]` on the target record.

### DB changes (all applied via Supabase MCP):
- `actions` table created and seeded with 12 entries (`action_id`, `action_name`, `action_code`, `action_desc`, `is_active`)
- `resolution_action_ids integer[] DEFAULT '{}'` added to `issues`, `dev_items`, `tasks`
- `resolution_attachment_urls text[] DEFAULT '{}'` added to `issues`, `dev_items`, `tasks`
- `resolution-attachments` Supabase storage bucket created (public)

### Where the new UI appears:
- **Admin issue modal** (`/admin` → Issues → View) — below the existing "Resolution Notes" and "Resolved By" fields; visible only when status = `resolved` or `closed`
- **Developer "Mark as Done" modal** (`/developer`) — below the "Resolution Remarks" textarea
- **Tasks "Mark as Done" modal** (`/tasks`) — same structure as developer

---

## Files Actively Being Edited

All modified but **not committed**:

- `app.py` — registered `resolution_bp` from `controllers/resolution.py`
- `controllers/resolution.py` *(NEW)* — `GET /api/actions` and `POST /api/upload/resolution` endpoints; uses Supabase storage PUT to `resolution-attachments` bucket
- `controllers/issues.py` — added `resolution_action_ids`, `resolution_attachment_urls` to the `allowed` set in `admin_patch_issue` (line ~289)
- `controllers/developer.py` — same; added to `allowed` set in `dev_update_item` (line ~86)
- `controllers/tasks.py` — same; added to `allowed` set in `api_update_task` (line ~75-78)
- `templates/admin.html` — after `#issueResolvedByGroup` (~line 613): added `#issueActionsGroup` (checklist) and `#issueResAttachGroup` (upload widget)
- `templates/developer.html` — inside `#doneRemarksModal`: added `#devActionsGrid` and `#devResAttachPreviews` / `#devResAttachAddBtn` sections
- `templates/tasks.html` — same pattern: added `#taskActionsGrid` and `#taskResAttachPreviews` / `#taskResAttachAddBtn` sections
- `static/admin.js` — added state (`_actionsCache`, `_issResExistingUrls`, `_issResPendingFiles`), helpers (`_loadActionsCache`, `_renderActionsGrid`, `_getCheckedActionIds`, `_renderResAttachPreviews`, `issResAttachChange`, `issResRemoveExisting`, `issResRemovePending`, `_uploadIssResFiles`); updated `_toggleIssueResolution` to also show/hide the two new groups; updated `openIssueModal` to pre-populate actions + attachments; updated `saveIssuePatch` to upload files + send `resolution_action_ids` and `resolution_attachment_urls`
- `static/developer.js` — added state (`_devActionsCache`, `_devResPendingFiles`), helpers (`_devLoadActions`, `_devRenderActionsGrid`, `_devGetCheckedActionIds`, `devResAttachChange`, `_devRenderResAttachPreviews`, `devResRemovePending`); `openDoneRemarksModal` is now `async`; `confirmMarkDone` passes `(remarks, actionIds, files)` to callback; `_execMoveItem` and `_execSaveItem` upload files + patch with new fields when `newStatus === 'done'`
- `static/tasks.js` — same pattern as developer.js: added `_taskActionsCache`, `_taskResPendingFiles` state; helpers `_taskLoadActions`, `_taskRenderActionsGrid`, `_taskGetCheckedActionIds`, `taskResAttachChange`, `_taskRenderResAttachPreviews`, `taskResRemovePending`; `openTaskDoneRemarksModal` is now `async`; `confirmTaskMarkDone` now passes `(remarks, actionIds, files)` to callback; `_execMoveTask` and `_execSaveTask` upload files + patch
- `static/style.css` — appended `.res-actions-grid`, `.res-action-item` (pill checkboxes with gold checked state), `.res-attach-wrap`, `.res-attach-thumb`, `.res-attach-remove`, `.res-attach-add` styles plus light-mode overrides

---

## Failed Attempts

- **Supabase MCP OAuth flow (prior sessions)** — Attempted OAuth flow. Browser redirects to `http://localhost:<port>/callback?code=...` which shows a connection error. Never succeeded. **Resolution**: Use `mcp__supabase__execute_sql` directly via ToolSearch — no OAuth needed.

---

## Next Step

**Commit all the changes.** The working tree is clean and all JS syntax-checks pass. Run:

```powershell
git add app.py controllers/resolution.py controllers/issues.py controllers/developer.py controllers/tasks.py static/admin.js static/developer.js static/tasks.js static/style.css templates/admin.html templates/developer.html templates/tasks.html
git commit -m "add resolution actions checklist and image attachments"
```

Then verify in the browser:
1. `/admin` → Issues → open any resolved/closed issue → resolution section should show actions checklist + image upload widget below "Resolved By"
2. `/developer` → move a card to Done → modal should show actions + image upload below the remarks textarea
3. `/tasks` → same as developer

---

## Context & Gotchas

- **Git must use PowerShell, not Bash.** The Git Bash binary (`bash.exe`) crashes with `msys-2.0.dll` fatal error on this machine. All `git` commands must go through the PowerShell tool, never the Bash tool.

- **Edit tool requires prior Read.** Read the target file in the current session before editing — the tool will error if you haven't read it first.

- **Supabase MCP — use `execute_sql` directly.** No OAuth needed. Use ToolSearch with `select:mcp__supabase__execute_sql` to load it, then call it. Do NOT attempt the OAuth flow — it has never succeeded on this machine.

- **`openDoneRemarksModal` and `openTaskDoneRemarksModal` are now `async`.** They fetch actions on first open. The `moveItem` / `moveTask` callers that await them are fine because `async` functions return a Promise. However, they're called without `await` in the event handlers (e.g. `onclick="moveItem(...)"`), so any errors inside them won't surface to the UI. If actions fail to load silently, `_devActionsCache` / `_taskActionsCache` will be `[]` and the grid shows "No actions configured."

- **`confirmTaskMarkDone` previously passed no args to callback.** Before this session it called `cb()` with no arguments. Now it passes `(remarks, actionIds, files)` matching developer.js. The `_execSaveTask` function previously took no parameters; now it takes `(remarks, actionIds, files)` — the `remarks` param is received but not currently forwarded to the PATCH body (tasks never sent remarks to the backend). This is intentional — remarks were never persisted for tasks, only used for the dev item cascade to issues.

- **Admin resolution fields visibility** — `_toggleIssueResolution(status)` now controls 4 groups: `issueResolutionGroup`, `issueResolvedByGroup`, `issueActionsGroup`, `issueResAttachGroup`. All four are hidden by default (`style="display:none;"`) and shown together when status = `resolved` or `closed`.

- **`_uploadIssResFiles(issueId)` in admin.js** — returns `[...existingUrls, ...newlyUploadedUrls]`. It uploads `_issResPendingFiles` and merges with `_issResExistingUrls`. Returns the combined array, which is sent as `resolution_attachment_urls` in the PATCH body. Safe to call with empty pending files — just returns existing URLs unchanged.

- **Supabase via REST, no ORM.** Service key bypasses RLS. Use `supabase_req(method, path, data=, params=, extra_headers=)` from `services/supabase.py`. Storage uploads use `requests.put()` directly to `SUPABASE_URL/storage/v1/object/<bucket>/<path>`.

- **`actions` table seeded with 12 actions** (action_ids 1–12): Remote Assistance, On-site Visit, Software Reinstall, Software Update / Patch, System Restart / Reboot, Hardware Replacement, Configuration Change, User Training, Account / Access Reset, Data Recovery, Network Troubleshooting, Escalated to Vendor.

- **`POST /api/upload/resolution` requires `X-Gateway-Username` header.** All three pages (admin, developer, tasks) use `authHeaders()` which supplies this. Max 5MB per file; only image MIME types allowed.

- **`resolution-attachments` bucket is public.** Public URLs are in the form `<SUPABASE_URL>/storage/v1/object/public/resolution-attachments/<entity_id>/<uid>_<filename>`.

- **`_issueMap` in user.js** — issue cards use `onclick="openIssueDetailById('id')"` which looks up `_issueMap[id]`. Avoids inline JSON escaping issues in onclick attributes.

- **ticket_number DEFAULT** is a PostgreSQL sequence-backed expression (`RGMC-XXXXX`).

- **Brands table schema:** `brand_id` (serial PK), `brand_code` (unique), `brand_name`, `brand_desc`, `brand_initial`. Do NOT use `name`, `initials`, `description`.

- **`category_group` values after prior migration:**
  - `'IT'` — IT Helpdesk categories only (shown on `/helpdesk`)
  - `'General'` — always visible in general helpdesk regardless of selected dept
  - Department codes (`'HR'`, `'ACCT'`, `'OPS'`) — shown in general helpdesk when matching dept is selected

- **Issue Actions submenu IDs** — The old promote button IDs (`issuePromoteBtn`, `issuePromoteTaskBtn`, `issuePromoteUserTaskBtn`) are GONE. Current IDs are `issPromoteDevBtn`, `issPromoteTaskBtn`, `issPromoteUserTaskBtn` (inside the submenu).

- **`_fillCategoryGroupSelect(selectedGroup)`** in `admin.js` reads from `_adminDepartments` (loaded at init). If departments haven't been set up, only the static IT/General options will appear.

- **user_tasks vs tasks** — two separate tables. `tasks` is the admin/management Kanban (`controllers/tasks.py`). `user_tasks` is the workspace Kanban (`controllers/user_page.py`). Entirely separate.

- **Theme localStorage key:** `rgmc-theme`. Absence = light. Only `"dark"` is ever written.

- **Session stored in `localStorage`** as `rgmc_gateway_session`. Flags: `isDepartmentHead`, `isAdmin`, `isManagement`, `isDeveloper`.

- **View mode localStorage key:** `rgmc-view-mode`. Default fallback is `'compact'`. Only `'cards'` or `'compact'` are valid values.

- **Priority matrix:** P1=high urgency+high impact, P2=high+medium (or reverse), P3=medium+medium, P4=everything else.

- **AnyDesk ID:** 9 digits exactly. Validated client-side and server-side. Stored as TEXT.

- **IT Helpdesk hardcoded category name:** `helpdesk.js` has `catSel.value = 'Software/Application'` when pre-filling from a system link. The category in the DB must be named exactly `'Software/Application'`.

- **Issue activity endpoint is open (no auth required for GET).** The `GET /api/issues/<id>/activity` route is intentionally unauthenticated (read-only, non-sensitive). Only `POST /api/issues/<id>/comments` requires `X-Gateway-Username`.

- **Admin vs workspace activity IDs differ.** Admin modal uses `issueActivityList` / `issueCommentInput` (in `admin.js`). Workspace modal uses `issActivityList` / `issCommentInput` (in `user.js`). Different JS bundles, different element IDs.

- **Department field storage duality:** `users.department` stores the department name as plain text (no FK). `issues.request_to_department_id` stores an integer FK to `departments.department_id`. The workspace `_dept_id_for(dept_name)` helper bridges this.
