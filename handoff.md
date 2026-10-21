# Handoff

## Goal
Two independent, self-contained feature additions to `rgmc-gateway` (Flask + Supabase portal for RGMC Group), requested back-to-back in the same session:

1. **Wire up the existing `systems.is_wip` column on the Epics screen of the Developer Board**, specifically:
   - When a new system is created via the "New System" modal **from inside the epic form**, that system must be created with `is_wip = true`.
   - When **every epic linked to a system** reaches `epic_status = "done"`, that system's `is_wip` must automatically flip back to `false`.
   - (The "also automatically set epic status to done" part of the request turned out to already exist in the codebase — see Context & Gotchas.)

2. **Add full-screen zoom-on-click for attached photos app-wide.** Not scoped to one page — the request was general ("add a capability for attached photos to be zoomed in when clicked to be displayed on full screen"), and investigation showed the right fix was a single shared lightbox wired into the renderer used by every page that displays comments/descriptions/attachments, rather than a per-page fix.

No broader epic — both items are closed, independent features. No DB migrations needed for either (no new columns; `is_wip` already existed on `systems`).

## Current State
**Both features are fully implemented. Working tree is dirty (uncommitted) as of this handoff** — `git status --short` shows 9 modified files (see list below). This differs from the prior handoff pattern in this repo where everything had already been auto-committed by the time of handoff; this time nothing has been committed yet. **Do not assume these changes are saved anywhere but the working tree.**

All code changes are syntax-verified:
- `py -c "import ast; ast.parse(...)"` on `controllers/developer.py` — passed
- `node --check` on `static/developer.js`, `static/admin.js`, `static/issues_page.js`, `static/comment-render.js`, `static/comment-editor.js` — all passed
- Jinja `Environment(loader=FileSystemLoader('templates')).get_template('developer.html')` — passed

Neither feature has been exercised in an actual browser yet — no live click-testing was done this session for either the `is_wip` cascade or the new lightbox.

## Files Actively Being Edited
None mid-change — all edits below are complete, just uncommitted.

