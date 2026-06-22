# Handoff

## Goal

Maintain and extend the **RGMC Gateway** — a Flask-based internal portal for RGMC Group that handles system access requests, issue reporting, a developer Kanban board, and an admin panel. The app uses Supabase as the database/storage backend and vanilla JS + HTML/CSS on the frontend (no framework).

No deployment pipeline exists — changes are served directly via Flask and committed to the `master` branch.

---

## Current State

**All changes are in code but uncommitted. Everything is functional — no broken state.**

Three SQL migrations are still pending (must be run in Supabase before their features work). See Pending Steps below.

### What was done across recent sessions

1. **Admin tasks board auth fix** — removed `_require_admin()` from the `/tasks` page route in `controllers/tasks.py`. Page routes don't receive `X-Gateway-Username` headers from browsers.

2. **Compact mode (index)** — Cards/Compact toggle on the portal home. Compact = table view. Toggle persists in `localStorage` (`rgmc-view-mode`).

3. **Add User facility** — admin can manually create users on the Users panel. Name typeahead searches `access_requests` to pre-fill fields.

4. **Company dropdown on user forms** — `#companyName`, `#arCompany`, `#auCompany`, `#euCompany` are `<select>` elements populated from `/api/companies`.

5. **Departments feature** — full implementation:
   - New `departments` table (`department_id`, `department_name`, `department_code`, `department_desc`, `is_active`)
   - New `request_to_department_id` FK column on `issues` table
   - `GET /api/departments` public endpoint (active only, ordered by name)
   - `GET/POST/PATCH/DELETE /api/admin/config/departments` admin CRUD endpoints
   - Admin panel → Configurations → Departments tab with Add/Edit/Delete
   - All department fields on all forms (`#department`, `#arDepartment`, `#euDepartment`, `#auDepartment`, `#hdDepartment`) are `<select>` elements populated from `/api/departments`
   - Issue modal in admin has `#issueReqDept` dropdown for assigning which department handles it
   - `saveIssuePatch()` sends `request_to_department_id` in PATCH body
   - `issues.py` PATCH handler accepts `request_to_department_id`
   - Both `_submit_issue()` and `_submit_helpdesk_issue()` read `request_to_department_id` from form data

6. **is_management flag** — `users.is_management` boolean column. Users with this flag can access admin/tasks screens but are excluded from developer lists and issue/task assignee dropdowns. Requires `management_migration.sql`.

7. **Uniform profile submenu** — all pages now show the same nav structure:
   - My Profile (hidden on profile page)
   - Portal (hidden on portal page)
   - IT Helpdesk (always)
   - My Workspace (always, hidden on workspace page)
   - Dev Board (if `isDeveloper || isAdmin`, hidden on dev board)
   - Tasks Board (if `isAdmin || isManagement`, hidden on tasks page)
   - Admin Panel (if `isAdmin || isManagement`, hidden on admin page)
   - Updated in: `script.js`, `admin.js`, `developer.js`, `tasks.js`, `profile.js`, `user.js`

8. **My Workspace page** (`/workspace`) — new general user page with 3 tabs:
   - **Issues**: sub-tabs → Team Issues (by `request_to_department_id`), My Issues (`assigned_to = username`), Issues I Filed (`email = user.email`)
   - **My Team**: card grid of users sharing the same `department` text value
   - **Tasks**: kanban board (Open/Ongoing/Done only), Team/Mine filter, full CRUD (create, edit, move, delete). Scoped to `user_tasks` table by `department_id`.
   - New files: `controllers/user_page.py`, `templates/user.html`, `static/user.js`
   - New migration: `user_page_migration.sql` (creates `user_tasks` table)

9. **Departments edit bug fix** — `static/admin.js` line ~2396: the Edit button in the departments config table was using `onclick='openCfgDeptModal(${JSON.stringify(d)})'`. This broke (Uncaught SyntaxError: Invalid or unexpected token) if any department field contained an apostrophe. Fixed by:
   - Button now passes only the integer ID: `onclick="openCfgDeptModal(${d.department_id})"`
   - `openCfgDeptModal(deptOrId)` now accepts either a number (looks up from `_cfgDeptsCache`) or `null` (for Add flow)

---

## Pending Steps — SQL Migrations to Run

**1. `departments_migration.sql`** — creates `departments` table + adds `request_to_department_id` to `issues`
- Supabase → SQL Editor → New Query, paste + run
- Then go to Admin → Configurations → Departments to add department records

**2. `management_migration.sql`** — adds `is_management` boolean column to `users`

**3. `user_page_migration.sql`** — creates `user_tasks` table (required for /workspace Tasks tab)

**4. `user_payload_migration.sql`** — adds `user_payload TEXT` column to `issues` table (required for the new User Input / Payload field on the report issue form)

---

## Files Actively Being Edited

All modified, none mid-change. Everything compiles and runs:

