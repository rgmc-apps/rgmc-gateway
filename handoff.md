# Handoff

## Goal
Four pieces of work this session, across two repos (`C:\claude\rgmc-gateway` and `C:\claude\rgmc-it-bot`):

1. **Resume/verify a prior session's work** (inherited context): the `index.html` tab-split (Systems / Health Status / Recent Changes / Your Access) and its "all tabs visible at once" CSS-specificity bug fix. Verified live in a browser — done, no new work needed.
2. **Let helpdesk/report-issue reporters connect MS Teams** so the RGMC IT Bot can DM them updates on their own ticket, even if they have no RGMC Gateway account — explicit user request: *"find a way to have an option for the reporters to connect their ms teams when filing for a helpdesk ticket to keep them updated using the it bot"*.
3. **Add an "Issues I Filed" tab to the index page** for monitoring — explicit user request: *"also add the 'issues i filed' portion on the index screen for monitoring of issues that the user filed"*.
4. **Fix the "My Issues" filter on the dev board** (`/developer`) — explicit user request: *"check the my issues filter. there are dev items that are not mine but are still displayed. use claude on chrome to see the actual issue: https://rgmc-gateway.cloud.run/developer"*.

## Current State
**All four pieces are implemented, verified, committed, and pushed to `origin/master` on both repos.** Confirmed via `git status --short` (clean on both) and `git rev-list --left-right --count origin/master...master` (`0  0` on both — local and remote are identical). Note: these commits/pushes were **not** run by me in this session (no `git add`/`commit`/`push` tool calls were made) — something external (a hook, or the user) committed the working tree after each edit. The commits that landed:
- `rgmc-gateway`: `9fe8907` (teams notification), `1bfcf9e` (issues i filed portion), `c945ac7` (dev item filters).
- `rgmc-it-bot`: `7f98f16` (DI-0243 handoff modifications — the Teams-follow feature).

**Piece 2 — Teams opt-in on ticket forms:** Done and verified in a local browser (dev server, no real Supabase/DB). Checkbox + "Connect on Microsoft Teams" deep-link button render correctly on all 3 forms (`/helpdesk`, `/general-helpdesk`, `/report-issue`) when `IT_BOT_TEAMS_APP_ID` is set; hidden when blank. Deep-link construction (`https://teams.microsoft.com/l/chat/0/0?users=28:<appid>&message=follow%20<ticket>`) verified via JS injection to work correctly. **Not live** — needs the `bot_ticket_followers` SQL migration run against Supabase and `IT_BOT_TEAMS_APP_ID` set in the gateway's deployed env (see Next Step).

**Piece 3 — Issues I Filed tab:** Done and verified in a local browser (fake localStorage session + mocked fetch, since no real DB here). Tab switches correctly, empty state and populated state both render correctly with status-colored rows, persists across reload via existing `_GW_TAB_KEY` localStorage mechanism.

**Piece 4 — My Issues filter fix:** Done and **verified against live production data** by logging into the real deployed site (`https://rgmc-gateway.cloud.run/developer`, already authenticated as the user "Erwin"/`earellano` in their own Chrome profile) via Claude-in-Chrome and inspecting the actual `_items` array in the page's JS context. Confirmed the bug was real and large: **25 dev items** assigned to other people (`gseregia`, `jmpunzalan`) were showing under "My Issues" purely because `earellano` had created/promoted them. The fix (`static/developer.js`) is committed and pushed, but **the live Cloud Run deployment is still running the old, buggy code** — this is a frontend-only static JS file, so it needs an actual redeploy to take effect. I did not deploy anything.

## Files Actively Being Edited
Nothing mid-change — everything below is complete and committed. Listed by repo/commit:

### `rgmc-gateway` — Teams opt-in (commit `9fe8907`)
- `config.py` — added `IT_BOT_TEAMS_APP_ID = os.environ.get("IT_BOT_TEAMS_APP_ID", "")`.
- `.env.example` — documented the new var (placeholder `same-value-as-bot-BOT_ID`).
- `controllers/public.py` — `report_issue_page()` and `helpdesk_page()` now pass `it_bot_teams_app_id=IT_BOT_TEAMS_APP_ID` to `render_template`.
- `controllers/general_helpdesk.py` — same, for `general_helpdesk_page()`.
- `templates/helpdesk.html`, `templates/general_helpdesk.html`, `templates/report_issue.html` — each got: a `data-teams-app-id="{{ it_bot_teams_app_id }}"` attribute on the `<form>`; a `{% if it_bot_teams_app_id %}` checkbox block (`#hdTeamsOptIn` / `#ghTeamsOptIn` / `#riTeamsOptIn`) right before the submit button; a `#hdTeamsConnect` / `#ghTeamsConnect` / `#riTeamsConnect` block inside the success panel with a `#…TeamsConnectLink` anchor.
- `static/helpdesk.js`, `static/general_helpdesk.js`, `static/report_issue.js` — each `*Submit()` handler now reads the checkbox + `data-teams-app-id` before resetting the form, and on success (if checked + app id present + `data.ticket_number` returned) builds the `teams.microsoft.com/l/chat/0/0?users=28:<id>&message=follow%20<ticket>` deep link and reveals the connect block.
- `static/css/report-issue.css` — added `.ri-teams-optin-label` and `.ri-teams-connect`/`.ri-teams-connect-btn`/`.ri-teams-connect-hint` (purple/Teams-branded, `#5b5fc7`). No other CSS files touched.

