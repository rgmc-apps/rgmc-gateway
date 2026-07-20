# Handoff

## Goal

Maintain and extend the RGMC Gateway — a Flask internal portal for RGMC Group with issue tracking, IT helpdesk, developer board (kanban/list/epics), admin panel, and access management. Dark luxury theme (`--gold: #C4972A`, `--bg: #080604`), fonts: Plus Jakarta Sans + Playfair Display.

This session completed six features across two commits:
1. **"Duplicate as…" on dev items** — copy a dev item as a different item type, status resets to pending
2. **Epic share link** — share button copies `?epic=<id>` URL; deep links auto-open the epic page
3. **Dev item types in admin config** — "Dev Item Types" sub-tab in admin → Configurations
4. **Color coding for item types** — DB-backed hex color per type, color pickers in gear modal + admin config, inline-style badges replace hardcoded CSS classes
5. **Issue alert panels** — "Open & Urgent" (P1/P2 open issues) and "Stalled In-Progress" (in-progress > 7 days) panels on the admin issues screen
6. **`story_points` on item create** — POST `/api/dev/items` now accepts `story_points` so duplicated items preserve SP

## Current State

**All features fully implemented. Working tree is clean (no uncommitted changes). Latest commit: `c6eb3ea`.**

### Duplicate as… — DONE
- "Duplicate as…" button appears in dev item detail modal footer (left side, next to Delete), only for existing items (hidden for new)
- Clicking opens a dropdown of all other active item types (excludes current type)
- `duplicateItemAs(targetTypeName)` POSTs a copy with `status: 'pending'` and all fields from source, then opens the new item's detail modal
- `_buildDupTypeMenu()` / `toggleDupTypeMenu(e)` handle menu build and toggle
- Clicking outside closes the menu (document click handler)
- CSS: `.dup-type-wrap`, `.btn-detail-dup`, `.dup-type-menu`, `.dup-type-option`, `.dup-type-empty` in `dev-board.css`

### Epic Share — DONE
- Share button in `epic-page-nav-actions` (left of Edit) copies `?epic=<epic_id>` URL to clipboard via `navigator.clipboard`
- `openEpicPage(epicId, { pushState })` pushes history state; `closeEpicPage()` pops it
- On page load, checks `URLSearchParams` for `?epic=` param; if found, calls `setViewMode('epics')` then `openEpicPage`
- `popstate` listener handles browser back/forward through epics
- CSS: `.epic-page-share-btn` added to existing nav button rule in `dev-board.css`

### Dev Item Types in Admin Config — DONE
- New "Dev Item Types" sub-tab in admin → Configurations panel
- Table shows colored badge preview, sort order, freeform flag, active status, Edit/Delete buttons
- Modal has: Name, Badge Color picker, Sort Order, Active toggle, Freeform toggle
- Uses existing `/api/dev/item-types` endpoints from `controllers/developer.py` (accessible by admins via `_require_developer` which accepts admins)
- JS: `loadCfgDevItemTypes`, `_renderCfgDevItemTypes`, `openCfgDevItemTypeModal`, `closeCfgDevItemTypeModal`, `saveCfgDevItemType`, `deleteCfgDevItemType` appended to `admin.js`
- State: `_cfgDevItemTypesCache`, `_cfgDevItemTypeEditId` added at top of `admin.js`
- Escape key closes the modal (added to keydown handler in `admin.js`)

### Color Coding — DONE
- **Migration applied**: `dev_item_types` table has `color TEXT` column, backfilled:
  - New Feature `#22d3ee`, Improvement `#60a5fa`, Bug Fix `#f87171`, Admin Task `#fbbf24`, Discussion `#c4b5fd`, Maintenance `#94a3b8`, Others `#a1a1aa`
- **Badges**: Replaced `TYPE_CLASS` map + CSS classes with `_typeColor(name)` + `_colorBadgeStyle(hex)` helpers generating inline `rgba` styles. Works for any type name.
- **Gear modal rows**: `<input type="color">` swatch per row → `saveItemTypeColor(id, color)` on `onchange`
- **Add type form** in gear modal: color swatch `id="newItemTypeColor"` included in POST payload
- **Admin modal**: Badge Color picker `id="cfgDevItemTypeColor"` next to Name field
- **Backend**: `color` accepted in POST and PATCH item type endpoints (`developer.py`)
- **CSS**: `.itype-color-swatch`, `.itype-color-swatch--lg` in `dev-board.css`

### Issue Alert Panels — DONE
- Two panels inserted between KPI strip and filter bar in `panel-issues` (`admin.html`)
- **Open & Urgent** (`#issUrgentPanel`): `status === 'open'` AND priority P1 or P2; sorted P1-first then oldest-first; red-accented
- **Stalled In-Progress** (`#issStalledPanel`): `status === 'in_progress'` AND `_daysSince(created_at) > 7`; sorted oldest-first; amber-accented
- Both draw from `_issuesCache` directly (unaffected by active filters/date range)
- Both hidden when empty; collapsible by clicking header (chevron rotates)
- `_renderIssuePriorityPanels(all)` called from `loadIssues()` after cache population
- `toggleIssAlertPanel(type)` handles collapse state; `_daysSince(dateStr)` is a shared helper
- Compact table rows are clickable → `openIssueModal(id)`
- Age pills: `iss-age-pill--urgent` (red, for urgent panel), `iss-age-pill--warn` (amber, 8–14 days), `iss-age-pill--critical` (deep red, 15+ days)
- CSS: `.iss-alert-panels`, `.iss-alert-panel`, `.iss-alert-header`, `.iss-alert-icon`, `.iss-alert-title`, `.iss-alert-sub`, `.iss-alert-count`, `.iss-alert-chevron`, `.iss-alert-body`, `.iss-alert-table`, `.iss-alert-row`, `.iss-alert-desc`, `.iss-alert-site`, `.iss-age-pill`, `.iss-alert-open-btn` appended to `issue-tracker.css`

