# Handoff

## Goal
Build and iterate the RGMC Gateway internal portal — a Flask + Supabase web app for RGMC Group staff. The developer board (`/developer`) is the current focus: a kanban board with physics drag-and-drop, animated stats bar, All/My Issues filter, and a unified item detail modal (edit fields + activity log in one two-pane view). Dark-gold design system, production-quality, no slop.

## Current State
**All code changes for this session are written but NOT yet live-tested in a browser.** JS is syntactically valid (braces balanced, no stale references). The dev server has not been run since the modal refactor — visual/behavioral verification is the next step.

### What should be working:
- Physics drag-and-drop on kanban cards (spring physics, pointer events, ghost placeholder)
- Animated stat pills in header bar (rollNumber ease-out-cubic + SVG arc progress rings per column)
- All/My Issues segmented filter toggle
- Auto-set `actual_end_date` to today when status → done, null otherwise
- **Unified item detail modal** (`#itemDetailModal`):
  - Two-pane layout (edit form left, activity log right) when editing existing item
  - Single-pane (log hidden) when creating new item
  - Sticky footer with Delete + Save buttons
  - Delete button visible only when editing (calls `deleteItemFromDetail()`)
- Supabase Storage avatar upload/delete flow
- Profile display name PATCH (bug fixed: `data=` kwarg, `params=` for filter)
- Avatar URL validation: accepts `data:` (canvas preview) and `https://` (storage URL)

### What has NOT been tested post-edit:
- Opening existing item → two-pane modal, log loads via `refreshLogs()`
- Creating new item → single-column modal, no log pane
- Posting a log entry → appears in list, list scrolls to bottom
- Delete from within modal → confirm dialog, board re-renders
- Responsive collapse at ≤640px → single stacked column

## Files Actively Being Edited

- `templates/developer.html` — Replaced old `itemModal` + `logModal` with single `itemDetailModal` (two-pane CSS grid). Stats bar added. New Item button calls `openDetailModal(null)`. Old modals fully removed.
- `static/developer.js` — Major refactor:
  - Removed `_loggingId` state
  - Removed `openItemModal`, `closeItemModal`, `overlayCloseItem`, `openLogModal`, `closeLogModal`, `overlayCloseLog`
  - Added `openDetailModal(idOrNull)`, `closeDetailModal()`, `overlayCloseDetail(e)`, `deleteItemFromDetail()`
  - `refreshLogs()` and `addLog()` now reference `_editingId` (was `_loggingId`)
  - `renderCard()`: removed separate log button; single edit button calls `openDetailModal`
  - `saveItem()`: calls `closeDetailModal()`
  - ESC handler: `closeDetailModal()` + `closeAddSystemModal()` + `closeProfileMenu()`
  - Also from prior session: `rollNumber()`, `initColArcs()`, `updateColArcs()`, full physics drag system
- `static/style.css` — Added around line 1016 (XL modal block):
  - `.modal-xl` — flex-column, `overflow: hidden`, 960px max-width
  - `.item-detail-body` — CSS grid 1fr 1fr, 520px fixed height, `max-height: calc(90vh - 100px)`
  - `.detail-new` — collapses to 1fr, forces log pane hidden
  - `.item-detail-form` — scrollable left pane with padding, sticky footer via `position: sticky; bottom: 0; background: var(--bg-modal)`
  - `.item-detail-log` — flex-column right pane, `overflow: hidden`
  - `.detail-log-header`, `.item-detail-footer`, `.item-detail-footer-right`, `.detail-save-group`, `.btn-detail-delete`
  - Activity log styles (`.activity-log-list`, `.activity-log-empty`, `.activity-log-entry`, `.log-meta`, `.activity-log-add`, `.log-post-row`) at line ~1927
  - Responsive at 640px: xl modal reverts to block/scrollable, body stacks to 1 column
