# Handoff

## Goal

Maintain and extend the **RGMC Gateway** — a Flask-based internal portal for RGMC Group that handles system access requests, issue reporting, a developer Kanban board, and an admin panel. The app uses Supabase as the database/storage backend and vanilla JS + HTML/CSS on the frontend (no framework).

No deployment pipeline exists — changes are served directly via Flask and committed to the `master` branch.

---

## Current State

**All code is committed and clean. No broken state.**

Two SQL migrations are pending (must be run in Supabase before their features work). The Supabase MCP OAuth flow has failed repeatedly across multiple sessions — run these manually via the Supabase SQL Editor.

### What was done this session

1. **Default view → compact mode** — Home screen now opens in compact (list table) view by default for users with no stored preference.
   - `static/script.js` line 307: fallback changed from `'cards'` to `'compact'`
   - Users who previously chose card view are unaffected (preference is persisted in localStorage)

2. **Issue comments + activity feed** — Added a full Activity & Comments section to both the admin issue modal and the workspace issue detail modal.
   - **`GET /api/issues/<id>/activity`** — returns a unified sorted timeline combining: comments on the issue (`issue_comments` table) + status movements from linked user tasks (`task_item_logs`, `task_activity_logs`) + status movements from linked dev items (`dev_item_logs`)
   - **`POST /api/issues/<id>/comments`** — authenticated endpoint (X-Gateway-Username header) to post a new comment
   - HTML section added to bottom of both issue modals (before save actions in admin; at bottom of modal in workspace)
   - JS functions added to `admin.js` and `user.js`: `loadIssueActivity` / `loadIssActivity`, `postIssueComment` / `postIssComment`, `refreshIssueActivity` / `refreshIssActivity`
   - Timeline entry types: **Comment** (gold tag), **Moved · Task/Dev** (amber), **Note · Task/Dev** (muted)
   - Activity section auto-loads when the modal opens and clears the comment input

---

## Files Actively Being Edited

All committed. None mid-change.

- `static/script.js` — line 307 fallback changed from `'cards'` to `'compact'` (default view mode)
- `controllers/issues.py` — added `get_issue_activity` (GET `/api/issues/<id>/activity`) and `post_issue_comment` (POST `/api/issues/<id>/comments`) routes at lines ~449–560
- `templates/admin.html` — added `<div class="iss-activity-section">` block (id `issueActivityList`, `issueCommentInput`) before `issueModalActions`
- `templates/user.html` — added `<div class="iss-activity-section">` block (id `issActivityList`, `issCommentInput`) after `iss-dh-actions`, before closing modal div
- `static/admin.js` — added `_renderIssueActivityEntries`, `loadIssueActivity`, `refreshIssueActivity`, `postIssueComment`; wired into `openIssueModal` (calls `loadIssueActivity(id)` + clears input on open)
- `static/user.js` — added `_renderIssActivityEntries`, `loadIssActivity`, `refreshIssActivity`, `postIssComment`; wired into `openIssueDetail` (calls `loadIssActivity(iss.id)` + clears input on open)
- `static/style.css` — appended `.iss-activity-section`, `.iss-act-entry`, `.iss-act-tag--comment/moved/note`, `.iss-comment-form` etc. at end of file
- `supabase-migrations/issue_comments_migration.sql` — NEW: creates `issue_comments` table (not yet run in Supabase)

---

## Failed Attempts

- **Supabase MCP authentication** — Attempted OAuth flow across multiple sessions. The MCP server starts the flow and provides an authorize URL, but after the user authorizes on Supabase, the browser is redirected to `http://localhost:<port>/callback?code=...`. The user was unable to copy the callback URL — kept pasting the original authorize URL instead. Root cause: the redirect to localhost fails visually (connection error page), making it hard to find the URL in the address bar. No migrations have been run through MCP as a result.

---

## Next Step

**Run two pending migrations in Supabase SQL Editor, in this order:**

