# Handoff

## Goal

Maintain and extend the **RGMC Gateway** — an internal Flask web portal for RGMC Group that serves as a central hub for:
- Accessing internal systems (RGMC, SBIC, NAV Sites, Windows-based apps, task launchers)
- Submitting IT helpdesk tickets and general helpdesk requests
- Admin management of users, access requests, systems, and configuration tables
- Issue tracking with rich resolution workflows (actions, dev items, tasks, common fixes)
- Developer performance analytics

The portal uses Flask + Supabase (PostgREST API) for the backend and vanilla JS + HTML/CSS for the frontend. No build step — everything is served directly from Flask.

---

## Current State

**Two uncommitted changes are sitting in the working directory** — ready to commit. All other files are clean.

**Recent commits (newest first):**
- `0eed976` — added playwright items and the tour page (Playwright screenshot capture script + `static/tour-screenshots/`)
- `90bdba0` — add real screenshots and swipe/keyboard navigation to tour modals
- `1352c9c` — added gateway tour
- `9fafc95` — added take a tour animations

**Pending changes (not yet committed):**

1. `static/admin.js` — Added `_renderIssueKpiCounts(rows)` function (at line ~1532) that recalculates all KPI card numbers from filtered rows. Called at the end of both `issApplyFilters()` (~line 1685) and `issApplyFilters_noReset()` (~line 1794). Fixes the bug where Total/Open/etc. KPI counts didn't update when date filters were toggled.

2. `static/css/issue-tracker.css` — Fixed tooltip positioning on KPI info icons (~lines 1021–1054). Changed tooltip from appearing **above** the info icon (`bottom: calc(100% + 10px)`) to **below** it (`top: calc(100% + 8px)`). Updated entrance animation direction and flipped the caret arrow to point upward.

---

## Files Actively Being Edited

- `static/admin.js` — Modified; `_renderIssueKpiCounts(rows)` added, two call sites added. **Uncommitted.**
- `static/css/issue-tracker.css` — Modified; tooltip direction flipped from above to below. **Uncommitted.**

**Key reference files (unchanged, but important to know):**
- `static/admin.js` — Monolithic ~1900+ line admin panel JS
- `static/css/issue-tracker.css` — Issue tracker / KPI card styles
- `templates/admin.html` — Admin panel template; KPI card HTML (~lines 169–270) with `.iss-kpi-info-wrap` + `.iss-kpi-tooltip` per card
- `templates/index.html` — Portal homepage template
- `static/script.js` — Portal homepage JS (includes tour system)
- `static/tour-screenshots/` — 9 PNG screenshots captured via Playwright from live site

---

## Failed Attempts

None in this session — both fixes implemented correctly on first pass.

**From prior sessions (tour/screenshot work):**
- **`filterSystems([])` with empty array hides all cards**: Empty array creates empty Set — every card gets `display:none`. Fix: extract actual card names from DOM first, then pass them.
- **`/issues` route returns 404**: Issues are in `/workspace`, not a standalone route.
- **`/common-fixes` route returns 404**: Common fixes are in the admin panel; navigate via `switchTab('commonfix')`.
- **Tour overlay blocking screenshots**: Tour auto-shows on first visit. Fix: `localStorage.setItem('rgmc_tour_done_earellano', '1')` in `page.addInitScript()`.
- **Main content invisible in Playwright**: Uses `visibility:hidden` until `applySession()` runs. Fix: `waitForFunction(() => document.getElementById('mainContent')?.style.visibility === 'visible')`.

---

## Next Step

Commit the two pending files and push:

```bash
git add static/admin.js static/css/issue-tracker.css
git commit -m "fix: KPI counts update with date filters; fix tooltip position on issues list"
git push
```

Then verify on the live admin panel at `https://rgmc-gateway-935246372408.asia-southeast1.run.app/admin`:
1. Go to the Issues tab
2. Toggle a date preset (e.g., "Today") — Total, Open, etc. KPI cards should update to reflect the filtered count
3. Hover an info `i` icon on any KPI card — tooltip should appear **below** the icon

---

## Context & Gotchas

**Architecture:**
- Flask + Supabase (PostgREST) + Vanilla JS — no build step, no bundler
- CSS manifest: `static/style.css` imports all partials via `@import url('css/...')`. Add new CSS files to this manifest, or edit the relevant partial directly.
- `static/admin.js` is monolithic (~1900+ lines). State globals at the top. Key ones: `_issuesCache` (all fetched issues), `_issFilteredRows` (current filter result), `_lastAdminVisit` (ISO string for "new" issue threshold), `_currentIssueStatus` (active tab: `'all'`, `'open'`, etc.).

**KPI update design decision:**
- `_renderIssueKpiCounts(rows)` intentionally does NOT update the sidebar open-issues badge (`#openIssuesCount`) or new-issues badge (`#newIssuesCount`). Those are left to `_renderIssueKpis()` (called at load time with full `_issuesCache`) so the sidebar always shows real unfiltered counts.

**Tooltip anchor structure:**
- `.iss-kpi-info-wrap` is `position: absolute; top: 7px; right: 8px` inside each `.iss-kpi-card`
- `.iss-kpi-tooltip` is `position: absolute` relative to `.iss-kpi-info-wrap`
- Switched from `bottom: calc(100% + 10px)` (above icon) to `top: calc(100% + 8px)` (below icon)
- The `::after` caret arrow was also flipped: `bottom: 100%` + `border-bottom-color` instead of `top: 100%` + `border-top-color`

**Auth pattern:**
- Session stored in `localStorage` under `rgmc_gateway_session` (set by login, read by `initGate()` / `applySession()`)
- All admin routes call `_require_admin()` from `services/guards.py`, which returns `(user, None)` or `(None, (error_dict, status_code))`

**Supabase calls:**
- All DB access via `supabase_req(method, path, params, data, extra_headers)` in `services/supabase.py`
- PostgREST URL params: `"status": "eq.pending"`, `"order": "created_at.desc"`, `"or": "(field.ilike.*q*,...)"`

**Systems cache:**
- `get_sites()` is memory-cached. After any system CRUD, call `_invalidate_sites_cache()` — forgetting this leaves stale system lists on the portal homepage.

**Storage buckets:**
- Windows launcher/manifest files → `system-files` bucket
- Issue attachments and common-fix attachments → `issue-attachments` bucket (common fixes use `cf/<fix_id>/` prefix)

**Tour screenshots:**
- Playwright capture script: `capture-tour-screenshots.js` (run with `node capture-tour-screenshots.js`)
- Injects fake session + marks tour as done via `page.addInitScript()` before page load
- Uses `filterSystems(names)` with DOM-extracted card names to reveal all system cards
- Deployed URL used: `https://rgmc-gateway-935246372408.asia-southeast1.run.app`

**PDF export:**
- `issExportPDF()` in `static/admin.js` uses `_issFilteredRows` (updated by both filter functions) — already works with filtered data.

**User roles:**
- `is_admin`, `is_developer`, `is_management`, `is_department_head` are boolean columns on `users` table.

**Supabase MCP:**
- DB migrations can be applied via `mcp__supabase__apply_migration`. Available for future schema changes.
