# Handoff

## Goal

Maintain and extend the **RGMC Gateway** — a Flask-based internal portal for RGMC Group that handles system access requests, issue reporting, a developer Kanban board, and an admin panel. The app uses Supabase as the database/storage backend and vanilla JS + HTML/CSS on the frontend (no framework).

No deployment pipeline exists — changes are served directly via Flask and committed to the `master` branch.

---

## Current State

**All features are working and complete. Working tree is clean — all changes committed.**

Recent commits this session:
- `8d327fa` — added attachments on helpdesk (priority descriptions for all levels, file upload with previews)
- `2659d11` — added menu items (P1 warning, IT Helpdesk link in profile submenu)
- `a85ef5f` — minor design modifications (view issue modal thumbnails, form spacing, profile submenu theme)

### Completed this session:

**View Issue Modal — Attachment Previews:**
- `static/admin.js` `openIssueModal()` (line ~1109): replaced plain `<a>` link list with thumbnail previews. Images show as 100×100px clickable thumbnails opening the lightbox; PDFs show a red PDF icon button opening the lightbox iframe; other files keep a download link.
- `static/style.css`: added `.attach-thumb-modal` modifier (100×100px for images, auto-width 64px-tall card for PDFs with truncated filename).

**Profile Submenu — Light/Dark Mode:**
- `static/style.css`: added `[data-theme="light"] .profile-menu` override — warm `rgba(249,246,241,0.97)` background and lighter shadow. Previously the dark `rgba(10,8,5,0.97)` bled through in light mode.

**Form Spacing & Font Fixes (both report-issue and helpdesk):**
- `static/style.css`:
  - Added `.ri-card form { display: flex; flex-direction: column; gap: 18px; }` — the critical fix; form groups were stacking with zero spacing.
  - `.form-label font-size`: 10.5px → 12px
  - `.form-group gap`: 6px → 7px
  - `.form-row gap`: 14px → 16px
  - `.ri-card-head margin-bottom`: 22px → 28px
  - `.hd-section-label margin`: `28px 0 14px` → `4px 0 -4px` (reduced since form gap now provides section breathing room)
  - `.hd-divider margin`: `28px 0` → `4px 0` (same reason)

**IT Helpdesk Link in Profile Submenu:**
- `static/script.js` `navItems` array: added "IT Helpdesk" `<a href="/helpdesk">` for all logged-in users, between "My Profile" and the conditional Dev Board/Admin links.

**Helpdesk — P1 Warning → Priority Notes for All Levels:**
- `templates/helpdesk.html`: removed static `hdP1Warning` div with hardcoded content; replaced with empty `<div class="hd-priority-note" id="hdPriorityNote" style="display:none;">` — JS fills it dynamically.
- `static/helpdesk.js`: added `PRIORITY_NOTES` constant (P1–P4 each with icon SVG, title, body text); `hdComputePriority()` now sets `noteEl.className` and `noteEl.innerHTML` based on computed priority. All 4 levels show; P1 is red/warning, P2 orange, P3 amber, P4 green.
- `static/style.css`: renamed `.hd-p1-warning` → `.hd-priority-note` (base layout) + `.hd-priority-note--p1/.p2/.p3/.p4` color variants + light-mode overrides for all 4.

**Helpdesk — File Attachment Upload with Previews:**
- `templates/helpdesk.html`: added file drop zone (`.file-drop-zone#hdDropZone` + `input#hdAttachments`) and preview container (`div.hd-file-previews#hdFilePreviews`) before the submit button.
- `static/helpdesk.js`:
  - Added `_esc(s)` helper for safe innerHTML rendering.
  - Added `_hdFiles[]` and `_hdObjectUrls[]` managed arrays (file input is cleared after each pick so individual removal works).
  - `hdUpdateFiles(input)` — adds incoming files up to 5-file limit, clears input, renders previews.
  - `hdRemoveFile(idx)` — revokes object URL, splices arrays, re-renders.
  - `_hdClearFiles()` — revokes all object URLs, empties arrays, re-renders (called on successful submit).
  - `_renderHdPreviews()` — builds image thumbnails (via `URL.createObjectURL`) or doc icon cards (PDF red, Word blue, other grey) with `×` remove button; updates drop zone label with slot count.
  - `hdSubmit()` — appends `_hdFiles` entries to FormData before POST; calls `_hdClearFiles()` on success.
  - DOMContentLoaded: wires up drag-and-drop on `hdDropZone` (adds files directly to `_hdFiles` array, not via the input).