- `app.py` — Fixed `api_profile_patch` (`body=patch` → `data=patch`, path filter → `params=`); added `POST/DELETE /api/profile/avatar` using direct Supabase Storage REST API
- `static/profile.js` — `saveProfile()` calls avatar endpoints separately; stores storage URL with `?v=timestamp` cache-buster in localStorage
- `static/admin.js` — Avatar URL check accepts `https://` not just `data:image/`
- `static/script.js` — Same avatar URL check update

## Failed Attempts
- **Side-stripe `border-left` on kanban cards**: Used `border-left: 3px solid` for status accents. `/impeccable` skill bans `border-left > 1px` as colored accent. Replaced with `background: rgba(...)` tints.
- **`api_profile_patch` with `body=patch`**: `supabase_req()` uses `data=` not `body=`. Also tried embedding filter in path (`/users?username=eq.{username}`) — wrong, must use `params={"username": f"eq.{username}"}`.
- **`--radius-md` CSS variable**: Used in kanban CSS but never defined. Replaced with `var(--radius)`.
- **Duplicate `.activity-log-list` CSS rule**: When adding XL modal styles, accidentally placed activity-log rules in both the new XL block and the developer section. Fixed by removing from XL block, keeping only in developer section (~line 1927).
- **Conflicting `padding` on `.activity-log-add`**: Had `padding: 0 20px 18px` and `padding-top: 14px` simultaneously. Merged to `padding: 14px 20px 18px`.

## Next Step
**Start the dev server and visually test the item detail modal:**

```
python app.py
```

Navigate to `http://localhost:5000/developer` and test in order:
1. Click a kanban card's edit button → two-pane modal opens, fields pre-filled left, logs load right
2. Click "New Item" → single-column modal, no log pane
3. Post a log → appears in log list, textarea cleared
4. Click Delete in modal → confirm dialog fires, closes modal, board re-renders
5. Save edits → modal closes, board reflects changes
6. Resize below 640px → modal collapses to single stacked column

If two-pane height looks wrong, check `.item-detail-body` (line ~1025 in style.css): `height: 520px; max-height: calc(90vh - 100px)` and `.modal-xl` flex setup (line ~1017).

## Context & Gotchas
- **`supabase_req(method, path, *, data=None, params=None)`** — `data=` is request body, `params=` is URL query string. Never embed filters in the path string.
- **Supabase Storage avatar path**: `avatars/{username}.{ext}` in the `avatars` bucket. Public URL: `/storage/v1/object/public/avatars/{filename}`. DELETE tries all extensions (jpg/jpeg/png/webp) since extension isn't stored separately in DB.
- **Session shape**: `rgmc_gateway_session` in `localStorage` → `{ username, firstName, fullName, displayName, avatarUrl, isAdmin, isDeveloper, systems }`.
- **`_rm` ordering**: `rollNumber()` uses `_rm = window.matchMedia('(prefers-reduced-motion: reduce)')` which is defined at line ~399 (after `renderCard`). Safe because `rollNumber` is only called at runtime, not at parse time.
- **Physics drag card detachment**: Cards are cloned to `document.body` with `position: fixed` during drag. Ghost `div.drag-ghost` (dashed border, same dimensions) holds the column slot. On release, CSS transition springs the floating card back to ghost position, then board re-renders.
- **`detail-new` CSS class**: Applied to `#itemDetailBody` for new items (collapses grid to 1 column, hides log pane). Removed when editing existing items. Controlled purely via JS `openDetailModal()`.
- **`deleteItemFromDetail()`**: Captures `_editingId` into local `id` variable BEFORE calling `closeDetailModal()` (which nulls `_editingId`), then calls `deleteItem(id)`. The confirm dialog runs inside `deleteItem`.
- **No `/impeccable` design bans**: No `border-left > 1px` colored accents, no gradient text, no hero-metric template.
- **Supabase project ref**: `eesrzpgmsrbhjeenfojq`. All migrations are done (ran in a prior session). Tables: `users`, `systems`, `access_requests`, `dev_items`, `dev_activity_logs`.
- **Git state**: All modified files are unstaged. Files changed: `app.py`, `static/admin.js`, `static/developer.js`, `static/logo.png`, `static/profile.js`, `static/script.js`, `static/style.css`, `templates/developer.html`.
