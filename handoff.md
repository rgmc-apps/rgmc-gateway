# Handoff

## Goal

Maintain and improve the RGMC Gateway — an internal Flask + Supabase (PostgREST) IT operations portal for RGMC Group staff. Sessions resolve a rolling queue of bug fixes, features, and UI/UX improvements across the admin panel, developer board, helpdesk, and public landing surfaces. No single end-state; each session closes out whatever the user raises.

This session's specific asks, in order:
1. Add profile images to comments and anywhere a username is displayed.
2. Investigate + fix "Resolve Issue" button not working on the **deployed** site (admin panel).
3. Add an option to email new users on creation, including system access + account details.
4. Consolidate Common Issues by clustering on shared keywords per system/issue type.
5. Add a `github_username` column for developers; let them link their GitHub account (OAuth); display GitHub data on the Developer Performance ("developer details") page.
6. Notify a user by email when promoted to Developer, and prompt them (on their profile page) to link GitHub.
7. Pull GitHub contribution data (not just profile stats) into the developer details view.
8. Add a "Developers" list to the Developer Board itself (not just the admin panel).
9. Fix: an admin who is *not* tagged as a developer was still showing up in that developers list — same class of bug fixed once before on the admin side.
10. Auto-mark an epic `done` when all its dev items are `done`, but only if the epic was `active`.
11. Auto-mark an epic `active` when a dev item under it moves to an in-progress status, but only if the epic was `planning`.
12. Add GitHub metrics to the Developer Activity PDF report, as **plain text** (no widget images).
13. Auto-linkify URL-looking strings in every description/comment field across the app.

## Current State

**Everything is done, committed, and pushed.** `git status` is clean; local `master` is in sync with `origin/master` (`github.com/rgmc-apps/rgmc-gateway`). Nothing is mid-edit. Commit sequence for this session (oldest → newest):

```
7c4d341 added gateway modifications      (create-user email option)
36ca85b fix the resolve button           (root-cause fix, verified live)
7a9ed83 added developer shenanigans      (avatars-in-comments + Common Issues keyword
                                           clustering + full GitHub OAuth linking feature —
                                           these three got bundled into one commit)
c3dadcc added github details             (contribution widgets: streak stats + heatmap)
9257691 added developers page            (Dev Board "Team" view)
6782302 added developers fix             (excluded non-developer admins from /api/dev/members)
9a157af added epic modifications         (epic auto-done + auto-activate)
d933d1d added developer report           (GitHub metrics in the plain-text PDF report)
ed52a7a added hyperlink formatter        (static/linkify.js + applied everywhere)
```

**What is NOT verified / NOT done:**
- The GitHub OAuth App has **not** been confirmed as registered. I gave the user step-by-step instructions (github.com/settings/developers → New OAuth App → callback URL `https://rgmc-gateway-935246372408.asia-southeast1.run.app/api/profile/github/callback`) and asked them to send back the Client ID/Secret. **No values were ever provided in this session.**
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` env vars are **not set anywhere** (not locally, not confirmed on Cloud Run). Without them, `/api/profile/github/connect` returns HTTP 503 (`"GitHub linking is not configured on this server"`) — see `controllers/profile.py`.
- `supabase-migrations/github_account_migration.sql` (adds `users.github_username TEXT`) has **not been confirmed run** against the actual Supabase database. Every GitHub-related feature (profile column, admin Users column, Dev Performance data, Team view badge) silently degrades to "not linked" until this runs, but nothing will hard-error since the column is only ever read/written via PostgREST `select`/`patch`, which just needs the column to exist.
- It is **unknown whether Cloud Run has redeployed** since these commits were pushed. No CI/CD config exists in this repo (checked for `.github/`, `cloudbuild.yaml` — none found), so deployment is either a manual `gcloud run deploy` step or a GCP-side Cloud Build trigger not visible from the repo. Earlier in the session (`36ca85b`), the "Resolve Issue" bug was confirmed live-broken on `https://rgmc-gateway-935246372408.asia-southeast1.run.app` *before* the fix was committed — so deploys are not automatic-on-push as far as directly observed.
- None of the browser-facing UI (Team view, GitHub connect flow, linkify rendering, PDF report) has been clicked through in a real browser this session. Everything was verified via: mocked Flask test-client requests (`app.test_client()` with monkeypatched `supabase_req`), direct unit-style calls to isolated functions, and one Playwright headless-Chromium run to validate `linkify.js`'s DOM logic. The one exception is the "Resolve Issue" bug, which *was* reproduced and fixed live via Claude-in-Chrome against the deployed site.