- `controllers/tasks.py` — removed `_require_admin()` from page route
- `controllers/admin.py` — Add User endpoints, Departments CRUD, Brands CRUD
- `controllers/public.py` — `GET /api/departments`
- `controllers/issues.py` — `request_to_department_id` in submit functions and PATCH
- `controllers/user_page.py` — **NEW**: all `/workspace` page + `/api/user/*` endpoints (9 routes)
- `app.py` — registered `user_page_bp`
- `templates/index.html` — view toggle, department selects, compact table markup
- `templates/admin.html` — Add User modal, Departments config tab, department selects, `#issueReqDept`
- `templates/helpdesk.html` — `#hdDepartment` and `#hdReqDept` as selects
- `templates/user.html` — **NEW**: My Workspace page (3 main tabs, 3 issue sub-tabs, kanban, 2 modals)
- `static/style.css` — compact table styles, view toggle, typeahead styles, ~120 lines of workspace CSS appended at end
- `static/script.js` — compact toggle, `_loadDepartments()`, companies dropdown, My Workspace nav link
- `static/admin.js` — Add User, departments CRUD (incl. apostrophe bug fix in Edit button at line ~2396), My Workspace nav link
- `static/developer.js` — uniform nav: IT Helpdesk, My Workspace, Tasks Board, Admin Panel
- `static/tasks.js` — uniform nav: IT Helpdesk, My Workspace, Dev Board, Admin Panel
- `static/profile.js` — uniform nav: Portal, IT Helpdesk, My Workspace, Dev Board, Tasks Board, Admin Panel
- `static/user.js` — **NEW**: workspace JS (~360 lines) — tab switching, lazy loading, issue cards + detail modal, team grid, kanban board with CRUD
- `static/helpdesk.js` — `_loadDepartments()` for `#hdDepartment` and `#hdReqDept`
- `services/email.py` — helpdesk attachments, reporter confirmation email, assignment email
- `departments_migration.sql` — **run this in Supabase**
- `management_migration.sql` — **run this in Supabase**
- `user_page_migration.sql` — **run this in Supabase**

---

## Failed Attempts

- **`JSON.stringify(d)` in single-quoted onclick attribute** (admin.js departments Edit button) — produced `Uncaught SyntaxError: Invalid or unexpected token` in console when clicking Edit. Root cause: if `department_name` or `department_desc` contained an apostrophe, it terminated the single-quoted HTML attribute mid-string. Fixed by passing only the integer `department_id` and looking up the object from `_cfgDeptsCache` inside the function.

---

## Next Step

No immediate broken state. The app is ready to test. The most impactful next action is:

**Run all three SQL migrations in Supabase** (in order):
1. `departments_migration.sql`
2. `management_migration.sql`
3. `user_page_migration.sql`

Then smoke-test the workspace page at `/workspace` — verify all three tabs load, the task kanban creates/edits/deletes, and issue sub-tabs show the correct filtered results.

---

## Context & Gotchas

- **Git must use PowerShell, not Bash.** The Git Bash binary (`bash.exe`) crashes with `msys-2.0.dll` fatal error on this machine. All `git` commands must go through the PowerShell tool, never the Bash tool.

- **Edit tool requires prior Read.** Read the target file in the current session before editing — the tool will error if you haven't read it first.

- **Supabase via REST, no ORM.** Service key bypasses RLS. Use `supabase_req(method, path, data=, params=, extra_headers=)` from `services/supabase.py`.

- **Department field storage duality:** `users.department` stores the department name as plain text (no FK). `issues.request_to_department_id` stores an integer FK to `departments.department_id`. The workspace `_dept_id_for(dept_name)` helper bridges this by looking up the name in the `departments` table.

- **`_fillDeptSelect(selId, selectedVal, byId=False)`** in admin.js — `byId=True` uses `department_id` as option value (for issue assignment); default uses `department_name` as value (for user profile fields).

- **`_adminDepartments` cache in admin.js** is populated at init and refreshed after any department CRUD. `_fillDeptSelect` reads from this cache — no extra fetch needed.

- **`_cfgDeptCode` is immutable after creation** (disabled on edit) — same pattern as company code and brand code.

- **Brands table schema:** `brand_id` (serial PK), `brand_code` (unique), `brand_name`, `brand_desc`, `brand_initial`. Do NOT use `name`, `initials`, `description`.

- **`helpdesk.js` has no `script.js` dependency.** Any shared utilities needed in helpdesk must be defined locally in that file.

- **config sub-panel visibility** is toggled via `style.display` in JS. All sub-panels except companies default to `style="display:none;"` in HTML.

- **`_resetCfgModal`, `_setCfgLoading`, `_showCfgError`** take a prefix string (e.g. `'cfgDept'`) and resolve IDs like `cfgDeptFormActions`, `cfgDeptFormLoading`, `cfgDeptFormError`, `cfgDeptErrorMsg`.

- **`openCfgDeptModal(deptOrId)`** now accepts either a number (looked up from `_cfgDeptsCache`) for the Edit flow, or `null` for the Add flow. Don't pass raw objects.

- **`_issueMap` in user.js** — issue cards use `onclick="openIssueDetailById('id')"` which looks up `_issueMap[id]`. This avoids inline JSON escaping issues in onclick attributes (same lesson as the dept bug above).

- **user_tasks vs tasks** — there are two separate task tables. `tasks` is the admin/management Kanban (in `controllers/tasks.py`). `user_tasks` is the new general-user workspace Kanban (in `controllers/user_page.py`). They are entirely separate.

- **Theme localStorage key:** `rgmc-theme`. Absence = light. Only `"dark"` is ever written.

- **Priority matrix:** P1=high urgency+high impact, P2=high+medium (or reverse), P3=medium+medium, P4=everything else.

- **AnyDesk ID:** 9 digits exactly. Validated client-side and server-side. Stored as TEXT.

- **URL param shortcut for system issues:** `/helpdesk?system=<system_id>` pre-fills category, ticket type, request type, subcategory.

- **ticket_number DEFAULT** is a PostgreSQL sequence-backed expression (`RGMC-XXXXX`).

- **Helpdesk subcategory cascade:**
  - `Software/Application` → `GET /systems?is_visible=eq.true`
  - `Hardware` / `Network` → `GET /non_software_items?category=eq.X`
