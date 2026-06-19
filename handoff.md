# Handoff

## Goal

Maintain and extend the **RGMC Gateway** — a Flask-based internal portal for RGMC Group that handles system access requests, issue reporting, a developer Kanban board, and an admin panel. The app uses Supabase as the database/storage backend and vanilla JS + HTML/CSS on the frontend (no framework).

No deployment pipeline exists — changes are served directly via Flask and committed to the `master` branch.

---

## Current State

**All changes are in code but uncommitted. Nothing is broken — all edits are additive.**

The **Departments feature** is fully implemented in code. One manual step remains before it works: **run `departments_migration.sql` in Supabase SQL Editor.**

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

---

## Pending Step — MUST DO BEFORE DEPARTMENTS WORK

**Run `departments_migration.sql` in Supabase:**
1. Go to Supabase Dashboard → SQL Editor → New Query
2. Paste the contents of `departments_migration.sql` and run it
3. This creates the `departments` table and adds `request_to_department_id` to `issues`
4. Then go to Admin → Configurations → Departments to add departments

---

## Files Modified (all uncommitted)

- `controllers/tasks.py` — removed `_require_admin()` from page route
- `controllers/admin.py` — Add User endpoints, Departments CRUD, Brands CRUD
- `controllers/public.py` — `GET /api/departments`
- `controllers/issues.py` — `request_to_department_id` in submit functions and PATCH
- `templates/index.html` — view toggle, `#department`/`#arDepartment` as `<select>`, compact table markup
- `templates/admin.html` — Add User modal, Departments config sub-tab + panel + `cfgDeptModal`, `euDepartment`/`auDepartment` as `<select>`, `#issueReqDept` in issue modal
- `templates/helpdesk.html` — `#hdDepartment` as `<select>`, `#hdReqDept` select for assigned department
- `static/style.css` — compact table styles, view toggle, typeahead suggestion styles
- `static/script.js` — compact mode toggle, `_loadDepartments()`, companies dropdown
- `static/admin.js` — Add User, `_loadAdminDepartments()`, `_fillDeptSelect()`, Departments CRUD, issue modal department wiring, `saveIssuePatch` with `request_to_department_id`
- `static/helpdesk.js` — `_loadDepartments()` for `#hdDepartment` and `#hdReqDept`
- `departments_migration.sql` — creates table + adds FK column to issues (run this!)
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