## Files Actively Being Edited

None — working tree is clean, everything committed. For reference, the full set of files touched this session (all already committed):

- `controllers/admin.py` — create-user email trigger; Common Issues keyword clustering (`_ci_cluster_by_keywords`, `_ci_keyword_phrases`, `_ci_tokenize`); GitHub fields added to Users/Dev-Performance selects and `admin_update_user`'s allowed-fields set; `send_developer_promoted_email` trigger on `is_developer` promotion; new `GET /api/admin/github-profile/<login>` endpoint.
- `controllers/profile.py` — `github_username`/`is_developer` added to `GET/PATCH /api/profile`; new `GET /api/profile/github/connect`, `GET /api/profile/github/callback`, `DELETE /api/profile/github`.
- `controllers/issues.py` — `GET /api/issues/<id>/activity` now enriches each entry with `display_name`/`avatar_url` for avatar rendering.
- `controllers/developer.py` — `/api/dev/members` select extended (avatar/github/role/org fields) then filter fixed to `is_developer.eq.true` only (was `OR is_admin.eq.true`); epic auto-activate and auto-done blocks added inside `dev_update_item`.
- `services/github.py` (new) — GitHub OAuth service: HMAC-signed state (keyed on `SUPABASE_SERVICE_KEY`, 10-min expiry), authorize-URL builder, code→token exchange, authenticated-login fetch, cached (10-min TTL) public-profile fetch.
- `services/email.py` — `send_user_created_email`, `send_developer_promoted_email` added, following existing template conventions.
- `config.py` / `.env.example` — `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` added (blank by default).
- `supabase-migrations/github_account_migration.sql` (new) — `ALTER TABLE users ADD COLUMN IF NOT EXISTS github_username TEXT;` — **needs to be run manually against Supabase.**
- `static/admin.js` — avatar rendering in Users table + issue activity feed; Common Issues keyword pills; GitHub column/unlink in Users table; Dev Performance modal GitHub card + contribution widgets + PDF report GitHub section; various `escHtml(...)` → `linkifyText(...)`/`linkifyHtml(...)` swaps.
- `static/user.js` — same avatar/activity-feed enrichment as admin.js; fixed `.textContent` → `.innerHTML = linkifyHtml(...)` bug on the issue description; linkify applied to user-task cards.
- `static/developer.js` — Team view (`renderTeamView`, `viewTeamMemberItems`, extended `loadMembers`/`_members`); linkify applied to epic description/comments and activity-log messages.
- `static/tasks.js`, `static/script.js` — linkify applied to activity-log messages / landing-page recent-activity feed respectively.
- `static/profile.js` — GitHub connect/unlink widget, promotion-prompt banner, OAuth-callback query-param toast handling.
- `static/linkify.js` (new) — shared `linkifyHtml()` (DOM-based, TreeWalker) and `linkifyText()` (escape + linkify) utility, self-sufficient (defines its own `escHtml` fallback if none exists).
- CSS: `static/css/issue-activity.css`, `common-issues.css`, `developer.css`, `dev-board.css`, `profile.css`, `utilities.css` — supporting styles for all of the above (avatar bubbles, keyword pills, GitHub cards/badges, Team view grid, connect-widget, `.auto-link`).
- Templates: `admin.html`, `developer.html`, `user.html`, `tasks.html`, `helpdesk.html`, `general_helpdesk.html`, `profile.html`, `fix_view.html`, `issue_view.html`, `index.html` — added `<script src="/static/linkify.js">` (all) and applied `linkifyHtml`/`linkifyText` in the two standalone-script pages (`fix_view.html`, `issue_view.html`); `admin.html` also got the "GitHub" Users-table column header and Add-User systems/email-checkbox UI (from earlier in session, if not already present from a prior session — see below).