## Files Actively Being Edited

All files are in clean committed state.

- `templates/developer.html` — Added: "Duplicate as…" dropdown in item footer; Share button in epic nav; color swatch in gear modal "add type" form; color picker in `#itemTypesModal`
- `templates/admin.html` — Added: Dev Item Types sub-tab + sub-panel + modal; issue alert panels HTML (`#issAlertPanels`, `#issUrgentPanel`, `#issStalledPanel`); `cfgDevItemTypeModal`
- `static/developer.js` — Added: `_typeColor`, `_colorBadgeStyle`, `typeBadge` rewrite; `saveItemTypeColor`; `_buildDupTypeMenu`, `toggleDupTypeMenu`, `duplicateItemAs`; `shareEpicPage`; `openEpicPage` updated with `pushState` option; `closeEpicPage` updated with history pop; `popstate` listener; deep link init; `_renderIssuePriorityPanels` logic
- `static/admin.js` — Added: `_cfgDevItemTypesCache`, `_cfgDevItemTypeEditId` state; all `CfgDevItemType*` functions; `_renderIssuePriorityPanels`, `_renderUrgentPanel`, `_renderStalledPanel`, `toggleIssAlertPanel`, `_daysSince`, `_agePill`; `_loadCurrentConfigSub` updated; escape handler updated
- `static/css/dev-board.css` — Added: `.epic-page-share-btn`; `.dup-type-wrap` / `.btn-detail-dup` / `.dup-type-menu` / `.dup-type-option`; `.itype-color-swatch`
- `static/css/issue-tracker.css` — Added: all `.iss-alert-*` and `.iss-age-pill-*` styles
- `controllers/developer.py` — Added: `story_points` accepted in POST `/api/dev/items`; `color` accepted in POST and PATCH `/api/dev/item-types`
- `supabase-migrations/dev_item_types_migration.sql` — Created (earlier session): `dev_item_types` table definition + seed

## Failed Attempts

- **`TYPE_CLASS` removal**: First attempt tried string replacement with backslash-escaped characters in `typeCls` — the file had forward slashes; matched after re-reading exact file content.
- **PowerShell `Add-Content` via Bash tool**: Failed — PowerShell commands must use the PowerShell tool, not Bash. Switched to PowerShell tool for CSS append operations.
- **Edit tool on `dev-board.css` without reading first**: Failed with "file not read" error after the file was modified by `Add-Content`. Always read or use `Add-Content` → PowerShell before editing.

## Next Step

**Test the "Duplicate as…" feature end-to-end:**
1. Start the Flask server and open the Developer board
2. Open any existing dev item's detail modal
3. Verify "Duplicate as…" button appears in the footer (left side, next to Delete)
4. Click it — dropdown should appear listing all other active item types (excluding the current item's type)
5. Click a type — should create a new item with all same fields, `status: pending`, and open it immediately
6. Verify story points, epic, assigned_to, and system_ids all copied correctly

**Then test the alert panels:**
1. Go to Admin → Issues
2. Panels should appear if any open P1/P2 issues exist or any in-progress issues are older than 7 days
3. Test collapse/expand by clicking panel headers
4. Test clicking a row opens the issue modal

## Context & Gotchas

- **`_require_developer` accepts admins** — so the `/api/dev/item-types` endpoints are accessible from the admin config page without adding new admin-specific routes.
- **`_typeColor` depends on `_itemTypes` being populated** — if called before `loadItemTypes()` resolves, it returns the fallback `#a1a1aa`. This is fine since rendering only happens after init.
- **Freeform type detection** — `_typeColor` and `typeBadge` check `is_freeform` to match "Others: custom text" format. Any type can be freeform (not just "Others"). Stored as `"TypeName: custom text"` in `dev_item_type` field.
- **`duplicateItemAs` opens the new item** — after POSTing, calls `loadItems()` to refresh cache, then `openDetailModal(created.id)`. The item must be in cache before opening. Since `loadItems()` is awaited, this should work.
- **Stalled panel uses `created_at` not `in_progress_since`** — no `status_changed_at` exists in the schema. Age is from ticket creation, not from when it moved to in_progress. This is labeled "age" in the UI.
- **Alert panels hidden when empty** — `panel.style.display = issues.length ? '' : 'none'`. They won't appear cluttering the UI when nothing is critical.
- **Color pickers in gear modal save on `onchange`** — fires when the native color picker closes. The PATCH request is only sent if `color !== t.color` to avoid unnecessary API calls.
- **Epic share uses `navigator.clipboard`** — requires HTTPS in production. On HTTP localhost it may fail silently; the catch shows an error toast with the URL instead.
- **Deep link init**: `openEpicPage(epicParam, { pushState: false })` is called with `pushState: false` to avoid double-pushing state on initial load.
- **Design tokens** in `static/css/variables.css`: `--gold: #C4972A`, `--bg: #080604`, `--bg-surface: #0F0C07`, `--bg-card: #0D0A06`, `--text-primary: #EDE5D0`, `--text-secondary: #A89060`, `--border: rgba(196,151,42,0.2)`.
- **No build step**: plain HTML/CSS/JS — edit and reload.
- **Supabase**: PostgREST via `supabase_req()` helper. All tables in `public` schema.
- **Flask stack**: Python 3.12, smtplib (no external email lib), Supabase PostgREST.
- **Global JS state (developer.js)**: `_items`, `_epics`, `_members` (keyed by username), `_systems`, `_itemTypes`, `_epicPageId`, `_epicPageItems`, `_editingId`
