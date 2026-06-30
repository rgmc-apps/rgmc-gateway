# Handoff

## Goal

Ongoing development and polish of the **RGMC Gateway** — an internal Flask portal for RGMC Group. The portal has a home screen (systems launcher), an admin panel, a developer board, a user workspace (`/workspace`), and several helpdesk screens. The broad goal is to keep the portal production-quality: correct behavior, consistent dark-mode design, and no banned visual patterns.

No single end-state; the user iterates on features as needs arise. Active design system: gold-on-near-black dark theme with warm light mode. The impeccable skill (`/impeccable`) is loaded and its context files (`PRODUCT.md` / `DESIGN.md`) exist in the project root.

---

## Current State

**All clean.** Working tree is clean, branch is `master`, ahead 0 / behind 0 of `origin/master`. All three tasks completed this session are committed.

### Completed this session

**Polish pass** (commit `b98b9cb`):
- `:root` now defines `--text`, `--text-dim`, `--bg-inner`, `--radius-card` aliases (16+ previously undefined variable references now resolve instead of falling back to browser defaults)
- `.dev-stat-pill`: 3px `border-left` stripe converted to 2px `border-top` accent per status
- `.kanban-card`: 3px `border-left var(--dev-clr)` converted to 2px `border-top`
- `.kanban-skel`: 3px `border-left` (CSS rule + JS inline style at `developer.js:344`) converted to 2px `border-top`
- `.ci-res-notes` and `.gcm-detail`: banned side-stripe borders converted to full borders with background tint
- All `.dp-s-*`, `.dp-status-*`, `.dp-prio-*`, `.dp-badge-admin/.dev` classes now use dark-mode rgba defaults (were hardcoded light-mode colors showing garish light chips inside dark modal)
- `@media print` block has `!important` overrides to restore legible light-mode badge colors for PDF output
- `.btn-dp-pdf`: pill border-radius, lift-on-hover transition, active scale state
- `.dp-pdf-preset:hover`: gold background feedback added
- `.btn-modal-reject`: `color: #fff` changed to `color: #fef8ef` (warm tinted white)
- All template footers: `&mdash;` replaced with `&middot;` in `index.html`, `access_result.html`, `general_helpdesk.html`, `helpdesk.html`, `report_issue.html`
- `general_helpdesk.html` modal button copy: `Continue here &mdash;` changed to `Continue here:`

**My Team tab bug fix** (commit `7d81a57`):
- Root cause: `_ensureTeamMembersLoaded()` runs at `DOMContentLoaded` to pre-fetch team members for assignee dropdowns. It populates `_teamMembers` before the user visits the team tab. `switchTab('team')` checked `if (_teamMembers === null)` which was always false after the prefetch, so `loadTeam()` (which also calls `renderTeam()`) was never called. Grid stayed empty with no console error.
- Fix in `static/user.js` line 74: changed to `if (tab === 'team') { if (_teamMembers !== null) renderTeam(_teamMembers); else loadTeam(); }`

**Reopen Issue feature** (commit `1465f72`):
- Backend: `POST /api/user/issues/<issue_id>/reopen` added to `controllers/user_page.py` (line 432+)
  - Auth: any logged-in user via `_require_user()`, not dept-head-only
  - Guard: issue must be `resolved` or `closed`, returns 400 otherwise
  - Fetches full original issue including fields not in the user-facing API response (viber_number, department, site_name, etc.)
  - Copies all contact/routing fields: employee_name, company_name, viber_number, email, department, site_name, request_to_department_id, ticket_type, request_category, urgency, priority, from_helpdesk
  - Sets `linked_issue_id` = original issue id (shows as "Linked" badge in admin panel automatically)
  - New title: `RE: {original_title}`, description = user's reason text
  - Posts a comment on the original issue's activity feed via `issue_comments` table: "Follow-up ticket #XXX opened by [username]: [reason]"
  - Fires `notify_ticket_created()` IT bot notification
  - Returns `{ success, ticket_number, issue_id }` with HTTP 201
- `templates/user.html`:
  - Reopen strip (`id="iss-reopen-section"`) inserted between `iss-modal-grid` and `iss-dh-actions` divs; hidden by default
  - New modal (`id="reopenIssueModal"`) with reason textarea, error state, and submit button; placed before the user task modal block
- `static/user.js`:
  - `openIssueDetail()` (around line 239): sets `iss-reopen-section` display based on `['resolved','closed'].includes(status)`
  - Four new functions before `/* ── Init ── */`: `openReopenModal()`, `closeReopenModal()`, `overlayCloseReopen()`, `submitReopen()`
  - `submitReopen()`: POSTs to endpoint, closes both modals on success, invalidates `_issues.team/mine/filed` caches, reloads current issue subtab, toasts new ticket number
  - Escape key handler updated to call `closeReopenModal()` before `closeIssueDetail()`
- `static/style.css`: `.btn-reopen-issue` rule added near workspace styles (around line 5477)

---

## Files Actively Being Edited

All changes are committed. Files modified this session:

