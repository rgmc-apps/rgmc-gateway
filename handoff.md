# Handoff

## Goal

Maintain and extend the **RGMC Gateway** — a Flask-based internal portal for RGMC Group that handles system access requests, issue reporting, a developer Kanban board, and an admin panel. The app uses Supabase as the database/storage backend and vanilla JS + HTML/CSS on the frontend (no framework). The current sprint has been progressively improving the access request workflow, issue reporting, theming, and the username generation algorithm.

No deployment pipeline exists — changes are served directly via Flask and committed to the `master` branch.

---

## Current State

**All features are working and complete.** The working directory has uncommitted files from two sessions of changes. Nothing is broken or mid-edit.

### Completed this session — IT Online Helpdesk (large feature):

**Database migration `helpdesk_schema` applied:**
- Sequence `ticket_number_seq` created; `issues` table gets auto-assigned `RGMC-XXXXX` on each new insert; existing 4 rows were back-filled to `RGMC-00000`.
- New columns added to `issues`: `ticket_number`, `from_helpdesk`, `ticket_type`, `anydesk_id`, `request_category`, `request_subcategory`, `request_type_name`, `business_impact`, `urgency`, `priority`.
- `users` table: `anydesk_id TEXT` column added.
- New lookup tables with seed data:
  - `request_category` (Hardware, Software/Application, Network)
  - `non_software_items` (Hardware: Laptop/Desktop/Printer/Accessories/Modem-Router; Network: Internet/VPN)
  - `request_type` (New Account, System Access, Reset Password, Bug Fix under Software/Application; IT Equipment under Hardware)

**New page — `/helpdesk` (RGMC IT Online Helpdesk):**
- `templates/helpdesk.html` — full 3-section form: Ticket Info, Requestor Info, Request Details.
- `static/helpdesk.js` — dynamic category→subcategory→request-type cascades, priority auto-computation, URL param pre-fill (`?system=X` pre-fills Software/Application + Incident/Problem + Bug Fix), form submission.
- Ticket type is 3 styled radio cards; description text animates in on hover/selection.
- Priority computed from Business Impact × Urgency: P1 (high+high), P2 (high+medium or vice versa), P3 (medium+medium), P4 (everything else).

**New backend:**
- `GET /helpdesk` — serves helpdesk page.
- `GET /api/helpdesk/categories` — returns `request_category` table.
- `GET /api/helpdesk/subcategories?category=X` — for Software/Application returns visible systems; for others returns `non_software_items`.
- `GET /api/helpdesk/request-types?category=X` — returns `request_type` filtered by category.
- `POST /api/helpdesk` — creates issue row with `from_helpdesk=true`, auto-assigns ticket number, sends `send_helpdesk_email`.
- `send_helpdesk_email` added to `services/email.py` — HTML email with all helpdesk fields.

**AnyDesk ID — added everywhere:**
- `users.anydesk_id` column (9-digit text).
- Profile page (`templates/profile.html`, `static/profile.js`) — new "IT Info" section with AnyDesk ID field.
- Admin user edit modal (`templates/admin.html`, `static/admin.js`) — AnyDesk ID input alongside Viber Number.
- `controllers/profile.py` and `controllers/admin.py` — anydesk_id included in GET select and PATCH allowed fields.

**Admin issues list** — ticket_number shown in the first column and in the modal title (e.g., `[RGMC-00001] Laptop` or `Issue: SomeName` for legacy rows).

**CSS** — helpdesk styles appended to `static/style.css`: ticket option cards, hover description reveal, priority badge (P1–P4 color-coded), full dark+light mode support.

### Completed in prior sessions (pre-compaction):

- Light mode as default + full theme adaptation
- Username generation overhaul + middle initial everywhere
- System/Task type toggle in admin Systems tab
- Removed auth wall from issue reporting — public form
- Post-submission account suggestion banner on report_issue
- viber_number field throughout
- Logo links → `/`
- Attachment thumbnail previews + lightbox

---

## Files Actively Being Edited

All changes are **uncommitted** and sitting in the working tree.

**New files:**
- `templates/helpdesk.html`
- `static/helpdesk.js`

**Modified files:**
- `controllers/public.py` — helpdesk route + 4 API endpoints; `request` import added
- `controllers/issues.py` — `_submit_helpdesk_issue()`, `api_submit_helpdesk()`, `send_helpdesk_email` import
- `controllers/profile.py` — anydesk_id in select, response dict, and PATCH loop
- `controllers/admin.py` — anydesk_id in select and allowed set
- `services/email.py` — `send_helpdesk_email` function + label dicts added
- `static/admin.js` — anydesk_id in user modal populate/save; ticket_number in issue list row and modal title
- `static/profile.js` — anydesk_id read from server and sent in PATCH; client-side 9-digit validation
- `static/style.css` — helpdesk CSS block appended (~120 lines)
- `templates/admin.html` — anydesk_id field in edit-user modal
- `templates/profile.html` — "IT Info" section with anydesk_id field
- (16 files from prior sessions also uncommitted — see previous handoff)

---

## Next Step

**Commit all changes.** Run via PowerShell:

```powershell
git add templates/helpdesk.html static/helpdesk.js controllers/public.py controllers/issues.py controllers/profile.py controllers/admin.py services/email.py static/admin.js static/profile.js static/style.css templates/admin.html templates/profile.html
git commit -m "add IT online helpdesk page, ticket numbering, anydesk_id"
```

(The 16 files from prior sessions are also still uncommitted and should be added too.)

---

## Context & Gotchas

- **Git must use PowerShell, not Bash.** The Git Bash binary (`bash.exe`) crashes with `msys-2.0.dll` fatal error on this machine.

- **Edit tool requires prior Read.** Read target files in the current session before editing.

- **Supabase via REST, no ORM.** Service key bypasses RLS — new lookup tables (`request_category`, `non_software_items`, `request_type`) are accessible without additional policy setup.

- **ticket_number DEFAULT** is a PostgreSQL sequence-backed expression. When inserting via Supabase REST without providing `ticket_number`, the DB generates the next `RGMC-XXXXX` value automatically. Existing rows have `RGMC-00000` (not unique; no UNIQUE constraint on this column).

- **Helpdesk subcategory cascade:**
  - `Software/Application` → `GET /systems?is_visible=eq.true` → returns `{value: id, label: name}`
  - `Hardware` / `Network` → `GET /non_software_items?category=eq.X` → returns `{value: subcategory, label: subcategory}`

- **URL param shortcut for system issues:** `/helpdesk?system=<system_id>` pre-fills category=Software/Application, ticket_type=incident_problem, request_type=Bug Fix, and attempts to select the system in the subcategory dropdown. This allows the existing report-issue redirect flow to be pointed at the helpdesk page.

- **Priority matrix:** P1=high+high, P2=high+medium (or reverse), P3=medium+medium, P4=everything else (including high+low per the spec).

- **AnyDesk ID validation:** 9 digits, validated both client-side (regex) and server-side (regex in `_submit_helpdesk_issue`).

- **`var(--surface-2)` was a bug** (documented in prior session). Fixed in `static/style.css`.

- **Theme localStorage contract.** Key is `rgmc-theme`. Absence = light. Only dark is ever written.