## Failed Attempts

No dead ends this session — everything landed on the first implementation, verified via mocked tests before considering it done. Two scope decisions worth recording so they aren't re-litigated:

- **Considered**: fetching real GitHub contribution counts via the GraphQL API for exact numbers. **Rejected because**: GraphQL requires an authenticated token (either a stored per-user OAuth token, which we deliberately avoid persisting, or a server-side Personal Access Token, which would be a new secret to manage). Went with embeddable third-party widget images instead (`github-readme-stats.vercel.app`, `github-readme-streak-stats.herokuapp.com`, `ghchart.rshah.org`) — zero backend work, zero secrets, at the cost of depending on free community-run services (flagged to the user as a reliability caveat; `github-readme-streak-stats` in particular runs on free-tier Heroku and could be flaky).
- **Considered**: simple GitHub linking via a typed username field + public API lookup (no OAuth). **Rejected**: user explicitly chose full OAuth via an `AskUserQuestion` prompt, accepting the extra setup cost (registering an OAuth App, providing Client ID/Secret) in exchange for actually verifying account ownership.

## Next Step

**This session's coding work is complete.** The next session should NOT start new feature work without first closing the loop on GitHub OAuth activation:

1. Ask the user whether they've registered the GitHub OAuth App yet (steps were given: github.com/settings/developers → New OAuth App → callback URL `https://rgmc-gateway-935246372408.asia-southeast1.run.app/api/profile/github/callback`).
2. If they have the Client ID/Secret, set them as `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` env vars on Cloud Run (and confirm `GATEWAY_BASE_URL` is already set there too — it's required for the OAuth redirect URI, see `controllers/profile.py::_github_redirect_uri()`).
3. Confirm `supabase-migrations/github_account_migration.sql` has been run in the Supabase SQL editor.
4. Confirm whether the pushed commits have actually been deployed to the live Cloud Run service (ask the user, or check Cloud Run revision history if tooling is available) — do NOT assume push-to-deploy is automatic.
5. Once confirmed live, do a real click-through smoke test of: Profile → Connect GitHub → OAuth round-trip → Dev Performance modal shows GitHub card + widgets → Users table shows the GitHub badge → Team view on the Dev Board shows GitHub badges.

If the user instead asks for new work, proceed normally — nothing here is blocking new tasks, it's just unverified.

## Context & Gotchas

### Architecture / conventions (still hold from prior sessions)
- **Flask + Supabase**: all DB access via `supabase_req()` in `services/supabase.py`, `Prefer: return=representation` for PATCH/POST when the row is needed back.
- **Auth guards**: `_require_developer()`/`_require_admin()` return `(username_string, None)` on success — a plain string, not a dict.
- **No sessions/cookies**: the whole app trusts a client-supplied `X-Gateway-Username` header per request (see `authHeaders()` in every JS file) and a `localStorage` session blob. This is why the GitHub OAuth `connect` endpoint takes the username as a **query param** (`?u=<username>`) rather than a header — a top-level browser redirect to GitHub can't carry custom headers, and this is consistent with the app's existing (low) trust bar. Ownership is still verified server-side via a signed, time-limited `state` param (HMAC using `SUPABASE_SERVICE_KEY` as the signing key — no new secret needed for this).
- **Rich-text fields**: `description`/`resolution_notes`/etc. fields edited via `initRichEditor()` (`static/rich-editor.js`) are stored as real HTML, not plain text — confirmed by reading `RichEditor.getValue()`. This is *why* `linkify.js` has two entry points: `linkifyHtml()` for these (DOM-walks existing markup, only touches text nodes) vs `linkifyText()` for genuinely plain-text fields (simple `<textarea>`, e.g. issue/epic comments) which escapes first. Mixing these up would either double-escape rich HTML (showing literal `<p>` tags) or fail to escape plain text (XSS risk) — verified with a Playwright test including an XSS payload before considering this done.
- **`epic_comments.epic_id` is TEXT** while `epics.epic_id` (and `dev_items.epic_id`/`issues.epic_id` referencing it) is INTEGER — must `str(epic_id)` before inserting a row into `epic_comments`. This bit a prior session and was re-applied correctly in the new epic auto-activate/auto-done code.
- **Modal pattern**: `.modal-overlay.open { display: flex }` in `modal.css`; never set inline `style="display:..."` on a modal element — that overrides the class and silently breaks it regardless of JS. (This was the exact root cause of the "Resolve Issue" bug fixed this session — the JS was already correct from a *previous* session's fix, but the HTML template still had a stray `style="display:none;"` baked into `#quickResolveOverlay` that nobody had removed.)

### GitHub feature specifics
- No access tokens are ever persisted. OAuth is used purely to prove the linker owns the GitHub account (`GET https://api.github.com/user` with the short-lived access token, read the `login`, discard the token). All *displayed* GitHub data comes from the public, unauthenticated `GET https://api.github.com/users/{login}` afterward — this is why revoking the OAuth grant on GitHub's side doesn't break anything already linked.
- `services/github.py::fetch_public_profile()` attaches the OAuth App's own `client_id`/`client_secret` as query params on the public profile fetch — this is a legitimate GitHub-documented trick to raise the unauthenticated rate limit from 60/hr to 5,000/hr, and only works once the env vars above are actually set.
- A classic GitHub OAuth App supports exactly **one** callback URL. Local OAuth testing (as opposed to testing everything else locally) would need either a second dev OAuth App or a tunnel (ngrok) — flagged to the user, not set up.

### Common Issues keyword clustering
- Pure-stdlib (`re`, `collections.Counter`/`defaultdict`), no new dependencies. Prefers multi-word phrases over single words when their issue-sets overlap (so "mode transport" suppresses a redundant bare "mode" cluster covering the same tickets). `min_count=2` — a phrase must appear across at least 2 distinct issues to surface. Verified with realistic ticket-text fixtures and via a full mocked-Flask-request run of `admin_common_issues()`.

### Linkify scope decisions (won't be obvious from the diff alone)
- Deliberately **not** applied to: rich-text editors while being edited (would fight contenteditable link-click behavior), and short truncated previews (60–140 char table/card excerpts) where a cut-off URL fragment isn't useful as a link.
- Deliberately **applied** to some previously-broken spots as a side effect of doing this properly: `user.js`'s issue detail modal was using `.textContent` for the description (so rich HTML literally showed as `<p>...</p>` text) — now `.innerHTML = linkifyHtml(...)`, matching how `admin.js` already treated the same field.

### Environment
- Platform: Windows 10, PowerShell/Git Bash. Working directory: `C:\claude\rgmc-gateway`. Git branch: `master`, in sync with `origin/master`.
- No `.env` auto-loading (no python-dotenv) — env vars must be set directly in the shell (local) or in Cloud Run's environment variable configuration (deployed). `.env.example` documents every expected var but is not itself loaded.
- Testing approach used throughout this session (no pytest suite exists in the repo): `python -c` one-liners with `app.test_client()` and monkeypatched `supabase_req`/`_require_admin`/`_require_developer`, plus one Playwright headless-Chromium script (written to a temp file in the repo root, then deleted) for DOM-dependent JS. This is the pattern to reach for again rather than trying to stand up a real Supabase-backed test environment.
