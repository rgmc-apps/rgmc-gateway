# Handoff

## Goal
Maintain and extend the RGMC Gateway developer board (`/dev`). This is an internal Flask portal with a Supabase backend. The session completed three independent features on the developer board and is in a clean, working state with no pending work.

## Current State
All three features from this session are fully implemented and the codebase is clean:

1. **Epic description HTML rendering** — Fixed. Rich text editor stores HTML; was displaying raw tags.
2. **Decimal story points** — Fixed. DB column changed to NUMERIC(5,2), UI allows 0.25 steps.
3. **Actual story points computation** — Implemented. Actual SP = days from `start_date` to `actual_end_date` for done items. Shown in list tables and analytics.

No files are in a mid-edit state. Everything is complete.

## Files Actively Being Edited

- `templates/developer.html` — Three changes:
  1. Line ~403: `<p id="epicPageDesc">` → `<div id="epicPageDesc">` (block elements from rich editor can't go inside `<p>`)
  2. Line ~596: SP input `step="0.25"` `min="0.25"`, hint updated to "(1 pt = 1 day, 0.5 = half day)"
  3. Lines ~305–313: Added two new analytics chart containers (`anaSpAccuracyChart`, `anaSpDevTable`) in a `ana-charts-grid--2col` grid

- `static/developer.js` — Multiple changes:
  1. Line ~2927: `descEl.textContent` → `descEl.innerHTML` (render HTML from rich editor)
  2. Line ~44–52: Added `actualSP(item)` function after `daysElapsed()` — returns daysElapsed only for done items with both start and end dates
  3. Added `_spCell(item)` helper before `renderListView()` — renders SP cell with estimated + actual badges (gold `est`, colored `act`: green=on track, orange=over, blue=under)
  4. Line ~1462: `parseInt(v, 10)` → `parseFloat(v)` for story_points form read
  5. SP totals now use `.toFixed(2)` + `parseFloat()` to avoid float precision artifacts (two locations: epic card and epic page)
  6. List table, parked table, epic page table: SP column now uses `_spCell(item)` instead of inline template
  7. Analytics KPIs (`_renderAnaKpis`): Added 3 new KPI cards — Est. Story Points, Actual Story Points, Avg SP Accuracy (% of actual/estimated; warns orange if >120%)
  8. `renderAnalytics()`: Added call to `_renderAnaSpAccuracyChart(items)`
  9. Added `_renderAnaSpAccuracyChart()` function — renders accuracy distribution bar chart (≤50% to >150% buckets) and a developer SP summary table

- `controllers/developer.py` — Line ~59: `int(raw_sp)` → `float(raw_sp)` for story_points parse on item create/update

- `static/css/dev-board.css` — Added:
  1. `.dlt-sp-actual`, `.dlt-sp-over`, `.dlt-sp-under`, `.dlt-sp-exact`, `.dlt-sp-actual-only` — badge styles for actual SP display
  2. `.ana-charts-grid--2col` — two-column analytics grid variant
  3. Responsive collapse: `ana-charts-grid--2col` → single column at ≤900px

- `supabase-migrations/story_points_migration.sql` — Updated to document NUMERIC(5,2) column type (migration already applied to live DB via MCP)

## Failed Attempts
None. All changes were applied cleanly on the first attempt. The only minor issue was a string mismatch on `parseInt` in developer.js — the exact whitespace differed from what was expected; fixed by reading the file first.

## Next Step
No immediate next step — session is complete. If the user wants to continue, likely candidates are:

1. **Test the actual SP feature** — create a dev item, set a start date and story points, move it to done, verify the list table shows both `est` and `act` badges, and check the analytics SP charts populate.
2. **Velocity tracking** — the user may want to add a velocity trend chart (actual SP per week/month over time) as a follow-on to the SP analytics work.
3. **Kanban card SP display** — kanban cards currently show elapsed days but not actual SP badges. Could add actual SP to kanban done cards for consistency with the list table.

## Context & Gotchas

- **1 SP = 1 calendar day** — this is the domain definition. Actual SP is computed as `Math.floor((actual_end_date - start_date) / 86400000)`, i.e., whole days only, no time-of-day.
- **`actualSP` is null for non-done items** — in-progress items show elapsed days (current time − start), but this is NOT "actual SP" until the item is done. The distinction is important: elapsed is a live counter, actual SP is a fixed final value.
- **DB column is NUMERIC(5,2)** — max 999.99 story points. The Supabase migration `story_points_decimal` was already applied live via MCP tool.
- **Float precision** — JS floating point: `0.5 + 0.25 = 0.7500000000000001`. All SP totals go through `.toFixed(2)` + `parseFloat()` to clean up. This is in effect in both the epic card and epic page total calculations.
- **Rich editor stores HTML** — `item.description` and `epic.epic_description` both contain raw HTML from the rich text editor (`initRichEditor`). Use `innerHTML` to render, never `textContent`. The `_descPreview()` helper strips tags for short text previews using a temp div + `innerText`.
- **Auth pattern** — all API calls use `authHeaders()` which reads `localStorage.getItem('rgmc_gateway_session')` and sends `X-Gateway-Username`. Backend reads `request.headers.get("X-Gateway-Username")`.
- **Supabase via proxy** — backend uses `supabase_req()` helper in `services/supabase.py`, not a JS client. All DB operations go through Flask.
- **`ana-charts-grid--2col`** does NOT exist in the existing grid system — it was added this session. If you see analytics layout issues, check that this class is present in `dev-board.css`.
