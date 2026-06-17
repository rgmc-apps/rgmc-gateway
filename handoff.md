# Handoff

## Goal

Maintain and extend the **RGMC Gateway** — a Flask-based internal portal for RGMC Group that handles system access requests, issue reporting, a developer Kanban board, and an admin panel. The app uses Supabase as the database/storage backend and vanilla JS + HTML/CSS on the frontend (no framework).

No deployment pipeline exists — changes are served directly via Flask and committed to the `master` branch.

---

## Current State

**All features are working and complete.** All changes are uncommitted and sitting in the working tree. Nothing is broken or mid-edit.

### Completed this session — Configurations Tab (final piece):

The `panel-config` HTML structure and all 4 config API routes were already in place from the prior session. This session completed the remaining two parts:

**4 config modals added to `templates/admin.html`** (inserted before the Toast div):
- `cfgCompanyModal` — company_code (uppercase, disabled on edit) + name
- `cfgCategoryModal` — category_name, category_group, category_desc (textarea)
- `cfgTypeModal` — request_category select (populated from categories cache at open time), request_type text, is_visible toggle
- `cfgNsiModal` — category select (Hardware/Network hardcoded), subcategory text, is_visible toggle

**Full config JS added to `static/admin.js`** (appended before `_buildPrintHtml`):
- 10 new state vars: `_currentConfigTab`, `_cfgCompaniesCache`, `_cfgCategoriesCache`, `_cfgTypesCache`, `_cfgNsiCache`, `_cfgCompanyEditCode`, `_cfgCategoryEditId`, `_cfgTypeEditId`, `_cfgNsiEditId`
- `switchConfigTab(ctab)` — toggles `.config-sub-panel` visibility via `style.display`, updates `.status-tab` active class, calls `_loadCurrentConfigSub()`
- `_loadCurrentConfigSub()` — dispatches to the correct load function based on `_currentConfigTab`
- `switchTab('config')` now calls `_loadCurrentConfigSub()`
- Escape key handler updated to close all 4 new modals
- Shared helpers: `_resetCfgModal(prefix)`, `_setCfgLoading(prefix, loading)`, `_showCfgError(prefix, msg)` — all use `${prefix}FormActions/FormLoading/FormError/ErrorMsg` element IDs
- Full CRUD for each table:
  - Companies: `loadCfgCompanies` / `_renderCfgCompanies` / `openCfgCompanyModal` / `closeCfgCompanyModal` / `saveCfgCompany` / `deleteCfgCompany` — also calls `_loadAdminCompanies()` after save/delete to refresh edit-user company dropdown
  - Request Categories: `loadCfgCategories` / `_renderCfgCategories` / `openCfgCategoryModal` / `closeCfgCategoryModal` / `saveCfgCategory` / `deleteCfgCategory`
  - Request Types: `loadCfgTypes` / `_renderCfgTypes` / `openCfgTypeModal` / `closeCfgTypeModal` / `saveCfgType` / `deleteCfgType` — `openCfgTypeModal` is async and fetches `_cfgCategoriesCache` if empty
  - Non-Software Items: `loadCfgNsi` / `_renderCfgNsi` / `openCfgNsiModal` / `closeCfgNsiModal` / `saveCfgNsi` / `deleteCfgNsi`

### Completed in prior sessions (already in working tree, still uncommitted):

**IT Online Helpdesk (large feature):**
- DB migration `helpdesk_schema`: `ticket_number_seq` sequence, `RGMC-XXXXX` auto-assigned ticket numbers on `issues`, back-filled existing rows to `RGMC-00000`. New columns on `issues`: `ticket_number`, `from_helpdesk`, `ticket_type`, `anydesk_id`, `request_category`, `request_subcategory`, `request_type_name`, `business_impact`, `urgency`, `priority`. `anydesk_id TEXT` on `users`. New lookup tables: `request_category`, `non_software_items`, `request_type`.
- New page `/helpdesk` (`templates/helpdesk.html`, `static/helpdesk.js`) — 3-section form with ticket type radio cards (hover-reveal description), priority auto-compute (P1–P4), cascading category→subcategory→request-type dropdowns, `?system=<id>` URL param pre-fill.
- Backend: `GET /helpdesk`, `GET /api/helpdesk/categories`, `GET /api/helpdesk/subcategories?category=X`, `GET /api/helpdesk/request-types?category=X`, `POST /api/helpdesk` (in `controllers/public.py` and `controllers/issues.py`).
- `send_helpdesk_email` in `services/email.py`.
- AnyDesk ID (9-digit) added to `users` table, profile page, admin user edit modal.
- Report issue: success message and email now include ticket number.
- Admin issues list: ticket_number shown in row and modal title.
- Configurations tab panel + sub-tabs + API routes in `controllers/admin.py` (all 4 tables).
- CSS for helpdesk appended to `static/style.css`.