- `static/style.css`: added `.hd-file-previews`, `.hd-file-preview`, `.hd-file-preview--img`, `.hd-file-preview--doc`, `.hd-file-thumb`, `.hd-file-icon`, `.hd-file-name`, `.hd-file-remove` (with hover → red).
- `controllers/issues.py` `_submit_helpdesk_issue()`: added attachment reading (`request.files.getlist("attachments")`, capped at 5), upload via existing `_upload_issue_attachment()`, and PATCH to save URLs — same pipeline as `_submit_issue()`.

---

## Files Actively Being Edited

None — working tree is clean.

**Modified this session (all committed):**
- `static/admin.js` — view issue modal attachment thumbnails
- `static/script.js` — IT Helpdesk link in profile submenu navItems
- `static/helpdesk.js` — priority notes, file management, submit update, drag & drop
- `static/style.css` — profile submenu theme, form spacing, priority note variants, file preview CSS, attach-thumb-modal
- `templates/helpdesk.html` — hdPriorityNote div (empty), attachment section
- `controllers/issues.py` — attachment handling in `_submit_helpdesk_issue()`
- `handoff.md` — this file

---

## Failed Attempts

None this session. All edits applied cleanly on the first attempt.

---

## Next Step

No specific task was queued at end of session. Resume by asking the user what to work on next.

If doing a commit: **Git must use PowerShell, not Bash** (see Gotchas).

---

## Context & Gotchas

- **Git must use PowerShell, not Bash.** The Git Bash binary (`bash.exe`) crashes with `msys-2.0.dll` fatal error on this machine. All git commands must go through the PowerShell tool.

- **Edit tool requires prior Read.** Read target files in the current session before editing — the tool will error if you haven't read the file first.

- **Supabase via REST, no ORM.** Service key bypasses RLS — no additional policy setup needed for new lookup tables. Use `supabase_req(method, path, data=, params=, extra_headers=)`.

- **`helpdesk.js` has no `script.js` dependency.** The helpdesk page only loads `theme.js` + `helpdesk.js`. Any shared utilities (like `escHtml`) must be defined locally — that's why `_esc()` was added at the top of `helpdesk.js`.

- **File preview uses managed `_hdFiles` array, not the input's FileList.** The file input is cleared with `input.value = ''` after each pick so the same file can be re-added and individual removal works. Files are manually appended to FormData in `hdSubmit()`. Do NOT read from `document.getElementById('hdAttachments').files` — it will be empty.

- **Object URLs must be revoked.** `_hdObjectUrls` stores the blob URLs. They are revoked in `hdRemoveFile()` and `_hdClearFiles()`. Do not revoke them on image `onload` — the image still needs them for display.

- **Priority note element (`hdPriorityNote`) starts empty.** The inner HTML is built entirely by JS in `hdComputePriority()` using `PRIORITY_NOTES[p].icon/title/body`. The element's class is also set dynamically (`hd-priority-note hd-priority-note--p1` etc.).

- **`.hd-section-label` and `.hd-divider` now have small margins** (`4px`) because the parent form has `gap: 18px`. Previously they had `28px` margins which was their own spacing mechanism — those were the source of truth before the form gap was added. Do not restore them.

- **`.attach-thumb-modal`** sizes the issue modal attachment previews at 100×100px (images) and auto-width / 64px-tall (PDFs). The base `.attach-thumb` stays at 46×46px for the table row thumbnails.

- **ticket_number DEFAULT** is a PostgreSQL sequence-backed expression (`RGMC-XXXXX`). Existing rows were back-filled to `RGMC-00000` (no UNIQUE constraint on this column — duplicates allowed).

- **Theme localStorage contract.** Key is `rgmc-theme`. Absence = light. Only `"dark"` is ever written.

- **config-sub-panel visibility** is toggled via `style.display` in JS, not CSS classes. The HTML has `style="display:none;"` on all sub-panels except companies.

- **Helpdesk subcategory cascade:**
  - `Software/Application` → `GET /systems?is_visible=eq.true` → `{value: id, label: name}`
  - `Hardware` / `Network` → `GET /non_software_items?category=eq.X` → `{value: subcategory, label: subcategory}`

- **Priority matrix:** P1=high+high, P2=high+medium (or reverse), P3=medium+medium, P4=everything else.

- **AnyDesk ID:** 9 digits exactly. Validated client-side (regex) and server-side in `_submit_helpdesk_issue`. Stored as TEXT.

- **URL param shortcut for system issues:** `/helpdesk?system=<system_id>` pre-fills category=Software/Application, ticket_type=incident_problem, request_type=Bug Fix, and selects the system in the subcategory dropdown.
