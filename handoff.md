# Handoff

## Goal

Maintain and extend the **RGMC Gateway** — a Flask-based internal portal for RGMC Group that handles system access requests, issue reporting, a developer Kanban board, and an admin panel. The app uses Supabase as the database/storage backend and vanilla JS + HTML/CSS on the frontend (no framework).

No deployment pipeline exists — changes are served directly via Flask and committed to the `master` branch.

---

## Current State

**All code changes are committed and clean. No broken state.**

One SQL migration is pending (must be run in Supabase before its features work). Supabase MCP authentication failed repeatedly this session (OAuth callback issue), so the migration was not executed. It must be run manually via the Supabase SQL Editor.

### What was done this session

1. **Request category group → department code binding** — `category_group` in `request_category` is now keyed by department code (e.g. `HR`, `FIN`) instead of full department name. This involved:
   - `controllers/public.py` — `/api/helpdesk/categories` now filters `category_group = 'IT'` only (IT Helpdesk sees IT categories only)
   - `static/general_helpdesk.js` — department options get `data-code` attribute; `ghOnDeptChange()` passes `deptCode` to `_loadCategories()`; `ghOnCategoryChange()` auto-matches `opt.dataset.code` instead of `opt.dataset.name`
   - `supabase-migrations/request_category_group_migration.sql` — NEW: updates existing category groups to dept codes via JOIN, inserts 9 IT-specific categories with `category_group = 'IT'`, and adds request types for IT categories

2. **Admin: category group field → department dropdown** — The "Group" field in the Request Categories modal (Admin → Config → Request Categories) is now a `<select>` instead of a free-text input:
   - `templates/admin.html` — `#cfgCategoryGroup` is now a `<select>` element
   - `static/admin.js` — Added `_fillCategoryGroupSelect(selectedGroup)` helper that populates the select with static options (IT, General) + all departments by code from `_adminDepartments`; updated `openCfgCategoryModal()` to call it

---

## Files Actively Being Edited

All committed. None mid-change.

- `controllers/public.py` — `/api/helpdesk/categories` filters `category_group = 'IT'` only
- `static/general_helpdesk.js` — dept options get `data-code`; category loading uses dept code; auto-match uses `dataset.code`
- `templates/admin.html` — `#cfgCategoryGroup` changed from `<input type="text">` to `<select>`
- `static/admin.js` — Added `_fillCategoryGroupSelect()`, updated `openCfgCategoryModal()`
- `supabase-migrations/request_category_group_migration.sql` — NEW migration, not yet run in Supabase

---

## Failed Attempts

- **Supabase MCP authentication** — Attempted OAuth flow three times. The MCP server starts the flow and provides an authorize URL, but after the user authorizes on Supabase, the browser is redirected to `http://localhost:<port>/callback?code=...`. The user was unable to copy the callback URL — they kept pasting the original authorize URL instead. Root cause is likely that the redirect to localhost fails visually (connection error page), making it confusing to find the URL in the address bar. The migration was not run as a result.

---

## Next Step

**Run `supabase-migrations/request_category_group_migration.sql` in Supabase SQL Editor.**

1. Open Supabase dashboard → SQL Editor → New Query
2. Paste the full contents of `supabase-migrations/request_category_group_migration.sql`
3. Run it

What it does:
- **Step 1**: `UPDATE request_category` joining on `departments.department_name = category_group` (case-insensitive) to replace full dept names with dept codes. Skips `'General'` and `'IT'`.
- **Step 2**: Inserts 9 IT categories (`Software/Application`, `Hardware`, `Network`, `Account & Access`, `Email & Collaboration`, `Printer & Peripherals`, `Data & Backup`, `Security Incident`, `Other IT Request`) with `category_group = 'IT'`.
- **Step 3**: Inserts request types for the non-subcategory IT categories.

After running, verify: Admin → Config → Request Categories shows dept codes in the Group column; IT Helpdesk (`/helpdesk`) shows only IT categories; General Helpdesk (`/general-helpdesk`) filters correctly by dept when "Who should handle this?" is selected.

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
12. **`supabase-migrations/request_category_group_migration.sql`** — (this session, not yet run) updates category groups to dept codes + adds IT categories

---

## Context & Gotchas

- **Git must use PowerShell, not Bash.** The Git Bash binary (`bash.exe`) crashes with `msys-2.0.dll` fatal error on this machine. All `git` commands must go through the PowerShell tool, never the Bash tool.

- **Edit tool requires prior Read.** Read the target file in the current session before editing — the tool will error if you haven't read it first.

- **Supabase via REST, no ORM.** Service key bypasses RLS. Use `supabase_req(method, path, data=, params=, extra_headers=)` from `services/supabase.py`.

- **Supabase MCP auth pattern.** When the OAuth redirect to `localhost` fails with a connection error, the callback URL is still in the browser address bar. It looks like `http://localhost:45XXX/callback?code=XXXX&state=XXXX`. The user must copy THAT URL (not the original authorize URL) and call `mcp__supabase__complete_authentication` with it. Previous attempts failed because the user kept pasting the authorize URL instead.

- **`category_group` values after migration:**
  - `'IT'` — IT Helpdesk categories only (shown on `/helpdesk`)
  - `'General'` — always visible in general helpdesk regardless of selected dept
  - Department codes (e.g. `'HR'`, `'FIN'`) — shown in general helpdesk when matching dept is selected

- **IT Helpdesk hardcoded category name:** `helpdesk.js` has `catSel.value = 'Software/Application'` when pre-filling from a system link. The category in the DB must be named exactly `'Software/Application'` (no spaces around slash). The migration uses this exact name.

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

- **Priority matrix:** P1=high urgency+high impact, P2=high+medium (or reverse), P3=medium+medium, P4=everything else.

- **`_issueMap` in user.js** — issue cards use `onclick="openIssueDetailById('id')"` which looks up `_issueMap[id]`. Avoids inline JSON escaping issues in onclick attributes.

- **ticket_number DEFAULT** is a PostgreSQL sequence-backed expression (`RGMC-XXXXX`).

- **Brands table schema:** `brand_id` (serial PK), `brand_code` (unique), `brand_name`, `brand_desc`, `brand_initial`. Do NOT use `name`, `initials`, `description`.

- **Helpdesk subcategory cascade:**
  - `Software/Application` → `GET /systems?is_visible=eq.true`
  - `Hardware` / `Network` → `GET /non_software_items?category=eq.X`

- **AnyDesk ID:** 9 digits exactly. Validated client-side and server-side. Stored as TEXT.