**Prior sessions (also uncommitted):**
- Light mode default + full theme adaptation
- Username generation overhaul + middle initial
- System/Task type toggle in admin Systems tab
- Removed auth wall from issue reporting — public form
- Post-submission account suggestion banner on report_issue
- viber_number field throughout
- Logo links → `/`
- Attachment thumbnail previews + lightbox

---

## Files Actively Being Edited

All changes are **uncommitted** and sitting in the working tree.

**New files (untracked):**
- `templates/helpdesk.html` — full helpdesk page (new)
- `static/helpdesk.js` — helpdesk JS (new)

**Modified files (this session):**
- `templates/admin.html` — added 4 config modals (cfgCompany, cfgCategory, cfgType, cfgNsi) before the Toast div
- `static/admin.js` — added 10 state vars, `switchConfigTab`, `_loadCurrentConfigSub`, 3 shared helpers, full CRUD for 4 config tables; updated `switchTab` and Escape handler

**Modified files (prior sessions, still uncommitted):**
- `controllers/public.py` — helpdesk route + 4 API endpoints
- `controllers/issues.py` — `_submit_helpdesk_issue()`, `api_submit_helpdesk()`, ticket_number in `_submit_issue()`
- `controllers/profile.py` — anydesk_id in select, response, PATCH
- `controllers/admin.py` — anydesk_id in user select/allowed; 8 config CRUD routes for 4 tables
- `services/email.py` — `send_helpdesk_email`, `send_report_email` updated with ticket_number
- `static/profile.js` — anydesk_id read/write/validate
- `static/report_issue.js` — shows ticket number in success message
- `static/style.css` — helpdesk CSS block appended (~130 lines)
- `static/theme.js` — theme improvements
- `templates/profile.html` — IT Info section with anydesk_id field
- `templates/report_issue.html` — UI changes
- `templates/access_result.html` — UI changes
- `templates/developer.html` — UI changes
- `templates/index.html` — UI changes
- `models/access.py` — model changes

---

## Failed Attempts

None this session. All edits applied on the first attempt.

---

## Next Step

**Commit all changes.** Run via PowerShell (Git must use PowerShell, not Bash):

```powershell
git add templates/helpdesk.html static/helpdesk.js controllers/public.py controllers/issues.py controllers/profile.py controllers/admin.py services/email.py static/admin.js static/profile.js static/style.css static/theme.js static/report_issue.js templates/admin.html templates/profile.html templates/report_issue.html templates/access_result.html templates/developer.html templates/index.html models/access.py handoff.md
git commit -m "add IT helpdesk page, ticket numbering, anydesk_id, configurations tab"
```

---

## Context & Gotchas

- **Git must use PowerShell, not Bash.** The Git Bash binary (`bash.exe`) crashes with `msys-2.0.dll` fatal error on this machine. All git commands must go through the PowerShell tool.

- **Edit tool requires prior Read.** Read target files in the current session before editing — the tool will error if you haven't read the file first.

- **Supabase via REST, no ORM.** Service key bypasses RLS — no additional policy setup needed for new lookup tables. Use `supabase_req(method, path, data=, params=, extra_headers=)`.

- **ticket_number DEFAULT** is a PostgreSQL sequence-backed expression (`RGMC-XXXXX`). Existing rows were back-filled to `RGMC-00000` (no UNIQUE constraint on this column — duplicates allowed).

- **config-sub-panel visibility** is toggled via `style.display` in JS, not CSS classes. The HTML has `style="display:none;"` on all sub-panels except companies (which loads first). `switchConfigTab()` sets them directly.

- **cfgTypeModal category dropdown** is populated async: `openCfgTypeModal` is declared `async` and fetches `_cfgCategoriesCache` on first open if empty. This is the only async open function among the 4 config modals.

- **Company save also refreshes `_loadAdminCompanies()`** to keep the user-edit modal's company dropdown in sync with any newly added/deleted companies.

- **Helpdesk subcategory cascade:**
  - `Software/Application` → `GET /systems?is_visible=eq.true` → `{value: id, label: name}`
  - `Hardware` / `Network` → `GET /non_software_items?category=eq.X` → `{value: subcategory, label: subcategory}`

- **Priority matrix:** P1=high+high, P2=high+medium (or reverse), P3=medium+medium, P4=everything else.

- **AnyDesk ID:** 9 digits exactly. Validated client-side (regex) and server-side in `_submit_helpdesk_issue`. Stored as TEXT (not integer — leading zeros possible).

- **Theme localStorage contract.** Key is `rgmc-theme`. Absence = light. Only `"dark"` is ever written.

- **`var(--surface-2)` was a bug** previously fixed in `static/style.css`.

- **URL param shortcut for system issues:** `/helpdesk?system=<system_id>` pre-fills category=Software/Application, ticket_type=incident_problem, request_type=Bug Fix, and selects the system in the subcategory dropdown.
