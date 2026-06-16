<div align="center">

# <span style="color:#C4972A">RGMC Gateway</span>

<p style="color:#666"><em>Internal systems portal and developer hub for RGMC Group</em></p>

[![Python](https://img.shields.io/badge/Python-3.12-3776ab?logo=python&logoColor=white)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.0.3-000000?logo=flask)](https://flask.palletsprojects.com)
[![Gunicorn](https://img.shields.io/badge/Gunicorn-22.0.0-499848?logo=gunicorn)](https://gunicorn.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?logo=supabase)](https://supabase.com)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ed?logo=docker)](https://docker.com)
[![Cloud Run](https://img.shields.io/badge/Google%20Cloud%20Run-deployed-4285f4?logo=googlecloud)](https://cloud.google.com/run)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Tech Stack](#-tech-stack)
- [Features](#-features)
- [Screens & Routes](#-screens--routes)
- [Project Structure](#-project-structure)
- [Setup & Installation](#-setup--installation)
- [Environment Variables](#-environment-variables)
- [Running the App](#-running-the-app)
- [Building for Production](#-building-for-production)
- [API Endpoints](#-api-endpoints)
- [Database Schema](#-database-schema)
- [Sites Cache Strategy](#-sites-cache-strategy)
- [Authentication Flow](#-authentication-flow)
- [Core Data Flow](#-core-data-flow)
- [Email Notifications](#-email-notifications)
- [Brand & Design Tokens](#-brand--design-tokens)
- [License](#-license)

---

## 🏢 Overview

RGMC Gateway is the internal systems portal for RGMC Group. It serves as a single-page launcher for all company applications (cloud-hosted and NAV sites), a username-gated access control system, a developer kanban board, an IT issue reporting tool, and an admin panel for managing users, systems, and access requests.

**Who uses it:**
- **Regular employees** — authenticate with their username to access assigned systems
- **Developers** — use the kanban board to track and manage dev items across systems
- **Admins** — approve/reject access requests, manage users and system listings, review developer performance and issues

**Key design decisions:**
- **Username-only auth** — no passwords stored; sessions live in `localStorage` and pass via `X-Gateway-Username` header on every API call
- **Supabase as backend-as-a-service** — PostgREST API for all DB reads/writes, Supabase Storage for avatars and issue attachments
- **In-memory sites cache** — system directory cached for 5 minutes server-side to minimize DB hits on the homepage
- **Email-gated access approval** — new user requests generate a tokenized approve/reject link sent to the designated approver
- **Stateless containers** — designed to run on Google Cloud Run with 1 worker, 8 threads, no persistent local state

---

## 🛠 Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Web framework | Flask | 3.0.3 |
| WSGI server | Gunicorn | 22.0.0 |
| HTTP client | requests | 2.32.3 |
| Language | Python | 3.12 |
| Database | Supabase (PostgreSQL via PostgREST) | — |
| File storage | Supabase Storage | — |
| Email | smtplib (SMTP/TLS) | stdlib |
| Containerization | Docker (`python:3.12-slim`) | — |
| Cloud hosting | Google Cloud Run | — |
| Frontend | Vanilla JS + CSS (no build step) | — |

---

## ✨ Features

### <span style="color:#2a9d8f">🔐 Authentication & Access Control</span>

- Username-only sign-in: validated against the `users` table in Supabase
- Fallback lookup against `access_requests` for recently approved users not yet in `users`
- Session stored in `localStorage` as JSON under key `rgmc_gateway_session`; passed to server as `X-Gateway-Username` header
- New access request form: first name, last name, company, department, position, email, system selection
- Additional access requests for existing users to gain new systems
- Email-gated approval: approver receives HTML email with one-click Approve/Reject links tied to a UUID token
- Token-based approval and rejection pages (`/access/approve/<token>`, `/access/reject/<token>`)

### <span style="color:#2a9d8f">🌐 System Directory</span>

- Homepage lists all visible systems grouped by category (RGMC, SBIC, NAV Sites)
- Each system card shows primary link + optional backup link
- System list loaded from Supabase `systems` table; falls back to hardcoded `SITES_FALLBACK` if DB is unreachable
- In-memory cache with 5-minute TTL; invalidated immediately on any admin create/update/delete

### <span style="color:#2a9d8f">🐛 Issue Reporting</span>

- Standalone page at `/report-issue` (also accessible from the main portal)
- Auth wall: user must verify their username before submitting
- Form fields: employee name, company, department, email, system, optional title, description, up to 5 file attachments
- Attachments stored in Supabase Storage bucket `issue-attachments`
- Issue saved to `issues` table with attachment URLs
- Email sent to `DEVELOPER_EMAIL` with full details and inline attachments
- Email notification sent to reporter when status transitions to `resolved` or `closed`

### <span style="color:#2a9d8f">🗂 Developer Board</span>

- Kanban board at `/developer` (requires `is_developer` or `is_admin` flag)
- Five columns: **Pending** · **Ongoing** · **Coding** · **Testing** · **Done**
- Physics-based drag-and-drop for moving cards between columns
- Dev item cards show title, type badge, system, dates, per-developer border colors (DJB2 hash → 8-color palette)
- Inline detail modal: edit title, description, type, system, start/estimated/actual end dates
- Activity log per item: timestamped messages with optional hours tracked
- Seven item types: Feature, Bug Fix, Enhancement, Refactor, Testing, Documentation, Others (custom text stored as `"Others: <text>"`)
- "Promote to Dev Item" action on issues creates a linked `dev_items` row from an issue

### <span style="color:#2a9d8f">👤 User Profile</span>

- Profile page at `/profile`: set display name, upload avatar
- Avatar cropped client-side and uploaded as base64-encoded image to Supabase Storage bucket `avatars`
- Display name capped at 80 characters
- Avatar visible across kanban board (developer cards) and admin developer performance view

### <span style="color:#2a9d8f">🛡 Admin Panel</span>

- Admin page at `/admin` (requires `is_admin` flag)
- **Requests tab** — view pending/approved/rejected access requests; one-click approve or reject with optional remarks
- **Users tab** — list all users; toggle `is_admin`, `is_developer` flags; edit assigned systems; delete users
- **Systems tab** — CRUD for system entries: id, name, category, URLs, labels, sort order, visibility toggle
- **Issues tab** — view all issue reports; update status (open → in_progress → resolved/closed); assign to developer; add resolution notes and resolver name
- **Developers tab** — performance metrics per developer: counts by status (pending, ongoing, coding, testing, done), systems handled, full dev item list; clickable rows open a detail modal; PDF download via `window.print()`
- **Health tab** — live health check against RGMC GCP API and RGMC Inventory API

---

## 🖥 Screens & Routes

```
GET  /                              Homepage — system directory launcher
GET  /report-issue                  Standalone issue reporting (auth wall + form)
GET  /profile                       User profile — display name + avatar
GET  /developer                     Developer kanban board
GET  /admin                         Admin panel (requests / users / systems / issues / developers / health)

GET  /access/approve/<token>        One-click access approval via email link
GET  /access/reject/<token>         One-click access rejection via email link
```

---

## 📁 Project Structure

```
rgmc-gateway/
│
├── app.py                          Flask app factory; registers all blueprints
├── config.py                       Env var loading; SITES_FALLBACK; HEALTH_CHECKS config
├── requirements.txt                flask, gunicorn, requests
├── Dockerfile                      python:3.12-slim; gunicorn 1w/8t/120s
├── .dockerignore
├── .env.example                    All env vars with descriptions
│
├── controllers/                    Flask blueprints (one per domain)
│   ├── public.py                   GET / · GET /report-issue · GET /api/health
│   ├── auth.py                     POST /verify-username · POST /access-request[/additional]
│   │                               GET /access/approve/<token> · GET /access/reject/<token>
│   ├── issues.py                   POST /report (legacy) · POST /api/issues
│   │                               GET|PATCH /api/admin/issues[/<id>]
│   │                               POST /api/admin/issues/<id>/promote
│   ├── developer.py                GET|POST /api/dev/items · PATCH|DELETE /api/dev/items/<id>
│   │                               GET|POST /api/dev/items/<id>/logs
│   │                               GET|POST /api/dev/systems · GET /api/dev/members
│   ├── admin.py                    GET /api/admin/requests · GET /api/admin/users
│   │                               PATCH|DELETE /api/admin/users/<uname>
│   │                               GET /api/admin/dev-performance
│   │                               GET|POST /api/admin/systems
│   │                               PATCH|DELETE /api/admin/systems/<id>
│   │                               POST /api/admin/requests/<id>/approve|reject
│   └── profile.py                  GET|PATCH /api/profile
│                                   POST|DELETE /api/profile/avatar
│
├── services/
│   ├── supabase.py                 supabase_req() — authenticated PostgREST wrapper
│   ├── guards.py                   _require_admin() · _require_developer()
│   ├── sites.py                    get_sites() with 5-min in-memory cache; _invalidate_sites_cache()
│   └── email.py                    All transactional email functions (smtplib/STARTTLS)
│
├── models/
│   └── access.py                   generate_username() · _approve_record() · _reject_record()
│
├── templates/
│   ├── index.html                  Homepage
│   ├── report_issue.html           Standalone issue report page
│   ├── profile.html                Profile page
│   ├── developer.html              Kanban board
│   ├── admin.html                  Admin panel (all tabs)
│   └── access_result.html          Shared approve/reject result page
│
└── static/
    ├── style.css                   All CSS (variables, components, admin, developer, profile, report)
    ├── script.js                   Homepage JS (auth wall, session, system cards)
    ├── admin.js                    Admin panel JS (all tabs, modals, developer performance)
    ├── developer.js                Kanban JS (drag-drop, item modals, activity logs)
    ├── profile.js                  Profile JS (avatar crop/upload, display name)
    └── report_issue.js             Standalone report page JS (auth wall, form, drag-drop files)
```

---

## ⚙ Setup & Installation

### Prerequisites

- Python 3.12+
- A [Supabase](https://supabase.com) project with the required tables (see [Database Schema](#-database-schema))
- A Gmail account with an App Password for SMTP
- (Optional) Docker for containerized deployment

### Clone & Install

```bash
git clone <repo-url>
cd rgmc-gateway

# Create virtual environment
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### Configure environment

```bash
cp .env.example .env
# Edit .env with your Supabase URL, service key, and SMTP credentials
```

---

## 🔑 Environment Variables

| Variable | File | Description |
|---|---|---|
| `SMTP_HOST` | `.env` | SMTP server hostname (default: `smtp.gmail.com`) |
| `SMTP_PORT` | `.env` | SMTP port (default: `587` for STARTTLS) |
| `SMTP_USER` | `.env` | SMTP login username (Gmail address) |
| `SMTP_PASSWORD` | `.env` | Gmail App Password (16-char) |
| `SENDER_EMAIL` | `.env` | From address on outgoing emails |
| `DEVELOPER_EMAIL` | `.env` | IT team email — receives issue reports |
| `APPROVER_EMAIL` | `.env` | Receives access request emails with approve/reject links |
| `SUPABASE_URL` | `.env` | Supabase project URL (`https://<ref>.supabase.co`) |
| `SUPABASE_SERVICE_KEY` | `.env` | Supabase service role key (bypasses RLS) |
| `GATEWAY_BASE_URL` | `.env` | Public URL of this app — used in email approve/reject links. Leave blank to auto-detect |
| `PORT` | injected | Server port. Cloud Run injects this automatically; default `8080` |

> 💡 **Tip:** On Google Cloud Run, set all variables as Cloud Run environment variables or Secret Manager secrets. Do not commit `.env` to git.

---

## 🚀 Running the App

### Development

```bash
# Load .env and run Flask dev server
export $(cat .env | grep -v ^# | xargs)   # Linux/macOS
# Windows PowerShell: Get-Content .env | ForEach-Object { $env:($_ -split '=')[0] = ($_ -split '=',2)[1] }

flask run --debug --port 8080
```

The app will be available at `http://localhost:8080`.

### Production (Gunicorn)

```bash
gunicorn --bind :8080 --workers 1 --threads 8 --timeout 120 app:app
```

---

## 🐳 Building for Production

### Docker

```bash
# Build image
docker build -t rgmc-gateway .

# Run container
docker run -p 8080:8080 \
  -e SUPABASE_URL=... \
  -e SUPABASE_SERVICE_KEY=... \
  -e SMTP_USER=... \
  -e SMTP_PASSWORD=... \
  -e SENDER_EMAIL=... \
  -e DEVELOPER_EMAIL=... \
  -e APPROVER_EMAIL=... \
  rgmc-gateway
```

### Google Cloud Run

```bash
# Build and push
gcloud builds submit --tag gcr.io/<PROJECT_ID>/rgmc-gateway

# Deploy
gcloud run deploy rgmc-gateway \
  --image gcr.io/<PROJECT_ID>/rgmc-gateway \
  --platform managed \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --set-env-vars SUPABASE_URL=...,SUPABASE_SERVICE_KEY=...,...
```

> ⚠️ **Cloud Run note:** `PORT` is injected automatically. Do not set it manually. The Dockerfile CMD uses `${PORT:-8080}`.

---

## 📡 API Endpoints

### <span style="color:#555">Public</span>

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Polls RGMC GCP API and RGMC Inventory API; returns status per endpoint |

### <span style="color:#555">Auth</span>

| Method | Path | Description |
|---|---|---|
| `POST` | `/verify-username` | Validate username against `users` table; returns session payload |
| `POST` | `/access-request` | Submit new access request; triggers approval email |
| `POST` | `/access-request/additional` | Request additional systems for existing username |
| `GET` | `/access/approve/<token>` | Token-based approval (linked from email); runs `_approve_record()` |
| `GET` | `/access/reject/<token>` | Token-based rejection (linked from email); runs `_reject_record()` |

**`POST /verify-username` response:**
```json
{
  "success": true,
  "username": "jdoe",
  "first_name": "John",
  "full_name": "John Doe",
  "display_name": "JD",
  "avatar_url": "https://...",
  "company": "RGMC",
  "department": "IT",
  "email": "jdoe@rgmc.com",
  "systems": ["travel-expense", "creatives"],
  "is_admin": false,
  "is_developer": true
}
```

**`POST /access-request` payload (form data):**
```
first_name, last_name, middle_initial, company, department, position, email, systems[] (multi-value)
```

### <span style="color:#555">Issues</span>

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/issues` | None | Submit issue report (form + files, max 5 attachments, 20 MB total) |
| `POST` | `/report` | None | Legacy alias for `/api/issues` |
| `GET` | `/api/admin/issues` | Admin | List all issues ordered by `created_at desc` |
| `PATCH` | `/api/admin/issues/<id>` | Admin | Update status, assigned_to, title, resolution_notes, resolved_by |
| `POST` | `/api/admin/issues/<id>/promote` | Admin | Create a `dev_items` row from issue; links `dev_item_id` back |

**`PATCH /api/admin/issues/<id>` payload:**
```json
{
  "status": "resolved",
  "assigned_to": "jdoe",
  "resolution_notes": "Fixed by clearing cache",
  "resolved_by": "Jane Developer"
}
```

### <span style="color:#555">Developer Board</span>

All `/api/dev/*` endpoints require `is_developer=true` or `is_admin=true`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/dev/items` | All dev items ordered by `created_at asc` |
| `POST` | `/api/dev/items` | Create new dev item |
| `PATCH` | `/api/dev/items/<id>` | Update item fields (title, description, status, system_id, dates, type) |
| `DELETE` | `/api/dev/items/<id>` | Delete dev item |
| `GET` | `/api/dev/items/<id>/logs` | Get activity logs for item |
| `POST` | `/api/dev/items/<id>/logs` | Add activity log (message + optional hours_spent) |
| `GET` | `/api/dev/systems` | All systems (id, name, category, URLs, sort) |
| `POST` | `/api/dev/systems` | Create system (requires id, name, category, primary_url, primary_label) |
| `GET` | `/api/dev/members` | All developers and admins (username, name, avatar_url) |

**`POST /api/dev/items` payload:**
```json
{
  "title": "Fix login timeout",
  "description": "Users are getting logged out too quickly",
  "system_id": "travel-expense",
  "dev_item_type": "Bug Fix",
  "start_date": "2026-06-01",
  "estimated_end_date": "2026-06-10"
}
```

**Valid `status` values:** `pending` · `ongoing` · `coding` · `testing` · `done`

### <span style="color:#555">Admin</span>

All `/api/admin/*` endpoints require `is_admin=true`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/requests` | Access requests; optional `?status=pending\|approved\|rejected` |
| `POST` | `/api/admin/requests/<id>/approve` | Approve request; calls `_approve_record()`; sends grant email |
| `POST` | `/api/admin/requests/<id>/reject` | Reject; optional `{"remarks": "..."}` body; sends rejection email |
| `GET` | `/api/admin/users` | All users with profile + system + role fields |
| `PATCH` | `/api/admin/users/<uname>` | Update `is_admin`, `is_developer`, or `systems` |
| `DELETE` | `/api/admin/users/<uname>` | Delete user record |
| `GET` | `/api/admin/systems` | All systems ordered by sort_order asc, name asc |
| `POST` | `/api/admin/systems` | Create system |
| `PATCH` | `/api/admin/systems/<id>` | Update system fields |
| `DELETE` | `/api/admin/systems/<id>` | Delete system; invalidates sites cache |
| `GET` | `/api/admin/issues` | All issues (same as issues endpoint above) |
| `PATCH` | `/api/admin/issues/<id>` | Update issue |
| `POST` | `/api/admin/issues/<id>/promote` | Promote issue to dev item |
| `GET` | `/api/admin/dev-performance` | Developer performance report: counts by status, systems, enriched items |

**`GET /api/admin/dev-performance` response shape:**
```json
[
  {
    "username": "jdoe",
    "first_name": "John",
    "last_name": "Doe",
    "display_name": "",
    "avatar_url": "https://...",
    "email": "jdoe@rgmc.com",
    "company": "RGMC",
    "department": "IT",
    "position": "Developer",
    "is_admin": false,
    "is_developer": true,
    "counts": { "pending": 2, "ongoing": 1, "coding": 3, "testing": 1, "done": 8, "total": 15 },
    "systems": ["Creatives", "Production"],
    "items": [
      {
        "id": "uuid",
        "title": "Fix login timeout",
        "status": "coding",
        "dev_item_type": "Bug Fix",
        "system_name": "Creatives",
        "start_date": "2026-06-01",
        "estimated_end_date": "2026-06-10",
        "actual_end_date": null,
        "created_at": "2026-06-01T00:00:00Z"
      }
    ]
  }
]
```

### <span style="color:#555">Profile</span>

All `/api/profile` endpoints require `X-Gateway-Username` header (any authenticated user).

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/profile` | Get current user's profile (username, names, display_name, avatar_url) |
| `PATCH` | `/api/profile` | Update `display_name` (max 80 chars; send `null` to clear) |
| `POST` | `/api/profile/avatar` | Upload avatar as data URL; stored to Supabase Storage `avatars/` bucket |
| `DELETE` | `/api/profile/avatar` | Remove avatar from storage and clear `avatar_url` in DB |

**`POST /api/profile/avatar` payload:**
```json
{ "avatar": "data:image/jpeg;base64,/9j/4AAQ..." }
```

---

## 🗄 Database Schema

### <span style="color:#555">`users`</span>

| Column | Type | Notes |
|---|---|---|
| `username` | `text` PK | Auto-generated on first approval (`<first initial><last name>`) |
| `first_name` | `text` | |
| `last_name` | `text` | |
| `middle_initial` | `text` | |
| `display_name` | `text` | Optional alias shown in UI |
| `avatar_url` | `text` | Public Supabase Storage URL |
| `company` | `text` | |
| `department` | `text` | |
| `position` | `text` | |
| `email` | `text` | |
| `systems` | `text[]` | Array of system IDs the user can access |
| `is_admin` | `boolean` | Default false |
| `is_developer` | `boolean` | Default false |
| `created_at` | `timestamptz` | |

### <span style="color:#555">`access_requests`</span>

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `first_name`, `last_name`, `middle_initial` | `text` | |
| `company`, `department`, `position` | `text` | |
| `email` | `text` | |
| `systems` | `text[]` | Requested system IDs |
| `username` | `text` | Populated on approval; also set on additional requests |
| `status` | `text` | `pending` · `approved` · `rejected` |
| `approval_token` | `uuid` | Used in approve/reject email links |
| `rejection_remarks` | `text` | Optional; set on rejection |
| `processed_at` | `timestamptz` | Set on approve or reject |
| `created_at` | `timestamptz` | |

### <span style="color:#555">`systems`</span>

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | Slug (e.g. `travel-expense`) |
| `name` | `text` | Display name |
| `category` | `text` | Groups cards (e.g. `RGMC`, `SBIC`, `NAV Sites`) |
| `primary_url` | `text` | |
| `primary_label` | `text` | Button text (e.g. `Open`, `Primary`) |
| `backup_url` | `text` | Optional |
| `backup_label` | `text` | Optional |
| `sort_order` | `int` | Default 999; lower = first |
| `is_visible` | `boolean` | Only `true` rows shown on homepage |

### <span style="color:#555">`dev_items`</span>

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `title` | `text` | |
| `description` | `text` | |
| `status` | `text` | CHECK: `pending · ongoing · coding · testing · done` |
| `system_id` | `text` | FK → `systems.id` |
| `dev_item_type` | `text` | One of 7 types; custom stored as `"Others: <text>"` |
| `start_date` | `date` | |
| `estimated_end_date` | `date` | |
| `actual_end_date` | `date` | |
| `created_by` | `text` | FK → `users.username` |
| `updated_at` | `timestamptz` | Set on every PATCH |
| `created_at` | `timestamptz` | |

### <span style="color:#555">`dev_activity_logs`</span>

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `item_id` | `uuid` | FK → `dev_items.id` |
| `username` | `text` | FK → `users.username` |
| `message` | `text` | |
| `hours_spent` | `float` | Optional |
| `created_at` | `timestamptz` | |

### <span style="color:#555">`issues`</span>

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `site_name` | `text` | System the issue affects |
| `employee_name` | `text` | Reporter's name |
| `company_name`, `department` | `text` | |
| `email` | `text` | Reporter's email (used for resolved notification) |
| `title` | `text` | Optional; defaults to truncated description |
| `description` | `text` | |
| `status` | `text` | `open · in_progress · resolved · closed` |
| `attachment_urls` | `text[]` | Public Supabase Storage URLs |
| `assigned_to` | `text` | Developer username |
| `resolution_notes` | `text` | Set when resolving; included in notification email |
| `resolved_by` | `text` | Developer name shown in notification |
| `resolved_at` | `timestamptz` | Set on first transition to `resolved`/`closed` |
| `dev_item_id` | `uuid` | Set when promoted to a dev item |
| `created_at` | `timestamptz` | |

### <span style="color:#555">Supabase Storage Buckets</span>

| Bucket | Path pattern | Contents |
|---|---|---|
| `avatars` | `<username>.<ext>` | User profile pictures (jpg/png/webp); upserted on upload |
| `issue-attachments` | `<issue_id>/<index>_<filename>` | Issue report attachments (up to 5 per issue) |

---

## 💾 Sites Cache Strategy

| Property | Value |
|---|---|
| Storage | Python module-level variable (`_sites_cache`) |
| TTL | 300 seconds (5 minutes) |
| Populated from | Supabase `systems` table where `is_visible = true`, ordered by `sort_order asc, name asc` |
| Fallback | `SITES_FALLBACK` list in `config.py` — 19 hardcoded systems across RGMC, SBIC, NAV Sites |
| Invalidated by | Any admin or developer create/update/delete on a system record |
| Scope | Single process only — not shared across Cloud Run instances |

> 📌 **Important:** Because cache is per-process, a new Cloud Run instance always starts cold and fetches from DB on the first request.

---

## 🔐 Authentication Flow

**New user — first access:**

1. User visits `/` and sees the sign-in wall
2. User clicks "Request Access" and fills the access request form
3. `POST /access-request` saves a row to `access_requests` with `status=pending` and a UUID `approval_token`
4. Server sends an HTML email to `APPROVER_EMAIL` containing Approve / Reject buttons linked to `/access/approve/<token>` and `/access/reject/<token>`
5. Approver clicks **Approve** → `GET /access/approve/<token>` runs `_approve_record()`:
   - Generates username: `<first-initial><last-name>` (e.g. `jdoe`); appends `1`, `2`… if taken
   - Updates `access_requests` row: `status=approved`, `username=<generated>`, `processed_at=<now>`
   - Upserts a row in `users` table with all profile fields
   - Sends confirmation email to the user with their new username
6. User returns to `/`, enters username → `POST /verify-username` finds the `users` row and returns session JSON
7. Client stores session in `localStorage["rgmc_gateway_session"]`; all subsequent API calls send `X-Gateway-Username: <username>`

**Existing user — sign in:**

1. User enters username on the sign-in wall
2. `POST /verify-username` checks `users` table (primary) → `access_requests` table (fallback)
3. On match: returns profile JSON → client stores in `localStorage` and renders the portal
4. On no match: returns 404 → user redirected to request access form

**Additional system access:**

1. Signed-in user opens the system request modal and selects new systems
2. `POST /access-request/additional` creates a new `access_requests` row with the user's existing username
3. Same approval email flow; on approval, new systems are merged into `users.systems[]`

**Admin / Developer access:**

- Every protected API endpoint calls `_require_admin()` or `_require_developer()` from `services/guards.py`
- Guard reads `X-Gateway-Username` header, fetches the user row, checks `is_admin` / `is_developer` flag
- Returns `(username, None)` on success or `(None, (error_dict, status_code))` on failure

---

## 🔄 Core Data Flow

### Issue Report → Resolution → Notification

```
User opens /report-issue
    |
    +--> Auth wall: POST /verify-username
    |        |-- Found in users table → session loaded
    |        +-- Not found → sign-in wall stays visible
    |
    +--> User fills form + optional attachments
    |
    +--> POST /api/issues (FormData, X-Gateway-Username header)
            |
            +--> Validate required fields
            +--> supabase_req POST /issues → get issue_id
            +--> Upload each file to Supabase Storage issue-attachments/<issue_id>/
            +--> supabase_req PATCH /issues → save attachment_urls[]
            +--> send_report_email() → SMTP to DEVELOPER_EMAIL (with files attached)
            +--> Return { success: true }

Admin opens /admin → Issues tab
    |
    +--> GET /api/admin/issues → list all issues
    +--> Admin opens issue → edits status to "resolved", adds resolution notes + resolver name
    +--> PATCH /api/admin/issues/<id>
            |
            +--> Fetch current issue (get old_status)
            +--> If new_status ∈ {resolved, closed} AND old_status ∉ {resolved, closed}:
            |       +--> Set resolved_at = now()
            |       +--> supabase_req PATCH /issues
            |       +--> send_issue_resolved_email() → SMTP to reporter's email
            +--> else: supabase_req PATCH /issues (no email)
```

### Developer Kanban Flow

```
Developer opens /developer
    |
    +--> GET /api/dev/items → all dev items
    +--> GET /api/dev/systems → system list for dropdowns
    +--> GET /api/dev/members → team avatars for item cards
    |
    +--> Drag card from "Pending" column → drop on "Coding" column
            |
            +--> PATCH /api/dev/items/<id> { status: "coding", updated_at: <now> }
            +--> Card re-renders in new column

Developer adds activity log:
    |
    +--> POST /api/dev/items/<id>/logs { message: "...", hours_spent: 2.5 }
```

---

## 📧 Email Notifications

| Function | Trigger | Recipient | Subject |
|---|---|---|---|
| `send_report_email` | Issue submitted | `DEVELOPER_EMAIL` | `[RGMC Problem Report] <System Name>` |
| `send_approval_request_email` | Access request submitted | `APPROVER_EMAIL` | `[Access Request] <Full Name> — RGMC Gateway` |
| `send_access_granted_email` | Request approved | Requester's email | `Your RGMC Gateway Access Has Been Approved` |
| `send_access_rejected_email` | Request rejected | Requester's email | `Your RGMC Gateway Access Request — Not Approved` |
| `send_admin_granted_email` | User granted `is_admin=true` | User's email | `Admin Access Granted — RGMC Gateway` |
| `send_issue_resolved_email` | Issue status → `resolved`/`closed` | Reporter's email | `Your Issue Has Been Resolved/Closed — <System>` |

All emails are sent via SMTP STARTTLS (port 587) using Gmail App Password. Sending is fire-and-forget — failures are logged but do not affect the API response.

---

## 🎨 Brand & Design Tokens

| Token | Value | Usage |
|---|---|---|
| `--gold` | `#C4972A` | Primary brand accent, buttons, borders, section headings |
| `--gold-light` | `#D4A83C` | Hover state for gold elements |
| `--gold-dim` | `rgba(196,151,42,0.12)` | Subtle gold backgrounds (avatar fallback, badges) |
| `--gold-glow` | `rgba(196,151,42,0.18)` | Card hover glow |
| `--gold-border` | `rgba(196,151,42,0.22)` | Default gold border |
| `--gold-border-h` | `rgba(196,151,42,0.58)` | Hovered gold border |
| `--bg` | `#080604` | App background (near-black) |
| `--bg-surface` | `#0F0C07` | Surface layer |
| `--bg-card` | `#0D0A06` | Card background |
| `--bg-card-h` | `#161209` | Card hover state |
| `--bg-card-inner` | `#121008` | Inner card sections |
| `--bg-modal` | `#0B0906` | Modal background |

**Dev item status colors:**

| Status | Color | Background |
|---|---|---|
| Pending | `#6b7280` (gray) | `#f3f4f6` |
| Ongoing | `#a855f7` (violet) | `#f3e8ff` |
| Coding | `#3b82f6` (blue) | `#eff6ff` |
| Testing | `#f59e0b` (amber) | `#fffbeb` |
| Done | `#22c55e` (green) | `#f0fdf4` |

**Typography:** Playfair Display (display/headings) + Plus Jakarta Sans (body) — loaded from Google Fonts.

---

## 📄 License

This is a private internal tool for RGMC Group. All rights reserved.