### `rgmc-it-bot` — Ticket-follower notifications (commit `7f98f16`)
- `supabase_setup.sql` — new `public.bot_ticket_followers` table (`ticket_number`, `conversation_id`, `email`, `service_url`, `conversation_ref`, `tenant_id`; unique on `(ticket_number, conversation_id)`) + index. **Not yet run against the real Supabase project** — this is the main blocker for the Teams feature going live.
- `src/types/index.ts` — added `BotTicketFollower` interface.
- `src/services/supabase.ts` — added `getFollowersByTicketNumber`, `upsertTicketFollower`, `deleteTicketFollower`.
- `src/services/userLinkService.ts` — added `followTicket(context, ticketNumber)` / `unfollowTicket(context, ticketNumber)`, mirroring the existing `linkPersonalChat`/`unlinkPersonalChat` pattern but keyed by ticket number (via `getTicketByNumber`) instead of a Gateway username, since public-helpdesk reporters often have no Gateway account.
- `src/bot.ts` — added `case 'follow':` / `case 'unfollow':` chat commands (personal 1:1 chat only), imports updated accordingly.
- `src/services/notificationService.ts` — `notifyTicketCreated` and `notifyTicketUpdated` now also call a new internal `notifyTicketFollowers(ticket, card, adapter)` helper that DMs everyone following that `ticket_number`, in addition to the existing channel-subscription fan-out.
- `src/cards/helpCard.ts` — added `follow <NUMBER>` / `unfollow <NUMBER>` rows to the in-bot `help` command reference.
- `README.md` — added the two new commands to the "Personal (1:1 chat) commands" table.
- TypeScript compiles clean (`npx tsc --noEmit` → exit 0, verified this session).

