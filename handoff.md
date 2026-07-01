# Handoff

## Goal

RGMC Gateway internal portal — ongoing feature development on the issues tracker module. The system is a Flask + Supabase (PostgREST) + Vanilla JS app with no build step. CSS is modular: `static/style.css` is a manifest that `@import`s partials from `static/css/*.css`.

The sprint of features being built around the issues tracker includes: public ticket confirmation flow, share integrations (Teams + Messenger), promote-to-dev/task with assignee, smart status transitions, KPI tooltips, and PDF report export.

---

## Current State

**Everything is working and committed.** Working directory is clean (`git status` is empty). Last two commits:

- `b69da01` — "added print pdf on the issues list" (July 1 2026, 18:40)
- `3700115` — "added few share options" (July 1 2026, 17:58)

All features from this session are complete and functional:

| Feature | Status |
|---|---|
| Confirmed fix flow (public ticket page) | Complete |
| Confirmed fix display in admin modal | Complete |
| Confirmed fix display in workspace modal | Complete |
| Teams + Messenger in public share modal | Complete |
| Teams + Messenger in admin issue share modal | Complete |
| Teams + Messenger in workspace issue share modal | Complete |
| Promote modal with assignee dropdown | Complete |
| Auto status to in_progress when assignee set | Complete |
| DB columns: dev_items.assigned_to, tasks.assigned_to | Complete (Supabase migration) |
| Pending count badge fix (showed empty gold dot) | Complete |
| KPI tooltips with hover descriptions | Complete |
| KPI card overflow fix (tooltip was clipped) | Complete |
| PDF export button in filter bar | Complete |
| _issFilteredRows tracking in filter functions | Complete |
| issExportPDF() function with full report | Complete |

---

## Files Actively Being Edited

All files were modified across the two previous commits. No files are mid-edit.

- `templates/admin.html` — Added: KPI tooltip markup (all 6 cards), promote modal HTML, confirmed fix group in issue modal, Teams/Messenger in issue share modal, export PDF button in filter bar, pending count badge style="display:none;" fix
- `static/admin.js` — Added: `_issFilteredRows` global, `_issFilteredRows = rows` in both `issApplyFilters()` and `issApplyFilters_noReset()`, `issExportPDF()` function, `openPromoteModal()`/`submitPromote()`, `onIssueAssigneeChange()`, confirmed fix display in `openIssueModal()`, Teams/Messenger hrefs in `openIssueShareModal()`, `_promoteType` state variable
- `static/css/issue-tracker.css` — Added: tooltip CSS (.iss-kpi-info-wrap, .iss-kpi-info, .iss-kpi-tooltip), .iss-export-pdf-btn, .iss-confirmed-badge, .iss-unconfirmed-note, share icon colors for teams/messenger; changed .iss-kpi-card overflow to visible (was hidden); changed .iss-share-apps grid to repeat(3,1fr) (was 4)
- `static/css/workspace.css` — Added .iss-confirm-fix-row { grid-column: 1 / -1 } for full-width in 2-col grid
- `templates/issue_view.html` — Added renderConfirmFix(issue), submitConfirmFix(), ?confirmed=1 banner check in init(), Teams/Messenger in public share modal, .pub-share-apps grid repeat(3,1fr)
- `templates/user.html` — Added #iss-confirm-fix-row div in workspace modal, wsIssShareTeams and wsIssShareMessenger in workspace share modal
- `static/user.js` — Added confirmed fix display logic in openIssueDetail(), Teams/Messenger hrefs in openWsIssShareModal()
- `controllers/issues.py` — Both promote endpoints (/promote and /promote-task) updated to accept assigned_to from request body; conditionally patch issue.status = "in_progress" and issue.assigned_to when assignee is set

---

## Failed Attempts

No failed attempts during this session. All changes applied cleanly on first try.

---

## Next Step

No pending implementation tasks. The session ended cleanly with all features complete and committed.

To continue adding features, likely next candidates based on the app's direction:
1. Issue analytics drill-down — click a bar in the analytics chart to filter the table to that company/category
2. Bulk actions on the issues table — checkboxes for multi-select, bulk status update or bulk export
3. Issue comments/activity feed — a threaded note system within the admin issue modal
4. Email notifications — notify assignee by email when promoted/assigned

To run the dev server: `python app.py` then navigate to `/admin`.

---

## Context & Gotchas

**Architecture:**
- Flask + Supabase (PostgREST via Python supabase client) + Vanilla JS — no build step, no bundler
- CSS manifest: static/style.css imports all partials via @import url('css/...'). Add new CSS files to this manifest or edit the relevant partial directly.
- static/admin.js is the main admin script — monolithic, ~1900+ lines. State globals at the top (~lines 44-82).
- `_issuesCache` = all fetched issues; `_editingIssueId` = currently open admin issue modal ID; `_developersCache` = cached developer list for assignee dropdowns.
- `_currentIssue` in user.js = currently open workspace modal issue object.

**Share URLs:**
- Teams: `https://teams.microsoft.com/share?href=<encoded>&msgText=<encoded>`
- Messenger: `fb-messenger://share?link=<encoded>` (deep link, only works if FB Messenger desktop app is installed)

**Supabase MCP:**
- DB migrations applied via mcp__supabase__apply_migration. Columns dev_items.assigned_to and tasks.assigned_to were added in this session.
- Project is connected — MCP tools are available for future schema changes.

**PDF export behavior:**
- issExportPDF() opens a new window, writes HTML, then auto-calls window.print() after 600ms delay
- Uses _issFilteredRows which is set by both issApplyFilters() and issApplyFilters_noReset() — if the user changes filters, the export always reflects the current view
- Falls back to _issuesCache if _issFilteredRows is empty (e.g. page just loaded, filter not yet triggered)
- The "Print / Save PDF" button inside the report has .no-print class so it disappears during actual printing

**Promote modal assignee behavior:**
- When an assignee is selected in the main issue edit modal (#issueAssignedTo) via onIssueAssigneeChange(), status auto-advances to in_progress only if current status is open or new — it does not downgrade resolved/closed issues.
- The promote modal (#promoteModal) adds the assignee to the newly created dev_item or task; the backend also patches issue.status = in_progress and issue.assigned_to when an assignee is provided.

**Confirmed fix flow:**
- Public endpoint: GET /api/public/issues/:id/confirm-fix (no auth required)
- After confirming, a ?confirmed=1 query param is added to the URL and #confirmedBanner is shown at the top of the ticket page
- Admin/workspace modals show confirmed fix status read-only (not actionable from those views)

**KPI card overflow fix:**
- .iss-kpi-card had overflow: hidden which clipped the absolutely-positioned tooltip children. Changed to overflow: visible. The ::before accent bar (2px top strip) stays within bounds so no visual regression from this change.

**Pending count badge fix:**
- .admin-sb-badge has min-width: 18px; height: 18px with gold background — an empty badge renders as a visible gold circle. Fixed by adding style="display:none;" to the #pendingCount HTML initial state, matching how the issues count badges initialize. JS shows it when count > 0.