- `controllers/user_page.py` — Added `user_reopen_issue` endpoint at end of file (line 432+)
- `static/user.js` — Fixed My Team tab render bug (line 74); reopen section show/hide in openIssueDetail (~line 239); 4 reopen functions before Init block; updated Escape handler
- `templates/user.html` — Added iss-reopen-section div inside issue detail modal; added reopenIssueModal before the user task modal section
- `static/style.css` — CSS variable aliases in :root; border fixes on dev-stat-pill, kanban-card, kanban-skel, ci-res-notes, gcm-detail; badge dark-mode colors; @media print overrides; btn-dp-pdf refinements; btn-modal-reject text color; btn-reopen-issue new rule
- `static/developer.js` — Line 344: skeleton inline style `border-left-color` changed to `border-top-color`
- `templates/index.html` — Footer em dash to middot in both main footer (line 260) and login gate footer (line 401)
- `templates/access_result.html` — Footer em dash to middot
- `templates/general_helpdesk.html` — Footer em dash to middot; button copy updated
- `templates/helpdesk.html` — Footer em dash to middot
- `templates/report_issue.html` — Footer em dash to middot

---

## Failed Attempts

No failed attempts this session. All changes landed on the first try.

Prior-session dead-ends worth knowing:
- **Undefined CSS variables** (`--text`, `--text-dim`, etc.): Were referenced in 16+ places but never defined, silently falling back to browser defaults (black text, transparent bg, 0 radius). Fixed by adding aliases in `:root`.
- **Dual-context badge classes** (`.dp-s-*` etc.): Used in both the dark developer modal AND the white print PDF. Light-mode colors broke the modal; dark-mode rgba broke the PDF. Solution: dark-mode rgba as the base rule + `@media print { !important }` overrides to restore light versions for PDF output.

---

## Next Step

Most natural next actions:

1. **Test public issue view**: Visit `http://localhost:5000/admin/issues/<some-uuid>` while **not** logged in — should show the read-only `issue_view.html`. Then visit the same URL while logged in as an admin — should immediately redirect to `/admin?issue=<uuid>` and auto-open the issue modal.
2. **Test reopen feature end-to-end**: Open `/workspace`, find a resolved issue, click "Reopen Issue", fill in a reason, submit. Verify: new ticket appears in issues list with "RE:" title prefix; the original issue's activity feed shows "Follow-up ticket #XXX opened by [user]: [reason]"; in the admin panel the new issue shows the "Linked" badge referencing the original.
3. **Continue polish or new feature**.

### Just completed: Public issue landing page

IT bot shares links as `<gateway>/admin/issues/<uuid>`. The old route rendered `admin.html` (admin-only). Changed so:
- `GET /admin/issues/<id>` → `issue_view.html` (new template, works without auth)
- `GET /api/public/issues/<id>` → new unauthenticated API in `public.py` (safe fields only, no email/viber/anydesk)
- `issue_view.html` JS: checks `localStorage.rgmc_gateway_session.isAdmin/isManagement` → if true, redirects to `/admin?issue=<id>`
- `static/admin.js` DOMContentLoaded: reads `?issue=<id>` from URL params and sets `window._OPEN_ISSUE_ID` so the existing auto-open modal logic handles it

---

## Context and Gotchas

**Stack**: Flask (Python) + Supabase (PostgREST) + Vanilla JS. No build step — changes are live on file save with the Flask dev server running.

**Auth pattern**: All user-facing API endpoints read `X-Gateway-Username` from the request header. JS sends it via `authHeaders()` reading `localStorage['rgmc_gateway_session']`. No JWT — plain localStorage JSON with keys: `username`, `firstName`, `displayName`, `fullName`, `avatarUrl`, `isDepartmentHead`, `isAdmin`, `isManagement`, `isDeveloper`.

**Supabase MCP**: Configured and authorized. Use `mcp__supabase__execute_sql`, `mcp__supabase__list_tables`, etc. for schema inspection or migrations. All Python DB access goes through `supabase_req()` from `services/supabase.py`.

**`linked_issue_id` column**: Already existed in the `issues` table before this session (used for duplicate-marking and issue linking from the admin panel). The reopen feature reuses it with no schema changes needed.

**`issue_comments` table schema**: `issue_id`, `username`, `comment`, `created_at`. The reopen endpoint writes here so the trace appears on the original issue's activity feed.

**IT bot notification**: `services/it_bot.notify_ticket_created(issue_dict)` is always imported inline inside `try/except` throughout the codebase so it fails silently. Keep this pattern.

**Design banned patterns** (enforced throughout): side-stripe borders (border-left/right > 1px as accent on cards or callouts), gradient text (background-clip: text), glassmorphism as default, hero-metric template, identical card grids, em dashes in copy. When found, convert — do not remove.

**CSS architecture**: `static/style.css` is ~7400 lines. Workspace/user section starts around line 5380 (`.ws-tab-panel`). Developer performance section around line 4200+. `@media print` block around line 4858. Light-mode overrides at the bottom via `[data-theme="light"]` selector.

**`_ensureTeamMembersLoaded()` caching gotcha**: Pre-fetches `/api/user/team` at page load and sets `_teamMembers` in-place but does NOT call `renderTeam()`. Code that needs to render the team grid must call `loadTeam()`, which does both fetch and render. Checking `_teamMembers === null` alone is not sufficient if the prefetch has already run — this was the exact My Team bug fixed this session.

**PDF generation**: Uses `window.print()` targeting `#devPerfPrintArea` with `@media print` CSS. Date range filter, header/branding toggles, and preset buttons (30 Days, 90 Days, This Year, Custom) were added in prior sessions and are working.

**User workspace roles**: `isDepartmentHead`, `isAdmin`, `isManagement`, `isDeveloper` booleans come from localStorage session. The dept-head action panel (`iss-dh-actions`) inside the issue detail modal only shows for dept heads and above. The new reopen button shows to ALL authenticated users on resolved/closed issues regardless of role.
