# Handoff

## Goal
Build and maintain the RGMC Gateway — an internal systems portal (Flask) for RGMC Group employees. The portal requires authenticated access: users must request access, get approved via email, then sign in with a generated username. Approved users only see the systems they're authorized for. Existing users can request additional system access. A problem-report form and API health dashboard are also part of the portal.

## Current State
All features are fully implemented. No known broken state.

**Working:**
- Authentication gate: username sign-in → only shows approved systems, hides empty sections
- New access request flow: gate form → approver email with approve/reject links → user notified with username
- Additional access request flow: header button → modal shows only unapproved systems → approver email → merges into existing record on approval
- Problem report form with screenshot attachments, emailed to `DEVELOPER_EMAIL`
- API health check dashboard (auto-refreshes every 60s after login)
- 18 total sites: 5 RGMC, 3 SBIC, 10 NAV Site (NAV Site entries added this session)
- Supabase `public.access_requests` table (RLS enabled, service role key bypasses it)

**Known gap (fixed 2026-06-04):**
- NAV Site `<section>` block added to `templates/index.html` between the SBIC section and Health Check section. `.label-nav` badge style (teal) added to `static/style.css`. Approved NAV Site users now see their cards after login.

## Files Actively Being Edited

- `app.py` — Added 10 NAV Site entries to `SITES[]` (lines 103–192). Full access control backend with Supabase REST integration, username generation, email flows, and routes.
- `static/script.js` — Added `openAdditionalAccess`, `closeAdditionalAccess`, `overlayCloseAdditional`, `resetAdditionalFormState`, `submitAdditionalAccess`. Fixed TypeError: was calling `.toLowerCase()` directly on site objects; fixed to use `(s.name || s).toLowerCase()`. Header button in `applySession()` calls `openAdditionalAccess()`. Esc handler closes all three modals.
- `templates/index.html` — Gate overlay, access request modal, additional access modal (id=`additionalModal`), `ALL_SITES` JS constant injected via `{{ sites | tojson }}`. Only RGMC and SBIC `<section>` blocks present in `<main>` — NAV Site section missing.
- `supabase_setup.sql` — Table is in `public` schema. Must be run once in Supabase SQL Editor.
- `templates/access_result.html` — Approve/reject confirmation page shown after approver clicks link.
- `.env.example` — Documents all required env vars.

## Failed Attempts

- **Supabase Management API to auto-create tables**: Used `sb_secret_*` service key with `api.supabase.com` → "JWT could not be decoded". Management API requires a Personal Access Token (PAT), not the service role key. Tables must be created manually in Supabase SQL Editor.
- **PostgreSQL pooler with service key as password**: Tried Supavisor pooler with `sb_secret_*` as password → "tenant/user not found". New `sb_secret_*` key format is NOT a valid PostgreSQL password.
- **`rgmc_main` schema**: Original table was in schema `rgmc_main`. Sending `Accept-Profile: rgmc_main` caused 406 Not Acceptable — schema not in Supabase's "Exposed schemas" list. Fix: moved table to `public` schema, removed all schema-profile headers from `_sb_headers()`.
- **`s.toLowerCase()` on ALL_SITES**: `openAdditionalAccess` filtered with `s.toLowerCase()` — TypeError because `ALL_SITES` is objects, not strings. Fixed to `(s.name || s).toLowerCase()`.

## Next Step

No known gaps. All features are complete and working. Monitor for new feature requests or bug reports.

## Context & Gotchas

- **Supabase service key format**: Key starts with `sb_secret_` — newer format, NOT a JWT, NOT usable as a PostgreSQL password. Only works as a Bearer token in PostgREST REST calls.
- **Supabase table must be in `public` schema**: PostgREST always exposes `public`. Other schemas must be manually added in Supabase Dashboard → API settings. Keep the table in `public`.
- **`_sb_headers()` has NO schema-profile headers**: `Accept-Profile` / `Content-Profile` were removed as the fix for the 406 error. Do not add them back.
- **Username generation**: `{first_initial}{lastname}` lowercase, alphanumeric only, collision-safe with numeric suffix. `generate_username()` queries approved records to check for collisions.
- **Additional access merge signal**: When existing user requests additional access, the new `access_requests` row is created with `username` pre-populated (their existing username). In `access_approve()`, `bool(record.get("username"))` being truthy triggers the merge path — patches the primary approved record's `systems` array — instead of generating a new username.
- **Session storage key**: `rgmc_gateway_session` in `sessionStorage`. Stores `{username, firstName, systems[]}`. Clears on sign-out or tab close.
- **`filterSystems()` compares lowercase**: `.site-card-name` text is compared against `session.systems` (both lowercased). System names in the DB must exactly match the `name` field in `SITES[]`.
- **Health refresh deferred until login**: `refreshHealth()` and the 60s `setInterval` only start inside `applySession()`, not on page load.
- **`ALL_SITES` is an array of objects**: Injected via `{{ sites | tojson }}`. Each element has `id`, `name`, `category`, `primary_url`, etc. Always access `.name`, never call string methods on the object directly.
- **Required `.env` vars**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SENDER_EMAIL`, `DEVELOPER_EMAIL`, `APPROVER_EMAIL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GATEWAY_BASE_URL` (full base URL for approve/reject email links, e.g. `https://yourdomain.com`).
- **No NAV Site section in HTML**: This is the most important pending item. The 10 NAV Site entries in `SITES[]` will show in the access request modal's checkbox list, but approved users will see nothing after login because there's no `<section>` filtering for `site.category == 'NAV Site'` in the main template.
