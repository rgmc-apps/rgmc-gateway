# Handoff

## Goal

Maintain and extend the **RGMC Gateway** — a Flask-based internal portal for RGMC Group that handles system access requests, issue reporting, a developer Kanban board, and an admin panel. The app uses Supabase as the database/storage backend and vanilla JS + HTML/CSS on the frontend (no framework).

No deployment pipeline exists — changes are served directly via Flask and committed to the `master` branch.

---

## Current State

**All changes are in code but uncommitted. Nothing is broken — all edits are additive.**

Pending SQL migrations must be run in Supabase before those features work (see Pending Steps below).

### What was done (this session series)

1. **Admin tasks board auth fix** — removed `_require_admin()` from the `/tasks` page route in `controllers/tasks.py`. Page routes don't receive `X-Gateway-Username` headers from browsers.

2. **Compact mode (index)** — added a Cards/Compact toggle to the portal home. Compact shows a table view. Toggle persists in `localStorage` (`rgmc-view-mode`).

3. **Tasks Board link in profile submenu** — added for admin users.

4. **Add User facility** — admin can manually create users on the Users panel. Name typeahead searches `access_requests` to pre-fill fields.

5. **Company dropdown on user forms** — `#companyName`, `#arCompany`, `#auCompany`, `#euCompany` are all `<select>` elements populated from `/api/companies`.

6. **Departments feature** — full implementation:
   - New `departments` table (`department_id`, `department_name`, `department_code`, `department_desc`, `is_active`)
   - New `request_to_department_id` FK column on `issues` table
   - `GET /api/departments` public endpoint (active only, ordered by name)
   - `GET/POST/PATCH/DELETE /api/admin/config/departments` admin CRUD endpoints
   - Admin panel → Configurations → Departments tab with Add/Edit/Delete
   - All department fields on all forms (`#department`, `#arDepartment`, `#euDepartment`, `#auDepartment`, `#hdDepartment`) are now `<select>` elements populated from `/api/departments`
   - Issue modal in admin has `#issueReqDept` dropdown for assigning which department handles it
   - `saveIssuePatch()` sends `request_to_department_id` in PATCH body
   - `issues.py` PATCH handler accepts `request_to_department_id`
   - Both `_submit_issue()` and `_submit_helpdesk_issue()` read `request_to_department_id` from form data

7. **is_management flag** — `users.is_management` boolean column. Users with this flag can access admin/tasks screens but are excluded from developer lists and issue/task assignee dropdowns. Requires `management_migration.sql`.

8. **Uniform profile submenu** — all pages now show the same nav structure: My Profile (hidden on profile), Portal (hidden on portal), IT Helpdesk (always), My Workspace (always, hidden on workspace), Dev Board (if isDeveloper || isAdmin, hidden on dev board), Tasks Board (if isAdmin || isManagement, hidden on tasks), Admin Panel (if isAdmin || isManagement, hidden on admin). Updated: `script.js`, `admin.js`, `developer.js`, `tasks.js`, `profile.js`, `user.js`.

9. **My Workspace page** (`/workspace`) — new general user page with 3 tabs:
   - **Issues**: Team Issues (dept), My Issues (assigned_to), Issues I Filed (by email)
   - **My Team**: grid of same-department users
   - **Tasks**: kanban board (Open/Ongoing/Done), team or mine filter, full CRUD
   - New files: `controllers/user_page.py`, `templates/user.html`, `static/user.js`
   - New migration: `user_page_migration.sql` (creates `user_tasks` table — run this!)

---

## Pending Steps — SQL Migrations to Run

**1. `departments_migration.sql`** — creates `departments` table + adds `request_to_department_id` to `issues`
- Go to Supabase → SQL Editor → New Query, paste + run
- Then go to Admin → Configurations → Departments to add departments

**2. `management_migration.sql`** — adds `is_management` boolean column to `users`

**3. `user_page_migration.sql`** — creates `user_tasks` table (needed for /workspace Tasks tab)

---

## Files Modified (all uncommitted)