**Feature 1 — system `is_wip` wiring:**
- `controllers/developer.py`:
  - New helper `_sync_system_wip_from_epics(system_ids)` (added right after `_display_name_for`, ~line 41): for each system id, queries `/epics?system_ids=cs.{sid}` (PostgREST array-contains filter, same pattern as `controllers/issues.py:28`), and if every linked epic has `epic_status == "done"`, PATCHes that system's `is_wip` to `false` (guarded by `is_wip=eq.true` so it's a no-op if already false).
  - Call site 1 (~line 433, inside `dev_update_item`'s existing "Epic auto-resolve" block): after the existing auto-PATCH that sets `epic_status: "done"` when all dev items under an epic are done, added `_sync_system_wip_from_epics(updated_epic[0].get("system_ids"))`.
  - Call site 2 (~line 862-864, in `dev_update_epic`, the manual `PATCH /api/dev/epics/<id>` endpoint): after a successful patch, if `patch.get("epic_status") == "done"`, calls `_sync_system_wip_from_epics(rows[0].get("system_ids"))`. No old-status check before this — the cascade is idempotent so calling it on every "set to done" (even if already done) is harmless.
- `static/developer.js`:
  - New var `_addSystemFromEpic = false` (~line 78, next to `_allUsersCache`).
  - `openAddSystemModal()` (~line 2349): now detects `document.getElementById('epicDetailModal')?.classList.contains('open')`, stores it in `_addSystemFromEpic`, and if true: force-checks + disables the `newSysIsWip` checkbox, shows a new hint (`newSysWipAutoHint`), and calls `toggleNewSysWip(true)` so the Primary URL/Label fields aren't required.
  - `closeAddSystemModal()` (~line 2372): resets `newSysIsWip.disabled = false` and `_addSystemFromEpic = false` on close (cleanup so the next standalone open isn't stuck disabled).
  - `saveNewSystem()` (~line 2391): `isWip` is now `_addSystemFromEpic || document.getElementById('newSysIsWip').checked` — hardens against the checkbox state ever desyncing from context.
  - `_renderCommentAttachments()` (~line 4462, unrelated to is_wip — this is feature 2, see below).
- `templates/developer.html`:
  - New hint paragraph `#newSysWipAutoHint` added right after the existing `#newSysWipHint` in the Add System modal (~line 890): "Automatically marked Work in Progress because it's being added from an epic. It will clear once every epic linked to this system is marked Done." Hidden by default, shown via JS when opened from epic context.
  - No other markup changes.
- Both `openAddSystemModal()` call sites (dev item form at `templates/developer.html:738` and epic form at `:1234`) are unchanged — both call the function with no arguments; the context detection happens inside the function by checking whether `epicDetailModal` is open, so only the epic-form call path triggers the new behavior.

**Feature 2 — full-screen image lightbox:**
- `static/comment-render.js` — the shared renderer loaded on **13 templates** (`admin.html`, `developer.html`, `dev_item_view.html`, `epic_view.html`, `fix_view.html`, `general_helpdesk.html`, `helpdesk.html`, `issues_page.html`, `issue_email_action.html`, `issue_view.html`, `report_issue.html`, `tasks.html`, `user.html`). Added (after `renderCommentPreview`, ~line 107):
  - `_ceEnsureLightbox()` — lazily creates a single `<div class="ce-img-lightbox">` overlay + injects its own `<style>` block into `<head>` (self-contained — doesn't depend on any page's existing stylesheet, since 5 of the 13 templates don't load `style.css`/`comment-editor.css` at all).
  - `openImageLightbox(src, alt)` / `closeImageLightbox()` — public functions, now the single entry point for "show this image full screen" across the whole app.
  - A `document`-level delegated `click` listener for `.ce-inline-img` (the class `comment-render.js` already assigns to every inline image it renders from comment/description text) that calls `openImageLightbox`.
  - A `document`-level `keydown` listener closing the lightbox on Escape.
  - This finally makes the pre-existing `cursor: zoom-in` CSS on `.ce-inline-img` (in `static/css/comment-editor.css:109`, previously decorative only) actually functional.
- `static/comment-editor.js` (~line 109, inside the `CommentEditor` constructor): **removed** the old `previewPanel.addEventListener('click', ...)` handler that did `window.open(img.getAttribute('src'), '_blank', 'noopener')` on `.ce-inline-img` clicks in the "Preview" tab while composing a comment. Removed (not just replaced) because the new global delegated listener in `comment-render.js` already covers this exact case — keeping both would have double-fired on every click.
- `static/developer.js`, `static/admin.js`, `static/issues_page.js` — each has its own legacy `_renderCommentAttachments` / `_ipRenderCommentAttachments` function (pre-inline-image era, still used for old comment attachment arrays on epics/dev items/issues). All three previously rendered `<a href="..." target="_blank">` wrapping the thumbnail `<img>`. Changed all three identically to `<button type="button" onclick="openImageLightbox('${escHtml(u)}')">` so these legacy attachment thumbnails also open full screen instead of a new tab.
  - Verified safe to inline the URL unescaped-for-JS inside a single-quoted `onclick` string: all attachment URLs are generated server-side via `controllers/resolution.py:63` (`safe_name = re.sub(r"[^a-zA-Z0-9.\-_]", "_", f.filename)`), which strips single quotes and all other special characters from uploaded filenames before building the storage URL, so no URL in this app can ever contain a `'` that would break the inline handler.
- `static/css/helpdesk.css` (`.comment-attach-thumb`, ~line 584): added `padding: 0; background: none; cursor: zoom-in;` since the element changed from `<a>` to `<button>` and needed the browser's default button chrome reset.

## Failed Attempts
Nothing dead-ended this session. Both features landed on the first implementation pass. One thing considered and deliberately avoided:
- Considered keeping `comment-editor.js`'s `previewPanel` click handler and just changing its body to call `openImageLightbox` instead of `window.open`, instead of deleting it. Rejected because the new global delegated listener on `document` (added in `comment-render.js`, which always loads before `comment-editor.js` per script order in every template) already fires for the same click, since `previewPanel`'s own listener never called `stopPropagation()`. Keeping both would have been redundant (and `openImageLightbox` would run twice per click, which is harmless but sloppy) — deleting the old one is strictly correct, not a speculative cleanup.

## Next Step
Nothing is pending implementation-wise. If resuming cold:
1. Run `git status --short` in `C:\claude\rgmc-gateway` to confirm these 9 files are still showing as modified (they were, as of this handoff — unlike previous sessions in this repo, **nothing from this session has been auto-committed yet**).
2. If the user wants visual verification before trusting the work, the things to click through on `/developer` are:
   - **is_wip feature**: open an epic → click "New System" → confirm the WIP checkbox is pre-checked and disabled, with the new hint visible, and Primary URL/Label aren't required → save → confirm the system shows the "WIP" tag. Then mark all dev items under an epic linked to that system as done (or manually set the epic's status to Done via the epic status menu) → confirm the system's WIP tag disappears once *every* epic linked to it is Done.
   - **Lightbox feature**: find any comment or description containing a pasted/attached image (or an old-style attachment thumbnail) on any of the 13 pages listed above, click it, confirm it opens full screen with a dark backdrop, closes on Escape/backdrop-click/the × button, and does NOT also open a new browser tab.
3. No DB migrations needed for either feature.
4. If the user asks for a new feature or bugfix, there's no outstanding context blocking that — start fresh.

## Context & Gotchas
- **This environment has previously auto-committed work outside explicit `git commit` calls in the visible conversation** (per the prior handoff for this repo and the sibling `rgmc-it-bot` repo) — but as of *this* handoff, that has not yet happened for this session's changes. Trust `git status`/`git log` over this document for "is this saved" questions, since that behavior's timing is outside this session's visibility.
- **The "auto-set epic status to Done" part of the is_wip request already existed before this session** — in `controllers/developer.py`'s `dev_update_item`, the "Epic auto-resolve" block (now ~lines 406-437) already flips `epic_status` to `"done"` when every dev item under an epic is done. This session only added the *system*-level cascade (`_sync_system_wip_from_epics`) on top of that existing epic-level cascade — it did not touch or duplicate the epic auto-done logic itself.
- **`system_ids` on `epics` is a Postgres array column, not a join table.** Filtering "epics that reference this system" uses PostgREST's array-contains operator: `params={"system_ids": f"cs.{{{sid}}}"}` → `?system_ids=cs.{sid}`. This exact pattern already existed in `controllers/issues.py:28` for `linked_issue_ids`; `_sync_system_wip_from_epics` reuses it.
- **`supabase_req()` (`services/supabase.py:75`) always sends `Prefer: return=representation`** unless overridden — so every PATCH result already contains the full updated row (including `system_ids`) with no extra `select` needed. Both call sites rely on this to get `system_ids` off the PATCH response directly.
- **Three different "New System" trigger points share one global modal** (`#addSystemModal` / `openAddSystemModal()` in `static/developer.js`) — the dev item form and the epic form. There is no parameter passed between them; context is inferred at call time by checking whether `#epicDetailModal` currently has the `.open` class. This is fragile only in the sense that if a third place ever calls `openAddSystemModal()` while some other modal is open, it won't get the epic-specific WIP behavior unless it also happens to have `epicDetailModal` open — which is correct, since the requirement was specifically "from the epics screen."
- **`comment-render.js` is the single highest-leverage file in this codebase for anything touching rendered comment/description content** — it's loaded on 13 of the app's templates and is the one place `.ce-inline-img` elements get created (`_ceCleanNode`'s `IMG` branch, ~line 50-62). Any future "do X to every image/comment in the app" request should start by checking this file first, the same way the lightbox was added here.
- **5 of those 13 templates never load `style.css`** (and therefore never load `comment-editor.css`, which is pulled in via `style.css`'s `@import url("css/comment-editor.css")`): `dev_item_view.html`, `epic_view.html`, `fix_view.html`, `issue_email_action.html`, `issue_view.html`. This is why the new lightbox injects its own `<style>` tag at runtime instead of relying on an existing stylesheet or CSS variables (`var(--border)` etc. would be undefined/invalid on those 5 pages) — it uses hardcoded colors (`rgba(0,0,0,0.88)` etc.) so it renders identically everywhere regardless of what else is loaded.
- **Attachment URL safety for the inline `onclick="openImageLightbox('...')"` pattern** depends entirely on `controllers/resolution.py`'s filename sanitization (strips everything except `[a-zA-Z0-9.\-_]`). If any *other* upload path ever generates attachment URLs without equivalent sanitization, embedding that URL unescaped inside a single-quoted JS string in an `onclick` attribute would be unsafe — re-verify this assumption before reusing the pattern against a new URL source.
- Python in this environment is invoked as `py`, not `python`/`python3`.
- The Bash tool's working directory resets to `C:\claude\rgmc-gateway` between tool calls.