### Migration 1 — `supabase-migrations/request_category_group_migration.sql`
1. Open Supabase dashboard → SQL Editor → New Query
2. Paste the full file contents
3. Run it

What it does:
- Updates existing `category_group` values from full department names → dept codes (e.g. `"Human Resources"` → `"HR"`)
- Inserts 9 IT categories (`Software/Application`, `Hardware`, `Network`, `Account & Access`, `Email & Collaboration`, `Printer & Peripherals`, `Data & Backup`, `Security Incident`, `Other IT Request`) with `category_group = 'IT'`
- Inserts request types for those IT categories

### Migration 2 — `supabase-migrations/issue_comments_migration.sql`
1. New Query in Supabase SQL Editor
2. Paste and run

What it does:
- Creates `issue_comments` table (`id UUID PK`, `issue_id UUID FK → issues`, `username TEXT`, `comment TEXT`, `created_at TIMESTAMPTZ`)
- Creates indexes on `issue_id` and `created_at`

**After both are run, verify:**
- Admin → Config → Request Categories: Group column shows dept codes (e.g. `HR`, `IT`)
- `/helpdesk` (IT Helpdesk): shows only IT categories
- `/general-helpdesk`: filters categories correctly by selected dept
- Admin issue modal → open any issue → Activity & Comments section loads (shows "No activity yet" if none exist)
- Can post a comment; it appears immediately in the timeline
- Opening an issue with a linked user task shows the task's movements in the timeline

---

## Pending SQL Migrations (accumulated, run order matters)

Not all of these may have been run. Run in this order if any are missing:

1. `supabase-migrations/departments_migration.sql` — creates `departments` table + `request_to_department_id` FK on `issues`
2. `supabase-migrations/management_migration.sql` — adds `is_management BOOLEAN` to `users`
3. `supabase-migrations/user_page_migration.sql` — creates `user_tasks` table (required for /workspace)
4. `supabase-migrations/user_payload_migration.sql` — adds `user_payload TEXT` to `issues`
5. `supabase-migrations/user_task_promote_migration.sql` — adds `user_task_id UUID` to `issues`
6. `supabase-migrations/user_task_assigned_to_migration.sql` — adds `assigned_to TEXT` to `user_tasks`
7. `supabase-migrations/is_department_head_migration.sql` — adds `is_department_head BOOLEAN` to `users`
8. `supabase-migrations/dev_item_logs_migration.sql` — creates `dev_item_logs` table
9. `supabase-migrations/task_item_logs_migration.sql` — creates `task_item_logs` table
10. `supabase-migrations/task_activity_logs_migration.sql` — creates `task_activity_logs` table
11. `supabase-migrations/general_helpdesk_categories_seed.sql` — re-run to seed/update general helpdesk categories (safe, uses ON CONFLICT DO UPDATE)
12. **`supabase-migrations/request_category_group_migration.sql`** — (not yet run) updates category groups to dept codes + adds IT categories
13. **`supabase-migrations/issue_comments_migration.sql`** — (not yet run, added this session) creates `issue_comments` table

---

## Context & Gotchas

- **Git must use PowerShell, not Bash.** The Git Bash binary (`bash.exe`) crashes with `msys-2.0.dll` fatal error on this machine. All `git` commands must go through the PowerShell tool, never the Bash tool.

- **Edit tool requires prior Read.** Read the target file in the current session before editing — the tool will error if you haven't read it first.

- **Supabase via REST, no ORM.** Service key bypasses RLS. Use `supabase_req(method, path, data=, params=, extra_headers=)` from `services/supabase.py`.

- **Supabase MCP auth pattern.** When the OAuth redirect to `localhost` fails with a connection error, the callback URL is still in the browser address bar. It looks like `http://localhost:45XXX/callback?code=XXXX&state=XXXX`. The user must copy THAT URL (not the original authorize URL) and call `mcp__supabase__complete_authentication` with it.

- **`category_group` values after migration 12:**
  - `'IT'` — IT Helpdesk categories only (shown on `/helpdesk`)
  - `'General'` — always visible in general helpdesk regardless of selected dept
  - Department codes (e.g. `'HR'`, `'FIN'`) — shown in general helpdesk when matching dept is selected