- `controllers/tasks.py` — removed `_require_admin()` from page route
- `controllers/admin.py` — Add User endpoints, Departments CRUD, Brands CRUD
- `controllers/public.py` — `GET /api/departments`
- `controllers/issues.py` — `request_to_department_id` in submit functions and PATCH
- `controllers/user_page.py` — NEW: all /workspace and /api/user/* endpoints
- `templates/index.html` — view toggle, `#department`/`#arDepartment` as `<select>`, compact table markup
- `templates/admin.html` — Add User modal, Departments config sub-tab + panel + `cfgDeptModal`, `euDepartment`/`auDepartment` as `<select>`, `#issueReqDept` in issue modal
- `templates/helpdesk.html` — `#hdDepartment` as `<select>`, `#hdReqDept` select for assigned department
- `templates/user.html` — NEW: My Workspace page
- `static/style.css` — compact table styles, view toggle, typeahead suggestion styles; +workspace CSS
- `static/script.js` — compact mode toggle, `_loadDepartments()`, companies dropdown; +My Workspace nav link
- `static/admin.js` — Add User, `_loadAdminDepartments()`, `_fillDeptSelect()`, Departments CRUD, issue modal department wiring, `saveIssuePatch` with `request_to_department_id`; +My Workspace nav link
- `static/developer.js` — uniform nav (IT Helpdesk, My Workspace, Tasks Board, Admin Panel); +My Workspace nav link
- `static/tasks.js` — uniform nav; +My Workspace nav link
- `static/profile.js` — uniform nav; +My Workspace nav link
- `static/user.js` — NEW: workspace JS (issues, team, tasks kanban)
- `static/helpdesk.js` — `_loadDepartments()` for `#hdDepartment` and `#hdReqDept`
- `app.py` — registered user_page_bp
- `departments_migration.sql` — creates table + adds FK column to issues (run this!)
- `management_migration.sql` — adds is_management to users (run this!)
- `user_page_migration.sql` — creates user_tasks table (run this!)
- `services/email.py` — helpdesk attachments, reporter confirmation email, assignment email improvements

---

## Context & Gotchas

- **Git must use PowerShell, not Bash.** The Git Bash binary (`bash.exe`) crashes with `msys-2.0.dll` fatal error on this machine. All git commands must go through the PowerShell tool.

- **Edit tool requires prior Read.** Read target files in the current session before editing.

- **Supabase via REST, no ORM.** Service key bypasses RLS. Use `supabase_req(method, path, data=, params=, extra_headers=)`.

- **`_fillDeptSelect(selId, selectedVal, byId=False)`** — when `byId=True`, options use `department_id` as value (for issue assignment); when `False` (default), options use `department_name` as value (for user profile fields).

- **department field storage duality:** User profile `department` field stores `department_name` text (no FK). `issues.request_to_department_id` stores integer FK to `departments.department_id`.

- **`_adminDepartments` cache in admin.js** is populated at init and refreshed after any department CRUD operation. `_fillDeptSelect` reads from this cache — no extra fetch.

- **`_cfgDeptCode` is immutable after creation** (disabled on edit), matching the pattern used by company code and brand code.

- **Brands table schema:** `brand_id` (serial PK), `brand_code` (unique), `brand_name`, `brand_desc`, `brand_initial`. Do NOT use `name`, `initials`, `description`.

- **`helpdesk.js` has no `script.js` dependency.** Shared utilities must be defined locally.

- **config-sub-panel visibility** toggled via `style.display` in JS. All sub-panels except companies have `style="display:none;"` in HTML.

- **`_resetCfgModal`, `_setCfgLoading`, `_showCfgError`** take a prefix string (e.g. `'cfgDept'`) and resolve IDs like `cfgDeptFormActions`, `cfgDeptFormLoading`, `cfgDeptFormError`, `cfgDeptErrorMsg`.

- **Theme localStorage key:** `rgmc-theme`. Absence = light. Only `"dark"` ever written.

- **Priority matrix:** P1=high+high, P2=high+medium (or reverse), P3=medium+medium, P4=everything else.

- **AnyDesk ID:** 9 digits exactly. Validated client-side and server-side. Stored as TEXT.

- **URL param shortcut for system issues:** `/helpdesk?system=<system_id>` pre-fills category, ticket type, request type, subcategory.

- **ticket_number DEFAULT** is a PostgreSQL sequence-backed expression (`RGMC-XXXXX`).

- **Helpdesk subcategory cascade:**
  - `Software/Application` → `GET /systems?is_visible=eq.true`
  - `Hardware` / `Network` → `GET /non_software_items?category=eq.X`
