# Handoff

## Goal

Maintain and extend the **RGMC Gateway** — a Flask-based internal portal for RGMC Group that handles system access requests, issue reporting, a developer Kanban board, and an admin panel. The app uses Supabase as the database/storage backend and vanilla JS + HTML/CSS on the frontend (no framework).

No deployment pipeline exists — changes are served directly via Flask and committed to the `master` branch.

---

## Current State

**Brands tab feature is implemented in code but the seed data has not been confirmed as inserted yet.**

The `brands` table already existed in Supabase (created before this session). The feature was implemented in this session but there was an initial column-name mismatch (see Failed Attempts). After fixing the column names, the list endpoint was successfully being called (no more 400 error reported). Seed data still needs to be confirmed inserted via `brands_migration.sql`.

Working tree has **one uncommitted change**: `handoff.md` (from the previous session — was listed as "clean" but git status at session start showed `M handoff.md`).

---

## Files Actively Being Edited

- `controllers/admin.py` — added 3 new routes for the brands config CRUD (GET list, POST create, PATCH/DELETE by code). Uses correct column names: `brand_code`, `brand_name`, `brand_initial`, `brand_desc`. Routes live at `/api/admin/config/brands` and `/api/admin/config/brands/<code>`.

- `templates/admin.html` — added:
  1. "Brands" button in `#configSubTabs` (line ~126): `<button class="status-tab" data-ctab="brands" onclick="switchConfigTab('brands')">Brands</button>`
  2. `#config-panel-brands` sub-panel div with toolbar + `#config-brands-body` container (before the NSI panel, ~line 169)
  3. `#cfgBrandModal` — full Add/Edit Brand modal with fields: Brand Code (disabled on edit), Initials, Brand Name, Description textarea. Uses `cfgBrand` prefix for all form state IDs.

- `static/admin.js` — added:
  1. State vars: `_cfgBrandsCache = []` and `_cfgBrandEditCode = null` (line ~65–69)
  2. `loadCfgBrands()` hook in `_loadCurrentConfigSub()` (line ~1475)
  3. `closeCfgBrandModal()` in the Escape keydown handler
  4. Functions block before `_buildPrintHtml`: `loadCfgBrands`, `_renderCfgBrands`, `openCfgBrandModal`, `closeCfgBrandModal`, `overlayCfgBrand`, `saveCfgBrand`, `deleteCfgBrand`
  - Table renders columns: Code, Initials, Name, Description
  - Field mapping: `b.brand_code`, `b.brand_initial`, `b.brand_name`, `b.brand_desc`
  - PATCH payload: `{ brand_name, brand_initial, brand_desc }`
  - POST payload: `{ brand_code, brand_name, brand_initial, brand_desc }`

- `brands_migration.sql` — **seed-only SQL** (table already exists). Run this in Supabase SQL Editor to populate all 50 brands. Uses `ON CONFLICT (brand_code) DO NOTHING`. Columns used: `brand_code`, `brand_name`, `brand_initial`, `brand_desc`.

---

## Failed Attempts

- **What was tried**: Initial implementation used column names `name`, `initials`, `description` for the brands table — **Why it failed**: The actual Supabase table schema uses `brand_name`, `brand_initial`, `brand_desc` (and `brand_id` as the auto-increment PK). The PostgREST call returned a 400 Bad Request error when trying to `ORDER BY name.asc` on a column that doesn't exist. Fixed by updating all three files to use the correct column names.

---

## Next Step

Run `brands_migration.sql` in the **Supabase SQL Editor** to seed all 50 brands into the existing `brands` table:

1. Go to Supabase Dashboard → SQL Editor → New Query
2. Paste and run contents of `brands_migration.sql`
3. Reload the Admin Panel → Configurations → Brands tab to verify all 50 rows appear

After confirming the seed data is in, commit the changes:
```
git add controllers/admin.py templates/admin.html static/admin.js brands_migration.sql handoff.md
git commit -m "add Brands config tab with full CRUD and seed data"
```
*(Use PowerShell tool — Bash crashes on this machine)*

---

## Context & Gotchas

- **Git must use PowerShell, not Bash.** The Git Bash binary (`bash.exe`) crashes with `msys-2.0.dll` fatal error on this machine. All git commands must go through the PowerShell tool.

- **Edit tool requires prior Read.** Read target files in the current session before editing — the tool will error if you haven't read the file first.

- **Supabase via REST, no ORM.** Service key bypasses RLS — no additional policy setup needed for new lookup tables. Use `supabase_req(method, path, data=, params=, extra_headers=)`.

- **Brands table actual schema:** `brand_id` (serial PK), `brand_code` (text, unique), `brand_name` (text), `brand_desc` (text), `brand_initial` (text). The table was pre-existing before this session. Do NOT use `name`, `initials`, or `description` — those are wrong.

- **config-sub-panel visibility** is toggled via `style.display` in JS, not CSS classes. All sub-panels except the first (companies) have `style="display:none;"` in HTML. `switchConfigTab()` toggles them by matching `p.id === 'config-panel-${ctab}'`.

- **`_resetCfgModal`, `_setCfgLoading`, `_showCfgError`** are shared helpers that take a prefix string (e.g. `'cfgBrand'`) and resolve element IDs like `cfgBrandFormActions`, `cfgBrandFormLoading`, `cfgBrandFormError`, `cfgBrandErrorMsg`. The modal HTML must use these exact IDs.

- **Brand code is immutable after creation.** The `cfgBrandCode` input is disabled when editing (`codeField.disabled = !!_cfgBrandEditCode`). PATCH route filters by `brand_code` in query param, never updates it.

- **`helpdesk.js` has no `script.js` dependency.** The helpdesk page only loads `theme.js` + `helpdesk.js`. Any shared utilities must be defined locally.

- **File preview uses managed `_hdFiles` array, not the input's FileList.** The file input is cleared with `input.value = ''` after each pick. Do NOT read from `document.getElementById('hdAttachments').files` — it will be empty.

- **Priority note element (`hdPriorityNote`) starts empty.** Built entirely by JS in `hdComputePriority()`.

- **`.hd-section-label` and `.hd-divider` now have small margins** (`4px`) because the parent form has `gap: 18px`. Do not restore the old `28px` margins.

- **ticket_number DEFAULT** is a PostgreSQL sequence-backed expression (`RGMC-XXXXX`). Existing rows were back-filled to `RGMC-00000`.

- **Theme localStorage contract.** Key is `rgmc-theme`. Absence = light. Only `"dark"` is ever written.

- **Helpdesk subcategory cascade:**
  - `Software/Application` → `GET /systems?is_visible=eq.true`
  - `Hardware` / `Network` → `GET /non_software_items?category=eq.X`

- **Priority matrix:** P1=high+high, P2=high+medium (or reverse), P3=medium+medium, P4=everything else.

- **AnyDesk ID:** 9 digits exactly. Validated client-side (regex) and server-side. Stored as TEXT.

- **URL param shortcut for system issues:** `/helpdesk?system=<system_id>` pre-fills category, ticket type, request type, and subcategory.