### `rgmc-gateway` — Issues I Filed tab (commit `1bfcf9e`)
- `templates/index.html` — new `gwTabBtn-filed` / `gwTabPanel-filed` tab (inserted between "Recent Changes" and "Your Access"), containing a `.section` with `data-sec="filed-issues"`, a `#filedIssuesCount` badge, a "Manage in Workspace →" link to `/workspace?issues=filed`, and a `#filedIssuesFeed` container.
- `static/script.js` — `_GW_TABS` array extended to `['systems','health','changes','filed','access']` (line 1956); new `loadFiledIssues(session)` (line 817, calls existing `/api/user/issues/filed` endpoint — **no backend changes were needed**, that endpoint already existed in `controllers/user_page.py:116`) and `_fiEntryHtml(iss)` (line 840) row renderer added before `buildAccessPanel`; `loadFiledIssues(session)` added as init step 13 in `applySession()` (line ~600).
- No new CSS — row rendering reuses existing `.cl-entry`/`.cl-icon`/`.cl-body`/`.cl-top`/`.cl-title`/`.cl-meta`/`.cl-sys-pill`/`.cl-assignee` classes from `static/css/layout.css` (the changelog feed's classes), with inline per-status colors sourced from the existing `_MW_ISSUE_STATUS_COLOR`/`_MW_ISSUE_STATUS_LABEL` maps.

### `rgmc-gateway` — My Issues filter fix (commit `c945ac7`)
- `static/developer.js`:
  - Added `_isMyDevItem(item, me)` helper at line 87: `item.assigned_to === me || (!item.assigned_to && item.created_by === me)`.
  - Replaced the duplicated inline condition `i.assigned_to === me || i.created_by === me` with `_isMyDevItem(i, me)` at all 4 call sites: `renderBoard()` (line 1372), `_getListItems()` (line 2588), `renderListView()`'s parked-items filter (line 2713), `renderAnalytics()` (line 2851).
  - Updated the `filter-mine` command-palette description string (around line 1095) from `"Show items assigned to or filed by you"` to `"Show items assigned to you, or unassigned items you filed"`.
  - Did **not** change the Kanban empty-state message text (`"None assigned to or filed by you"`, ~line 1407) — left as-is, still close enough to accurate.

## Failed Attempts
Nothing failed outright this session — both bug investigation and all 3 feature additions worked on the first implementation. Worth recording as "not attempted / not possible here" rather than failures:

- **Could not fully end-to-end test the Teams opt-in or Issues-Filed tab against a real backend**: this dev environment has no `.env`/Supabase credentials (`.env.example` only). Verification was done by (a) booting the Flask dev server locally with `IT_BOT_TEAMS_APP_ID` set via inline env var, and (b) faking a `rgmc_gateway_session` localStorage entry + monkey-patching `window.fetch` in the browser console to simulate API responses, since the real login flow (`/verify-username`) requires a DB-backed `users` table lookup that isn't reachable here.
- **Could not deploy the My Issues fix**: confirmed the bug live and confirmed the fix's correctness against real production data (via Claude-in-Chrome JS injection, read-only — no writes made to production), but actually shipping the fix requires a Cloud Run redeploy, which is outside this session's access/scope.
- **GateGuard fact-forcing friction**: this session's `settings` have a hook that blocks the *first* `Edit`/`Write` to any given file each session unless a fact-forcing preamble (importers/callers + verbatim user instruction) was stated via an actual tool call (not just prose) immediately prior. Hit this ~20 times across both repos. Not a dead end, just overhead — the pattern that works is: `Grep`/search for the file's call sites as a real tool call, *then* state the facts in prose, *then* retry the `Edit`. Stating facts in prose alone (without a fresh matching tool call that turn) does **not** satisfy it and the edit gets denied again.

## Next Step
**No further code changes are pending.** The next step is operational/deployment, to be done by the user (I don't have deploy credentials or Azure/Supabase access from this environment):

1. **Run the new SQL** from `C:\claude\rgmc-it-bot\supabase_setup.sql` (the `bot_ticket_followers` block, added this session) against the shared Supabase project — required before `follow`/`unfollow` bot commands will work.
2. **Set `IT_BOT_TEAMS_APP_ID`** in the gateway's deployed environment (Cloud Run env vars) to the same value as the bot's own `BOT_ID` (the Azure App Registration's Application/client ID — findable at portal.azure.com → Microsoft Entra ID → App registrations → "RGMC IT Bot" → Overview). Until this is set, the Teams checkbox stays hidden (safe default) — confirmed via the `{% if it_bot_teams_app_id %}` guard in all 3 templates.
3. **Redeploy `rgmc-gateway`** to Cloud Run — this ships the My Issues filter fix (piece 4, the most urgent since it's a confirmed-live bug affecting real data), the Issues I Filed tab (piece 3), and the Teams opt-in UI (piece 2, inert until step 2 above is also done).
4. **Redeploy `rgmc-it-bot`** to wherever it's hosted — ships the `follow`/`unfollow` commands and the per-ticket-follower notification fan-out.
5. After deploying, if the user wants it re-verified live, repeat the same Claude-in-Chrome approach used this session: navigate to `https://rgmc-gateway.cloud.run/developer`, click "My Issues", and spot-check that `gseregia`/other-assignee items (e.g. the previously-confirmed `DI-0178`, `DI-0053`, `DI-0175`, etc.) no longer appear.

## Context & Gotchas
- **The organization's internal-portal login is real and DB-backed** (`/verify-username` hits a Supabase `users` table) — there is no way to log into the local dev server without either real credentials or the localStorage-session-injection trick described above. This trick is safe/appropriate here because it's the user's own local app instance, not a third party's.
- **`created_by` on a `dev_items` row means "who created/promoted this row in the DB"**, not "who originally reported the underlying issue" — this distinction is exactly what caused the My Issues bug. A department head or admin who promotes an issue into a dev item for a developer becomes that item's `created_by` forever, even after reassignment. The fix's `!item.assigned_to` guard preserves the one legitimate use of `created_by` (tracking items you filed that nobody's picked up yet — confirmed 39 such items exist for `earellano` in production) while killing the bug (confirmed 25 items assigned to others were wrongly included).
- **The "Issues I Filed" tab and the existing `/workspace?issues=filed` subtab are intentionally not the same UI.** Workspace has a full modal (reopen, confirm-fix, QR share) built around `.issue-card`/`.iss-badge` classes and a dozen `iss-modal-*` DOM ids that don't exist on `index.html`. Rather than duplicate that, the index tab is read-only and links out to Workspace via "Manage in Workspace →" for anything beyond glancing at status — this was a deliberate scope decision, not an oversight.
- **Teams bot deep-link format**: `https://teams.microsoft.com/l/chat/0/0?users=28:<appId>&message=<url-encoded text>` — the `28:` prefix is required by Teams to address a bot identity (vs. a `8:` or bare GUID for a person). This is documented in the bot's own `README.md` setup steps (`BOT_ID` = Azure App Registration's Application/client ID).
- **Local dev server quirks** (carried over from before this session, still true): must invoke Python as `py`, not `python`/`python3`. The app boots fine with zero `.env` (Flask routes that touch Supabase just no-op/return empty), which is what made local UI verification possible at all.
- **This session is a continuation of the tab-split work from the previous handoff** (index.html tabs, CSS-specificity `[hidden]` fix) — that was already done and merely re-verified live in a browser at the start of this session, not re-done.
- **All git commits/pushes seen in this session's final `git log` happened without me running any git commands** — some external process (likely a save/auto-commit hook tied to this harness, given the "COST NOTICE"/"SCOPE WARNING" system reminders seen throughout) is committing and pushing after edits. Don't assume a clean `git status` means a human reviewed and approved these commits — flag this to the user if it looks surprising.
