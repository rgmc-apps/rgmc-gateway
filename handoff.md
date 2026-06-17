# Handoff

## Goal

Maintain and improve the RGMC Gateway — an internal Flask portal for RGMC Group staff. The portal provides SSO-style access to 8 internal systems, a kanban-based developer board, an admin panel (access requests, user management, system management, dev performance tab), and a problem report form with email notifications.

The overarching goal across the last two sessions was:
1. ✅ Add a **Developer Performance tab** to the Admin Panel (backend + frontend + CSS)
2. ✅ Generate a comprehensive **README.md**
3. ✅ Apply a **design refresh** to the developer board and admin panel pages

All three goals are complete. The only remaining action is committing the uncommitted design changes.

---

## Current State

**Branch:** `master` — up to date with `origin/master`

**Uncommitted changes (3 files, design refresh only):**

| File | Change |
|---|---|
| `static/style.css` | +211 lines — "Design Refresh" block appended at end of file, before the `dp-*` dev-perf block |
| `templates/admin.html` | +1 line — subtitle paragraph inside `.admin-page-header` |
| `templates/developer.html` | +4 lines — `h1` wrapped in `<div>`, subtitle paragraph added |

Everything else is committed (commit `912998d` — "full code restructure, added admin developer feature"). The app is in a **fully functional state**. No broken code, no partial edits, no syntax errors.

---

## Files Actively Being Edited

- `static/style.css` — Design Refresh block appended (~line 3108). Covers:
  - `.admin-page-title` / `.admin-page-sub` / `.admin-page-header` — page title + subtitle styles
  - `.dev-stats-bar` / `.dev-stat-pill` — stats bar restyled as vertical metric cards with status left-border accents and large (30px) count numbers; `.dev-stat-dot` hidden
  - `.kanban-card` — 3px left border using `--dev-clr`, refined hover glow
  - `.kcard-avatar` / `.kcard-avatar-initial` — 24px with dev-color ring
  - `#col-pending/ongoing/coding/testing/done .kanban-col-header` — status-colored column header text
  - `#col-*` `box-shadow` — subtle inward status glow per column
  - `.admin-tabs` / `.admin-tab` — underline indicator style (gold bottom border on active, no pill/box)
  - `.admin-table-wrap` — 2px gold top accent, sticky thead, alternating rows, gold hover tint
  - `.dev-page-header > div:first-child` — flex column layout fix for new subtitle wrapper

- `templates/admin.html` — Line 31: subtitle `<p class="admin-page-sub">Manage access requests, users, systems, and developer activity.</p>` added inside `.admin-page-header`

- `templates/developer.html` — Lines 31–35: `h1` and new subtitle `<p>` wrapped in `<div>` inside `.dev-page-header`

---

## Failed Attempts

- **`_he()` for HTML escaping in admin.js dev-perf block** — Failed because admin.js defines `escHtml()`, not `_he()`. Fixed with `replace_all: true` Edit replacing all `_he(` → `escHtml(`.

- **Double `dp-modal-scroll` wrapper in `_buildDevPerfModalHtml`** — The function returned HTML already wrapped in `<div class="dp-modal-scroll">`, but the container `#devPerfModalContent` already had that class. Caused double-scrollbar/layout break. Fixed by removing the wrapper `<div>` from the function's return template literal.

- **`overflow-y: hidden` on `.admin-table-wrap`** — Accidentally added during design refresh; would have clipped table rows. Removed immediately.

- **Image generation via `/imagegen-frontend-web`** — No image generation tool is available in the Claude Code CLI environment. User chose to implement design improvements directly in CSS/HTML instead.

- **Edit anchor ambiguity in admin.js** — Both `saveIssuePatch` and `promoteIssueToDevItem` ended with identical error-handling boilerplate. Solved by using the unique `/promote` fetch URL line as the Edit anchor.

---

## Next Step

**Commit the uncommitted design changes.** Everything is ready:

```powershell
git add static/style.css templates/admin.html templates/developer.html
git commit -m "design refresh: admin tabs underline, stat cards, kanban accents, page subtitles"
```

After committing, the working tree will be clean and the session goal is 100% complete.

Then optionally **push to remote**:
```powershell
git push origin master
```

---

## Context & Gotchas

- **Auth model:** No passwords stored. `X-Gateway-Username` header is set server-side after session validation. Client stores `rgmc_gateway_session` in localStorage.
- **Supabase via REST:** All DB calls go through `supabase_req()` helper (PostgREST). No ORM, no direct psycopg2. Signature: `supabase_req(method, path, *, data=None, params=None)` — `data=` is request body, `params=` is URL query string. Never embed filters in path string.
- **`--dev-clr` CSS variable:** Set inline on each kanban card via DJB2 hash of the developer's username → 8-color RGBA palette. This is what drives per-developer card border and avatar ring colors.
- **`dev_items.status` CHECK constraint:** Only allows `pending`, `ongoing`, `coding`, `testing`, `done`. Any other value will fail at the DB level.
- **`escHtml()` not `_he()`:** The HTML escaping helper in `static/admin.js` is `escHtml()`. Do not use `_he()` — it doesn't exist.
- **`@media print` for dev perf PDF:** `window.print()` is used to generate PDFs from the dev performance modal. The print CSS hides everything except `#devPerfPrintArea`.
- **CSS variable names:** `--gold: #C4972A`, `--bg: #080604`, `--text-primary: #EDE5D0`, `--text-secondary` (muted), `--border-subtle`, `--border`, `--radius`, `--radius-sm`, `--radius-pill`, `--ease`.
- **Status color palette:** pending=#6b7280, ongoing=#a855f7, coding=#3b82f6, testing=#f59e0b, done=#22c55e. Lighter versions for text on dark bg: #9ca3af, #c084fc, #60a5fa, #fbbf24, #4ade80.
- **Project structure:** Flask Blueprints — `controllers/public.py`, `auth.py`, `issues.py`, `admin.py`, `developer.py`, `profile.py`. Services: `email.py`, `supabase.py`, `guards.py`, `sites.py`. Models: `models/access.py`.
- **Deployment:** Docker / Cloud Run, Python 3.12-slim, gunicorn 1 worker / 8 threads / 120s timeout.
- **LF→CRLF warnings on Windows:** Git is configured to warn about line ending conversion on checkout. Harmless — do not add `.gitattributes` unless instructed.
- **Supabase project ref:** `eesrzpgmsrbhjeenfojq`. Tables: `users`, `systems`, `access_requests`, `dev_items`, `dev_activity_logs`.
