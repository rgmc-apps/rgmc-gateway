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

**Working directory is clean.** All changes are committed and pushed to `origin/master`. The project is in a stable state after a sequence of UI improvements and new features.

**Recent commits (newest first):**
- `84c1b42` — added user search for user lists (admin user list now has live search dropdown)
- `06cbca1` — added common fixes screen (CRUD for `common_fixes` table + linking issues to fixes)
- `201042e` — added improvements for UI
- `24e3ddf` — updated report issue form on systems screen
- `b881d7a` — added rich editor on description fields

All features from recent sessions are complete and functional. No in-progress or broken work.

---

## Files Actively Being Edited

No files are currently mid-edit. All work is committed. Key files to know:

- `app.py` — Flask app factory; registers all 10 blueprints
- `controllers/admin.py` — Largest controller (~1382 lines); admin API routes including common fixes CRUD, config tables (companies, departments, brands, categories, request types, non-software items, actions), analytics (dev performance, common issues), system ping + Windows file upload
- `controllers/public.py` — Public-facing routes; health check, user search (`/api/users/search`), helpdesk category/subcategory lookups, issue confirm-fix flow
- `controllers/issues.py` — Issue CRUD + resolution workflows (promote to dev item, promote to task, resolve)
- `controllers/resolution.py` — Resolution actions endpoint
- `controllers/developer.py` — Developer-side dev_items management
- `controllers/tasks.py` — Task management
- `controllers/user_page.py` — User profile/workspace page
- `controllers/general_helpdesk.py` — General (non-IT) helpdesk submissions
- `controllers/profile.py` — User profile updates
- `controllers/auth.py` — Login/logout/auth guards
- `services/supabase.py` — Central Supabase PostgREST request helper (`supabase_req`)
- `services/guards.py` — `_require_admin()` and other auth guard helpers
- `services/email.py` — Email sending via smtplib
- `services/sites.py` — Cached systems list (`get_sites()` with `_invalidate_sites_cache()`)
- `models/access.py` — `_approve_record()` / `_reject_record()` for access request workflow
- `config.py` — Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `HEALTH_CHECKS`, `GATEWAY_BASE_URL`
- `static/admin.js` — Main admin panel JS (monolithic, includes users, systems, common fixes, config tables, analytics)
- `static/script.js` — Main portal homepage JS
- `static/style.css` — CSS manifest that `@import`s partials from `static/css/*.css`
- `static/css/common-fixes.css` — Common fixes screen styles
- `static/css/issue-tracker.css` — Issue tracker styles
- `static/css/user-search.css` — User search dropdown styles
- `static/user-search.js` — User search component (used in admin user list)
- `static/report_issue.js` — Report issue form JS
- `static/helpdesk.js` — IT helpdesk form JS
- `static/general_helpdesk.js` — General helpdesk form JS
- `static/dept-other.js` — Department "other" free-text handling
- `templates/admin.html` — Admin panel template
- `templates/index.html` — Main portal homepage
- `templates/helpdesk.html` — IT helpdesk template
- `templates/general_helpdesk.html` — General helpdesk template
- `templates/report_issue.html` — Report issue template
- `templates/user.html` — User profile/workspace page
- `templates/developer.html` — Developer dashboard
- `templates/tasks.html` — Task management page
- `templates/profile.html` — Profile edit page
- `templates/issue_view.html` — Public issue status view
- `templates/access_result.html` — Access request result page

---

## Failed Attempts

No failed attempts recorded in this session — this is a fresh handoff from a clean state.

---

## Next Step

No active task is in progress. Ask the user what to work on next. Likely continuation areas based on recent work:

1. **Common fixes screen** — recently added; may need UX polish or filtering by system
2. **User search in admin user list** — recently added; verify it works end-to-end
3. **Rich editor fields** — recently added to description fields; verify consistency across all description inputs in forms
4. **Previous pending ideas** from prior session: issue analytics drill-down, bulk actions on issues table, issue comments/activity feed, email notification to assignee on promote/assign

To run the dev server:
```
python app.py
```
Then navigate to `/admin` or `/` in the browser. Requires `.env` or environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GATEWAY_BASE_URL`, and SMTP config for email.

---

## Context & Gotchas

**Architecture:**
- Flask + Supabase (PostgREST) + Vanilla JS — no build step, no bundler
- CSS manifest: `static/style.css` imports all partials via `@import url('css/...')`. Add new CSS files to this manifest, or edit the relevant partial directly.
- `static/admin.js` is a monolithic ~1900+ line file. State globals are at the top.
- `_issuesCache` = all fetched issues; `_editingIssueId` = currently open admin issue modal ID; `_developersCache` = cached developer list for assignee dropdowns.

**Auth pattern:**
- All admin routes call `_require_admin()` from `services/guards.py`, which returns `(user, None)` on success or `(None, (error_dict, status_code))` on failure. Always destructure and check `err` before proceeding.

**Supabase calls:**
- All DB access goes through `supabase_req(method, path, params, data, extra_headers)` in `services/supabase.py`.
- Uses PostgREST URL query params: e.g., `"status": "eq.pending"`, `"order": "created_at.desc"`, `"or": "(field.ilike.*q*,other.ilike.*q*)"`.

**Systems cache:**
- `get_sites()` is cached in memory. After any system CRUD, call `_invalidate_sites_cache()` to force refresh. Forgetting this leaves stale system lists on the portal homepage.

**Storage buckets:**
- Windows launcher/manifest files → `system-files` bucket
- Issue attachments and common-fix attachments → `issue-attachments` bucket (common fixes use `cf/<fix_id>/` prefix)

**Email:**
- Emails are sent synchronously on approve/reject. If SMTP is misconfigured, the endpoint still returns success but logs the error.

**`is_windows_based` systems:**
- Have `windows_launcher_url` and `windows_manifest_url` fields; shown in a separate section on the homepage; exempt from `primary_url`/`primary_label` requirement on creation.

**`is_task` systems:**
- Task launcher entries shown in a separate section on the portal; also exempt from `primary_url` requirement.

**Resolution types** (used in common-issues analytics):
- `quick` = no linked item; `dev_item` = `dev_item_id` set; `task` = `task_id` or `user_task_id` set; `duplicate` = `is_duplicate` flag set.

**User roles:**
- `is_admin`, `is_developer`, `is_management`, `is_department_head` are boolean columns on the `users` table.
- Dev-performance endpoint filters `is_developer.eq.true OR is_admin.eq.true` and excludes `is_management`.

**Share URLs (from prior session):**
- Teams: `https://teams.microsoft.com/share?href=<encoded>&msgText=<encoded>`
- Messenger: `fb-messenger://share?link=<encoded>` (deep link, requires FB Messenger desktop app)

**PDF export (from prior session):**
- `issExportPDF()` in `static/admin.js` opens a new window, writes HTML, auto-calls `window.print()` after 600ms delay.
- Uses `_issFilteredRows` which is updated by both `issApplyFilters()` and `issApplyFilters_noReset()`.

**Supabase MCP:**
- DB migrations can be applied via `mcp__supabase__apply_migration`. Prior session added `dev_items.assigned_to` and `tasks.assigned_to` columns.
- MCP tools are available for future schema changes.