- **IT Helpdesk hardcoded category name:** `helpdesk.js` has `catSel.value = 'Software/Application'` when pre-filling from a system link. The category in the DB must be named exactly `'Software/Application'`. Migration 12 uses this exact name.

- **Issue activity endpoint is open (no auth required for GET).** The `GET /api/issues/<id>/activity` route does not call any guard — it returns data without authentication. This is intentional since the activity feed is read-only and non-sensitive. Only the POST (comment) requires `X-Gateway-Username`.

- **Admin vs workspace activity IDs differ.** Admin modal uses element IDs `issueActivityList` / `issueCommentInput` and JS functions `loadIssueActivity` / `postIssueComment` / `refreshIssueActivity` (in `admin.js`). Workspace modal uses `issActivityList` / `issCommentInput` and `loadIssActivity` / `postIssComment` / `refreshIssActivity` (in `user.js`). Names differ to avoid any risk of collision since both pages load different JS bundles.

- **`_fillCategoryGroupSelect(selectedGroup)`** in `admin.js` reads from `_adminDepartments` (loaded at init). If departments haven't been set up yet, only the static IT/General options will appear.

- **`_adminDepartments` cache** is populated at admin init via `_loadAdminDepartments()` which calls `GET /api/departments`. It refreshes after department CRUD. The category group select depends on this cache.

- **Department field storage duality:** `users.department` stores the department name as plain text (no FK). `issues.request_to_department_id` stores an integer FK to `departments.department_id`. The workspace `_dept_id_for(dept_name)` helper bridges this.

- **`_fillDeptSelect(selId, selectedVal, byId=False)`** in admin.js — `byId=True` uses `department_id` as option value (for issue assignment); default uses `department_name` as value (for user profile fields).

- **general_helpdesk.js category/dept matching flow:**
  1. User selects handling dept → `ghOnDeptChange()` → reads `selected.dataset.code` → calls `_loadCategories(deptCode)`
  2. API `GET /api/general-helpdesk/categories?group=<deptCode>` filters `category_group IN (deptCode, 'General')`
  3. User selects category → `ghOnCategoryChange()` → reads `catGroup` from `opt.dataset.group` → finds matching dept option by `opt.dataset.code === catGroup` → auto-selects dept

- **user_tasks vs tasks** — two separate tables. `tasks` is the admin/management Kanban (`controllers/tasks.py`). `user_tasks` is the workspace Kanban (`controllers/user_page.py`). Entirely separate.

- **Theme localStorage key:** `rgmc-theme`. Absence = light. Only `"dark"` is ever written.

- **Session stored in `localStorage`** as `rgmc_gateway_session`. Flags: `isDepartmentHead`, `isAdmin`, `isManagement`, `isDeveloper`.

- **View mode localStorage key:** `rgmc-view-mode`. Default fallback is now `'compact'` (changed this session). Only `'cards'` or `'compact'` are valid values.

- **Priority matrix:** P1=high urgency+high impact, P2=high+medium (or reverse), P3=medium+medium, P4=everything else.

- **`_issueMap` in user.js** — issue cards use `onclick="openIssueDetailById('id')"` which looks up `_issueMap[id]`. Avoids inline JSON escaping issues in onclick attributes.

- **ticket_number DEFAULT** is a PostgreSQL sequence-backed expression (`RGMC-XXXXX`).

- **Brands table schema:** `brand_id` (serial PK), `brand_code` (unique), `brand_name`, `brand_desc`, `brand_initial`. Do NOT use `name`, `initials`, `description`.

- **Helpdesk subcategory cascade:**
  - `Software/Application` → `GET /systems?is_visible=eq.true`
  - `Hardware` / `Network` → `GET /non_software_items?category=eq.X`

- **AnyDesk ID:** 9 digits exactly. Validated client-side and server-side. Stored as TEXT.
