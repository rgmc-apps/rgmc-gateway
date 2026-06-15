# Handoff

## Goal
Run the pending SQL migrations against the Supabase project (`eesrzpgmsrbhjeenfojq`) using the Supabase MCP server, which is now configured in `.mcp.json`. All application code changes are complete and committed — the only remaining blocker is executing the migration SQL so the new tables and columns exist in the live database.

## Current State
- **All code is committed** — master branch is clean (`git status` shows only untracked `.agents/`, `.mcp.json`, `skills-lock.json`).
- **Supabase MCP is configured** in `.mcp.json` (HTTP transport, project ref `eesrzpgmsrbhjeenfojq`), but **authentication has not been completed**. The `/mcp` dialog was dismissed without finishing the OAuth flow, so MCP tools are not yet available in the session.
- **3 pending migrations** need to be run against the live Supabase DB (all are safe `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` statements):

### Migration 1 — Developer dashboard tables
```sql
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_developer BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_is_developer
    ON public.users (is_developer) WHERE is_developer = true;

CREATE TABLE IF NOT EXISTS public.dev_items (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title               TEXT        NOT NULL,
    description         TEXT,
    status              TEXT        NOT NULL DEFAULT 'pending',
    start_date          DATE,
    estimated_end_date  DATE,
    actual_end_date     DATE,
    created_by          TEXT        NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_dev_status CHECK (status IN ('pending', 'coding', 'testing', 'done'))
);

CREATE INDEX IF NOT EXISTS idx_dev_items_status   ON public.dev_items (status);
CREATE INDEX IF NOT EXISTS idx_dev_items_created  ON public.dev_items (created_at);

ALTER TABLE public.dev_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.dev_activity_logs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id     UUID        NOT NULL REFERENCES public.dev_items(id) ON DELETE CASCADE,
    username    TEXT        NOT NULL,
    message     TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_logs_item ON public.dev_activity_logs (item_id);

ALTER TABLE public.dev_activity_logs ENABLE ROW LEVEL SECURITY;
```

### Migration 2 — Systems visibility + coding item association
```sql
ALTER TABLE public.systems ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.dev_items ADD COLUMN IF NOT EXISTS system_id TEXT REFERENCES public.systems(id) ON DELETE SET NULL;
```

### Migration 3 — Rejection remarks (may already exist)
```sql
ALTER TABLE public.access_requests ADD COLUMN IF NOT EXISTS rejection_remarks TEXT;
```

All three are also captured verbatim at the bottom of `supabase_setup.sql`.

## Files Actively Being Edited
No files are mid-edit. All changes are committed. Key files changed this session:

- `supabase_setup.sql` — Added developer dashboard tables (`is_developer`, `dev_items`, `dev_activity_logs`) and systems extensions (`is_visible`, `system_id`). These are the pending migrations.
- `app.py` — Added `is_developer` to `verify_username` response; `_require_developer()` guard; `/developer` page route; all `/api/dev/items` CRUD routes; `/api/dev/items/<id>/logs` routes; `/api/dev/systems` GET+POST routes; `get_sites()` now filters `is_visible=eq.true`; allowed `is_developer` and `system_id` in relevant patch handlers.
- `templates/admin.html` — Added `is_visible` checkbox to system add/edit modal.
- `templates/developer.html` — New file: Kanban board page with item modal, activity log modal, and add-system modal.
- `static/admin.js` — Added `toggleDeveloper()`; Dev badge + Make Dev/Revoke Dev button in user rows; Visible/Hidden badge in systems table; wired `is_visible` into `openSystemModal()` and `saveSystem()`; updated systems table header.
- `static/developer.js` — New file: full Kanban JS (drag-and-drop, move arrows, CRUD, activity log, add-system modal, system dropdown).
- `static/script.js` — Added `isDeveloper` to session; "Dev Board" header link for devs/admins.
- `static/style.css` — Kanban styles, activity log, system tag on card, system select row, toggle checkbox, Visible/Hidden badges, Dev badge; fixed `select.form-input` dropdown colors (dark bg + gold chevron + explicit `option` colors).
- `.mcp.json` — Created by `claude mcp add` with Supabase HTTP MCP config (project scope).
- `.agents/` — Created by `npx skills add supabase/agent-skills`.

## Failed Attempts
- **What was tried**: Running SQL migrations via Supabase MCP in-session — **Why it failed**: MCP requires OAuth authentication via `claude /mcp` → Authenticate browser flow. The dialog was opened but dismissed before completing auth. MCP tools never became available.
- **What was tried**: `ToolSearch` for supabase/postgres/sql tools — **Why it failed**: MCP tools only appear after authentication; before that they don't show up in ToolSearch.

## Next Step
Complete Supabase MCP authentication, then run the migrations:

1. In the chat prompt type: `! claude /mcp` (runs in-session terminal)
2. Select **supabase** → **Authenticate** → complete the browser OAuth flow
3. Come back to Claude and say: **"run the SQL migrations using the Supabase MCP"**

Run migrations in order: Migration 1 → Migration 2 → Migration 3. All are idempotent.

## Context & Gotchas
- **Supabase project ref**: `eesrzpgmsrbhjeenfojq` (in `.mcp.json` and the MCP URL).
- **MCP is HTTP transport** (not stdio), project-scoped at `C:\claude\rgmc-gateway\.mcp.json`.
- **All SQL uses `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`** — every migration is safe to re-run.
- **`users.systems` stores system names, not IDs** — the access request form submits display names (e.g. `"RGMC Travel And Expense Web"`) as checkbox values. The admin edit-systems modal matches on `s.name` not `s.id`. This was a bug found and fixed this session.
- **`get_sites()` filters `is_visible=eq.true`** — systems with `is_visible = false` won't appear in the portal access request form. All existing rows default to `true`.
- **Developer access**: `_require_developer()` allows users where `is_developer = true` OR `is_admin = true`.
- **`dev_items.system_id`** is a nullable FK to `systems.id` (the slug). ON DELETE SET NULL — deleting a system won't cascade-delete dev items.
- **Admin skills installed**: `.agents/skills/supabase` and `.agents/skills/supabase-postgres-best-practices` are agent skill files for future use.
