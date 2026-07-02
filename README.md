<div align="center">

# <span style="color:#C4972A">RGMC Gateway</span>

<p style="color:#666">Internal IT portal for RGMC Group — system launcher, IT helpdesk, issue tracker, and developer board</p>

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.x-000000?logo=flask&logoColor=white)](https://flask.palletsprojects.com)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![License](https://img.shields.io/badge/License-Private-C4972A)](.)

</div>

---

## 📋 Table of Contents

1. [Overview](#-overview)
2. [Tech Stack](#-tech-stack)
3. [Features](#-features)
4. [Screens / Routes](#-screens--routes)
5. [Project Structure](#-project-structure)
6. [Setup & Installation](#-setup--installation)
7. [Environment Variables](#-environment-variables)
8. [Running the App](#-running-the-app)
9. [API Endpoints](#-api-endpoints)
10. [Database Tables](#-database-tables)
11. [Authentication Flow](#-authentication-flow)
12. [IT Bot Notifications](#-it-bot-notifications)
13. [Email Notifications](#-email-notifications)
14. [Issue Lifecycle](#-issue-lifecycle)
15. [Brand / Design Tokens](#-brand--design-tokens)
16. [License](#-license)

---

## 🌐 Overview

RGMC Gateway is a private internal IT portal that serves as a single entry point for all RGMC Group digital systems. It combines a curated system launcher (with live health checks), a multi-channel IT helpdesk, a full-featured issue tracker with admin analytics, a developer Kanban board, and a user workspace — all in a dark luxury aesthetic built on Flask + Supabase, with no bundler or build step.

**Key design decisions:**
- No SPA framework — server-rendered HTML templates with vanilla JS modules per page
- Auth is session-less — username is stored in `localStorage` and sent as `X-Gateway-Username` on every API call
- Supabase is accessed via its PostgREST HTTP API (no SDK), keeping the server dependency list minimal
- All email is plain SMTP (Gmail) via `smtplib`
- IT bot integration is fire-and-forget via HTTP webhooks

---

## 🛠 Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Web framework | Flask 3.x | Blueprint-based; one blueprint per domain |
| Database | Supabase (PostgreSQL) | Accessed via PostgREST REST API |
| File storage | Supabase Storage | Buckets: `issue-attachments`, `resolution-attachments`, `system-files` |
| Email | Python `smtplib` + Gmail SMTP | TLS on port 587 |
| IT bot | HTTP webhook | Fire-and-forget; `IT_BOT_URL` + `IT_BOT_API_KEY` |
| Frontend | Vanilla JS + HTML templates (Jinja2) | No bundler; one JS file per page |
| Fonts | Playfair Display + Plus Jakarta Sans | Loaded from Google Fonts |
| CSS architecture | Custom properties + modular partials | Imported via `style.css` manifest |

---

## ✨ Features

### 🏠 System Launcher
- Categorized system cards: **RGMC**, **SBIC**, **NAV Sites**, **Windows-based**, **Task systems**
- Per-card primary + backup URLs with custom labels
- Live health check panel for 3 production APIs (RGMC GCP API, Inventory API, BC API)
- **Tags** on systems — searchable via `GET /api/systems/by-tag?tag=<tag>`
- **Windows system type** — admin can upload `.exe` / `.appref-ms` / `.manifest` launcher files to Supabase Storage; Gateway serves a redirect that triggers ClickOnce launch
- Compact mode toggle persisted per-user in localStorage
- Search bar to filter visible systems by name
- System list is DB-driven with in-memory cache invalidated on admin changes; falls back to hardcoded list if DB is unreachable

### 🔐 Access & Authentication
- Username-only login — no passwords stored by the gateway
- Access request flow: employee submits request form → email sent to approver → approver clicks approve/reject link → user notified
- Additional system access requests from existing users
- Roles: `is_admin`, `is_developer`, `is_management`, `is_department_head`
- All admin endpoints validate `X-Gateway-Username` header against the `users` table with `is_admin: true`
- User profile page: avatar, display name, company, department, Viber, AnyDesk ID

### 🎫 IT Helpdesk (Public — no login required)
- **Report Issue** form: freeform system issue report, up to 5 attachments (images), Viber + email contact, optional error code and user payload fields
- **IT Helpdesk** form: structured ticket with category, subcategory, request type, urgency, priority, business impact, AnyDesk ID; categories driven by `request_category` DB table (group: IT)
- **General Helpdesk** form: same structure for non-IT departments; categories filtered by `category_group != IT`
- All three forms: email sent to IT team + confirmation email to reporter; IT bot webhook fired; ticket number returned

### 📊 Issue Tracker (Admin)
- Full issue list with live-refresh, column sorting, and multi-criteria filters:
  - Status, priority, urgency, date range, company, category, source (IT helpdesk / report / general)
- **KPI bar**: total, open, in-progress, resolved counts with tooltips showing resolution rate and average resolution time
- **Common Issues analytics**: issues grouped by system and category; resolution type breakdown (quick fix, via dev item, via task, duplicate); average resolution time; per-group resolution drill-down
- **PDF export**: prints the currently filtered issue list
- **Compact mode** for dense issue tables
- **Confirmed fix column** — shows "✓ Yes" / "Pending" / "—" based on reporter confirmation

### 📄 Issue Detail (Admin)
- Ticket timeline: comments, task/dev-item movement logs, activity notes — all merged and sorted chronologically
- **Comment posting** by any authenticated user
- **Reopen issue** modal
- **Promote issue** to dev item (with optional assignee → auto-sets status to `in_progress`)
- **Promote issue** to IT task
- **Promote issue** to user task (routed to a non-IT department)
- **Link issue** to an existing issue, task, or dev item; mark as duplicate (auto-resolves, sends resolution email)
- **Resolution actions**: multi-select from `actions` table; optional screenshot attachments (up to 5 MB images)
- **Share options**: copy link, Teams deep link, Messenger, WhatsApp, Viber, Telegram, Email
- **Assignee notification**: email sent to assigned IT staff when `assigned_to` changes
- **Resolution email**: sent to reporter with notes, actions taken, and attachment previews

### ✅ Public Issue Confirmation Page
- Reporter receives link to `GET /admin/issues/<id>` (no login required)
- Shows ticket status, resolution notes, and confirm-fix prompt when resolved/closed
- **Confirm Fix**: reporter can mark the issue as confirmed fixed (`confirmed_fix = true`)
- **Still Having Issues**: reporter fills in current issue description + steps taken → appended to ticket description → issue reopened (`status = open`, `confirmed_fix = false`) → orange "reopened" banner shown
- URL query params: `?confirmed=1` shows green confirmation banner; `?reopened=1` shows orange reopened banner

### 🧑‍💻 Developer Board
- Kanban board with columns: **Pending → Ongoing → Coding → Testing → Done**
- Drag-and-drop card movement with movement logging to `dev_item_logs`
- Dev items: title, description, system link, dates (start / estimated end / actual end), item type, resolution actions + screenshots
- **Archive** completed items (soft-delete via `is_archived` flag)
- **Admin dev performance dashboard**: per-developer item counts by status, linked issues, linked tasks; PDF export of developer history

### 👥 User Workspace (Authenticated employees)
- User dashboard with issue cards showing: status badges, priority, urgency, confirmed fix badge, creation date, assigned IT staff
- Three issue list views: **My Issues** (filed by me), **Team Issues** (assigned to department), **Assigned** (assigned to me)
- Issue cards link to public issue view page
- Department heads can view/manage user tasks assigned to their department

### 📝 Tasks Board (Admin)
- IT admin task management separate from dev items
- Statuses: `open → in_progress → for_review → done`
- Task creation, assignment, status transitions with email notifications
- Tasks can be linked to issues (promote-task flow)
- **User tasks** table: tasks routed to non-IT departments from issues

### 👤 User Management (Admin)
- Create users from access_requests (auto-username assignment from first+last name + suffix)
- Edit roles: `is_admin`, `is_developer`, `is_management`, `is_department_head`
- Edit profile fields: display name, company, department, position, email, Viber, AnyDesk ID
- Delete users
- Email notification when admin role is granted

### ⚙️ Config Management (Admin)
- **Companies**: `company_code` + `name` CRUD
- **Departments**: `department_code` + `department_name` + `is_active` CRUD
- **Brands**: `brand_code` + `brand_name` + `brand_initial` + `brand_desc` CRUD
- **Request Categories**: `category_name` + `category_desc` + `category_group` CRUD
- **Request Types**: per-category type list CRUD with `is_visible` toggle
- **Non-Software Items**: helpdesk items for non-software categories (Hardware, Peripherals, etc.) CRUD
- **Resolution Actions**: `action_name` + `action_code` + `action_desc` + `is_active` CRUD

---

## 🗺 Screens / Routes

```
GET  /                         System launcher (public)
GET  /report-issue             Freeform issue report form (public)
GET  /helpdesk                 IT helpdesk structured ticket form (public)
GET  /general-helpdesk         General (non-IT) helpdesk form (public)
GET  /admin                    Admin panel (requires is_admin)
GET  /developer                Developer Kanban board (requires is_developer)
GET  /tasks                    IT tasks board (requires is_admin)
GET  /workspace                User dashboard (requires valid username)
GET  /admin/issues/<id>        Issue detail page (accessible with issue link)
GET  /profile                  User profile editor (requires valid username)
GET  /access/approve/<token>   Email-click access approval (no login)
GET  /access/reject/<token>    Email-click access rejection (no login)
```

---

## 📁 Project Structure

```
rgmc-gateway/
├── app.py                        # Flask app factory; registers all blueprints
├── config.py                     # Env var loading; SITES_FALLBACK; HEALTH_CHECKS config
│
├── controllers/
│   ├── auth.py                   # /verify-username, /access-request, /access/approve|reject
│   ├── public.py                 # /, /report-issue, /helpdesk, health checks, public issue API
│   ├── issues.py                 # Issue CRUD, promote, link, activity, comments
│   ├── admin.py                  # Admin users/systems/config, dev performance, common issues
│   ├── developer.py              # Developer board CRUD, item movement logs
│   ├── tasks.py                  # IT tasks + user tasks CRUD
│   ├── user_page.py              # /workspace, user issue list endpoints, dept-head user tasks
│   ├── general_helpdesk.py       # /general-helpdesk form handler
│   ├── profile.py                # /profile page and PATCH /api/user/profile
│   └── resolution.py             # /api/actions, /api/upload/resolution
│
├── services/
│   ├── supabase.py               # supabase_req() HTTP wrapper; resolve_action_names()
│   ├── sites.py                  # get_sites() with in-memory TTL cache; cache invalidation
│   ├── guards.py                 # _require_admin(), _require_developer(), _require_dept_head()
│   ├── email.py                  # All email send functions (SMTP via smtplib)
│   └── it_bot.py                 # notify_ticket_created(), notify_ticket_updated(), build_changes()
│
├── models/
│   └── access.py                 # _approve_record(), _reject_record(), _full_name()
│
├── templates/
│   ├── index.html                # System launcher
│   ├── admin.html                # Admin panel (users, issues, systems, config, analytics)
│   ├── developer.html            # Developer Kanban board
│   ├── tasks.html                # IT tasks board
│   ├── user.html                 # User workspace / dashboard
│   ├── issue_view.html           # Public issue detail + confirm-fix + still-having-issues
│   ├── helpdesk.html             # IT helpdesk form
│   ├── general_helpdesk.html     # General helpdesk form
│   ├── report_issue.html         # Freeform report form
│   ├── profile.html              # User profile editor
│   └── access_result.html        # Access approve/reject result page
│
├── static/
│   ├── style.css                 # CSS manifest — @import all partials
│   ├── script.js                 # System launcher JS
│   ├── admin.js                  # Admin panel JS (issues table, users, config, analytics)
│   ├── developer.js              # Developer board JS (Kanban, drag-drop)
│   ├── tasks.js                  # Tasks board JS
│   ├── user.js                   # User workspace JS (issue cards, tabs)
│   ├── helpdesk.js               # IT helpdesk form JS
│   ├── general_helpdesk.js       # General helpdesk form JS
│   ├── report_issue.js           # Report form JS
│   ├── profile.js                # Profile editor JS
│   └── theme.js                  # Theme/compact mode toggle
│   │
│   └── css/
│       ├── variables.css         # Design tokens (gold, bg, text, shadows, radii)
│       ├── base.css              # Reset, typography
│       ├── layout.css            # Page shell, nav, sidebar
│       ├── cards.css             # System cards
│       ├── health.css            # Health check panel
│       ├── modal.css             # Modal overlay + modal body base styles
│       ├── admin.css             # Admin-specific UI (tables, badges, KPI bar)
│       ├── admin-sidebar.css     # Admin sidebar navigation
│       ├── issues.css            # Issue detail view styles
│       ├── issue-activity.css    # Activity / comment feed
│       ├── issue-tracker.css     # Issue list table (admin)
│       ├── workspace.css         # User dashboard / workspace
│       ├── dev-board.css         # Developer board layout
│       ├── kanban.css            # Kanban column + card styles
│       ├── developer.css         # Developer board JS-interactable elements
│       ├── common-issues.css     # Common issues analytics view
│       ├── helpdesk.css          # Helpdesk form styles
│       ├── report-issue.css      # Report issue form styles
│       ├── profile.css           # Profile page styles
│       ├── gate.css              # Login / access gate
│       ├── theme.css             # Dark/light theme toggle
│       ├── design-refresh.css    # Global UI polish overrides
│       ├── loaders.css           # Spinner / skeleton loaders
│       └── utilities.css         # Helper classes (text-muted, flex, gap, etc.)
```

---

## 🚀 Setup & Installation

**Prerequisites:**
- Python 3.11+
- A Supabase project with the tables listed in [Database Tables](#-database-tables)
- A Gmail account with an App Password for SMTP

```bash
# Clone
git clone <repo-url>
cd rgmc-gateway

# Create virtualenv
python -m venv venv
venv\Scripts\activate   # Windows
# source venv/bin/activate  # macOS/Linux

# Install dependencies
pip install flask requests markupsafe
```

---

## 🔑 Environment Variables

Create a `.env` file in the project root (or set these in your hosting environment):

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase project URL (e.g. `https://xxx.supabase.co`) |
| `SUPABASE_SERVICE_KEY` | ✅ | Supabase service role key (bypasses RLS) |
| `SMTP_HOST` | ✅ | SMTP hostname (default: `smtp.gmail.com`) |
| `SMTP_PORT` | ✅ | SMTP port (default: `587`) |
| `SMTP_USER` | ✅ | Gmail address used to send email |
| `SMTP_PASSWORD` | ✅ | Gmail App Password |
| `SENDER_EMAIL` | ✅ | From address shown in sent emails |
| `DEVELOPER_EMAIL` | ✅ | IT team inbox for issue reports |
| `APPROVER_EMAIL` | ✅ | Email address that receives access approval requests |
| `GATEWAY_BASE_URL` | ✅ | Public URL of this portal (e.g. `https://gateway.rgmcgroup.com`) — used in email links |
| `IT_BOT_URL` | optional | Base URL of the IT bot webhook server |
| `IT_BOT_API_KEY` | optional | API key sent as `x-api-key` header to IT bot |

Load them at runtime:
```bash
# Windows PowerShell
Get-Content .env | ForEach-Object {
  $name, $value = $_ -split '=', 2
  [System.Environment]::SetEnvironmentVariable($name, $value)
}

# or use python-dotenv
pip install python-dotenv
# add at top of app.py: from dotenv import load_dotenv; load_dotenv()
```

---

## ▶️ Running the App

```bash
# Development
flask --app app run --debug

# Production (gunicorn)
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:8000 app:app

# Production (waitress — Windows)
pip install waitress
waitress-serve --port=8000 app:app
```

---

## 🔌 API Endpoints

### 🔓 Public (no auth required)

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | System launcher HTML |
| `GET` | `/report-issue` | Report issue form HTML |
| `GET` | `/helpdesk` | IT helpdesk form HTML |
| `GET` | `/general-helpdesk` | General helpdesk form HTML |
| `GET` | `/admin/issues/<id>` | Public issue detail page HTML |
| `POST` | `/api/issues` | Submit freeform issue report |
| `POST` | `/api/helpdesk` | Submit structured IT helpdesk ticket |
| `POST` | `/api/general-helpdesk` | Submit general (non-IT) helpdesk ticket |
| `GET` | `/api/health` | Aggregate health check for all configured APIs |
| `GET` | `/api/companies` | List all companies |
| `GET` | `/api/departments` | List active departments |
| `GET` | `/api/helpdesk/categories` | IT helpdesk categories (group=IT) |
| `GET` | `/api/helpdesk/subcategories?category=<name>` | Subcategories or systems for a category |
| `GET` | `/api/helpdesk/request-types?category=<name>` | Request types for a category |
| `GET` | `/api/general-helpdesk/categories` | Non-IT helpdesk categories |
| `GET` | `/api/general-helpdesk/request-types?category=<name>` | Request types for non-IT category |
| `GET` | `/api/systems/by-tag?tag=<tag>` | Systems matching a tag |
| `GET` | `/api/public/issues/<id>` | Public issue data (ticket, status, resolution) |
| `GET` | `/api/public/issues/<id>/confirm-fix` | Reporter confirms fix (redirects) |
| `POST` | `/api/public/issues/<id>/still-having-issues` | Reporter flags issue not resolved |
| `GET` | `/api/public/dev-items/<id>` | Dev item status (for issue detail page) |
| `GET` | `/api/public/tasks/<id>` | IT task status |
| `GET` | `/api/public/user-tasks/<id>` | User task status |
| `GET` | `/api/actions` | List active resolution action types |
| `POST` | `/api/upload/resolution` | Upload resolution screenshot (image, max 5 MB) |
| `POST` | `/verify-username` | Verify username and return user profile + roles |
| `POST` | `/access-request` | Submit new access request |
| `POST` | `/access-request/additional` | Request additional system access |
| `GET` | `/access/approve/<token>` | Admin email-link approval |
| `GET` | `/access/reject/<token>` | Admin email-link rejection |

**POST `/api/issues` payload (form-data):**
```
employee_name, company_name, viber_number, email, department,
site_name, description, title?, error_code?, user_payload?,
request_to_department_id?, attachments[] (up to 5 files)
```

**POST `/api/helpdesk` payload (form-data):**
```
employee_name, email, viber_number, company_name, department,
ticket_type, request_category, request_subcategory?, request_type_name?,
business_impact?, urgency?, priority?, title?, anydesk_id?,
description, request_to_department_id?, attachments[] (up to 5 files)
```

**POST `/api/public/issues/<id>/still-having-issues` payload (JSON):**
```json
{
  "issue_description": "Description of the current problem",
  "confirm_steps": "Steps taken to verify the fix"
}
```

---

### 🔒 Admin (requires `X-Gateway-Username` with `is_admin = true`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin` | Admin panel HTML |
| `GET` | `/api/admin/requests` | List access requests (filterable by `?status=`) |
| `POST` | `/api/admin/requests/<id>/approve` | Approve an access request |
| `POST` | `/api/admin/requests/<id>/reject` | Reject with optional remarks |
| `GET` | `/api/admin/users` | List all users |
| `POST` | `/api/admin/users` | Create a user manually |
| `GET` | `/api/admin/users/search?q=<query>` | Search access requests by name |
| `PATCH` | `/api/admin/users/<username>` | Update user roles/profile |
| `DELETE` | `/api/admin/users/<username>` | Delete a user |
| `GET` | `/api/admin/issues` | List all issues (full `SELECT *`) |
| `PATCH` | `/api/admin/issues/<id>` | Update issue (status, assignee, resolution) |
| `POST` | `/api/admin/issues/<id>/promote` | Promote to dev item (optional `assigned_to`) |
| `POST` | `/api/admin/issues/<id>/promote-task` | Promote to IT task |
| `POST` | `/api/admin/issues/<id>/promote-user-task` | Route to department via user task |
| `POST` | `/api/admin/issues/<id>/link` | Link to issue/task/dev item; or mark duplicate |
| `GET` | `/api/admin/issues/search?q=<query>` | Full-text search across ticket, title, description |
| `GET` | `/api/admin/common-issues` | Analytics by system + category with global stats |
| `GET` | `/api/admin/linked/dev-item/<id>` | Fetch dev item linked from an issue |
| `GET` | `/api/admin/linked/task/<id>` | Fetch task linked from an issue |
| `GET` | `/api/admin/linked/user-task/<id>` | Fetch user task linked from an issue |
| `GET` | `/api/admin/systems` | List all systems |
| `POST` | `/api/admin/systems` | Create a system |
| `PATCH` | `/api/admin/systems/<id>` | Update a system |
| `DELETE` | `/api/admin/systems/<id>` | Delete a system |
| `GET` | `/api/admin/systems/<id>/ping` | Live HTTP ping a system's primary URL |
| `POST` | `/api/admin/systems/<id>/upload` | Upload Windows launcher or manifest file |
| `GET` | `/api/admin/dev-performance` | Developer performance (items, tasks, issues per dev) |
| `GET/POST` | `/api/admin/config/companies` | Company CRUD |
| `PATCH/DELETE` | `/api/admin/config/companies/<code>` | |
| `GET/POST` | `/api/admin/config/departments` | Department CRUD |
| `PATCH/DELETE` | `/api/admin/config/departments/<id>` | |
| `GET/POST` | `/api/admin/config/brands` | Brand CRUD |
| `PATCH/DELETE` | `/api/admin/config/brands/<code>` | |
| `GET/POST` | `/api/admin/config/request-categories` | Request category CRUD |
| `PATCH/DELETE` | `/api/admin/config/request-categories/<id>` | |
| `GET/POST` | `/api/admin/config/request-types` | Request type CRUD |
| `PATCH/DELETE` | `/api/admin/config/request-types/<id>` | |
| `GET/POST` | `/api/admin/config/non-software-items` | Non-software helpdesk item CRUD |
| `PATCH/DELETE` | `/api/admin/config/non-software-items/<id>` | |
| `GET/POST` | `/api/admin/config/actions` | Resolution action CRUD |
| `PATCH/DELETE` | `/api/admin/config/actions/<id>` | |
| `GET` | `/api/tasks` | List IT tasks |
| `POST` | `/api/tasks` | Create IT task |
| `PATCH` | `/api/tasks/<id>` | Update IT task status/fields |

---

### 👨‍💻 Developer (requires `is_developer = true`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/developer` | Developer board HTML |
| `GET` | `/api/dev/items` | List all dev items (Kanban) |
| `POST` | `/api/dev/items` | Create a dev item |
| `PATCH` | `/api/dev/items/<id>` | Update item status, dates, resolution |

---

### 👤 User (requires `X-Gateway-Username` for valid user)

| Method | Path | Description |
|---|---|---|
| `GET` | `/workspace` | User workspace HTML |
| `GET` | `/api/user/issues/team` | Issues assigned to user's department or team members |
| `GET` | `/api/user/issues/mine` | Issues filed by this user (matched by email) |
| `GET` | `/api/user/issues/assigned` | Issues where `assigned_to = username` |
| `GET` | `/api/user/tasks` | User tasks for this user's department |
| `GET` | `/api/issues/<id>/activity` | Issue activity feed (comments + movement logs merged) |
| `POST` | `/api/issues/<id>/comments` | Post a comment |
| `GET` | `/profile` | Profile page HTML |
| `PATCH` | `/api/user/profile` | Update display name, avatar, Viber, AnyDesk ID |

---

## 🗄 Database Tables

| Table | Purpose |
|---|---|
| `users` | Registered portal users; roles: `is_admin`, `is_developer`, `is_management`, `is_department_head` |
| `access_requests` | Pending / approved / rejected access requests; each row has `approval_token` for email-click flow |
| `issues` | All tickets from report form, IT helpdesk, and general helpdesk |
| `issue_comments` | Per-issue comment thread |
| `dev_items` | Developer board Kanban cards |
| `dev_item_logs` | Status movement history for dev items |
| `tasks` | IT admin tasks (separate from dev items) |
| `user_tasks` | Non-IT department tasks promoted from issues |
| `task_item_logs` | Status movement history for user tasks |
| `task_activity_logs` | Notes and activity for user tasks |
| `systems` | Launchable systems with URL, category, tags, sort order, Windows launcher fields |
| `companies` | Company list for helpdesk forms |
| `departments` | Department list; `is_active` controls visibility in forms |
| `brands` | Brand catalog (`brand_code`, `brand_name`, `brand_initial`) |
| `request_category` | Helpdesk categories; `category_group` separates IT from General |
| `request_type` | Per-category request type options for helpdesk forms |
| `non_software_items` | Non-software subcategory options for helpdesk |
| `actions` | Resolution action catalog used when closing tickets/items |

**Key `issues` columns:**

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `ticket_number` | text | Human-readable ID (e.g. `TKT-0001`) |
| `title` | text | Optional short title |
| `description` | text | Full description; append blocks added on reopen |
| `status` | text | `open`, `in_progress`, `resolved`, `closed` |
| `priority` | text | `low`, `medium`, `high`, `critical` |
| `urgency` | text | `low`, `medium`, `high` |
| `from_helpdesk` | bool | True if submitted via structured helpdesk |
| `ticket_type` | text | `incident`, `service_request`, etc. |
| `request_category` | text | Category from helpdesk form |
| `confirmed_fix` | bool | True when reporter confirms resolution |
| `confirmed_fix_at` | timestamptz | When reporter confirmed the fix |
| `dev_item_id` | uuid | FK to `dev_items` (set by promote-to-dev-item) |
| `task_id` | uuid | FK to `tasks` (set by promote-to-task) |
| `user_task_id` | uuid | FK to `user_tasks` (set by promote-to-user-task) |
| `linked_issue_id` | uuid | FK to related/duplicate issue |
| `is_duplicate` | bool | Marked duplicate when linked |
| `error_code` | text | Optional error code from reporter |
| `user_payload` | text | Optional user-provided data payload |
| `anydesk_id` | text | AnyDesk remote support ID |
| `resolution_action_ids` | int[] | Array of action IDs from `actions` table |
| `resolution_attachment_urls` | text[] | Uploaded resolution screenshot URLs |
| `attachment_urls` | text[] | Reporter-uploaded file URLs |

---

## 🔐 Authentication Flow

```
1. User visits gateway → login modal shown
   username is stored in localStorage after successful verify

2. User types username → POST /verify-username
   → Gateway queries /users table (returns is_admin, is_developer, roles)
   → Falls back to /access_requests (for users not yet in users table)
   → On success: username + full_name + roles stored in localStorage

3. Every subsequent API call sends:
   → Header: X-Gateway-Username: <username>

4. Admin endpoints call _require_admin():
   → Reads X-Gateway-Username header
   → Queries /users WHERE username = ? and checks is_admin = true
   → Returns (username, None) on success or (None, (error, 401/403)) on failure

5. Developer endpoints call _require_developer() (is_developer = true)
   Dept-head endpoints call _require_dept_head() (is_department_head = true)

6. New users go through access request flow:
   a. Employee submits /access-request form
   b. Approval email sent to APPROVER_EMAIL with approve/reject links
   c. Admin clicks /access/approve/<token>
   d. Gateway creates entry in /users table
      (username auto-generated: firstname.lastname, then .lastname2, .lastname3 etc.)
   e. Welcome email sent to employee with their assigned username
```

> ⚠️ Auth is username-only with no password or session token. Appropriate for an internal intranet deployment with network-level access control. Do not expose to the public internet without additional authentication.

---

## 🤖 IT Bot Notifications

When `IT_BOT_URL` and `IT_BOT_API_KEY` are configured, the gateway fires webhooks to a separate IT bot service. All calls are fire-and-forget — failures are logged as warnings and never surface to users.

**Ticket created** — fires on any new issue (report form, IT helpdesk, general helpdesk):
```json
POST {IT_BOT_URL}/api/notify/ticket-created
{
  "event": "ticket.created",
  "ticket": { /* full issue row */ }
}
```

**Ticket updated** — fires when an admin changes status, assignee, or resolution fields:
```json
POST {IT_BOT_URL}/api/notify/ticket-updated
{
  "event": "ticket.updated",
  "ticket": { /* issue row with new values applied */ },
  "changes": {
    "status":      { "from": "open",  "to": "resolved" },
    "assigned_to": { "from": null,    "to": "jdoe" }
  }
}
```

---

## 📧 Email Notifications

| Trigger | Recipients | Function |
|---|---|---|
| New freeform report | IT team (`DEVELOPER_EMAIL`) | `send_report_email` |
| New IT helpdesk ticket | IT team + reporter | `send_helpdesk_email` + `send_helpdesk_confirmation_email` |
| New general helpdesk ticket | IT team + reporter | same as above |
| Issue resolved | Reporter (email on issue) | `send_issue_resolved_email` |
| Issue assigned to IT staff | Assigned IT staff | `send_issue_assigned_email` |
| Access request submitted | Approver (`APPROVER_EMAIL`) | `send_approval_request_email` |
| Access request approved | Employee | `send_access_granted_email` |
| Access request rejected | Employee | `send_access_rejected_email` |
| Admin role granted | New admin | `send_admin_granted_email` |
| Task status changed | Relevant party | `send_task_status_email` |

All emails are HTML with RGMC dark gradient header and structured data tables. Reporter attachments are forwarded inline.

---

## 🔄 Issue Lifecycle

```
Reporter submits form
      |
      v
Issue created (status: open, ticket_number: TKT-XXXX)
      +--- IT bot: ticket.created
      +--- Email to IT team
      +--- Confirmation email to reporter
      |
      v
Admin reviews and assigns (assigned_to set)
      +--- IT bot: ticket.updated (assigned_to changed)
      +--- Email to assigned IT staff
      |
      v
Admin resolves (status: resolved | closed)
      +--- resolved_at set automatically
      +--- IT bot: ticket.updated (status changed)
      +--- Resolution email to reporter (notes + actions + screenshots)
      |
      v
Reporter receives email → clicks confirm link
      |
      +-- [Yes, It's Fixed]
      |       confirmed_fix = true, confirmed_fix_at = now
      |       → Green banner on issue page (?confirmed=1)
      |
      +-- [Still Having Issues] — fills modal:
              issue_description + confirm_steps
              → Appended to description as labeled block
              → status = open, confirmed_fix = false
              → Orange reopened banner (?reopened=1)
              → Issue back in open queue
```

**Promotion paths from an issue:**
```
Issue --[promote]--> Dev Item     dev_items; issue.dev_item_id set; status → in_progress
Issue --[promote]--> IT Task      tasks; issue.task_id set; status → in_progress
Issue --[promote]--> User Task    user_tasks; issue.user_task_id set; status → in_progress
Issue --[link duplicate]--> auto-resolved  is_duplicate=true; resolution_notes set; email sent
```

---

## 🎨 Brand / Design Tokens

All tokens live in `static/css/variables.css`. Fonts loaded from Google Fonts.

| Token | Value | Use |
|---|---|---|
| `--gold` | `#C4972A` | Primary brand accent — borders, buttons, section headings |
| `--gold-light` | `#D4A83C` | Hover states |
| `--gold-dim` | `rgba(196,151,42,0.12)` | Subtle gold backgrounds |
| `--bg` | `#080604` | Page background (near-black, warm tint) |
| `--bg-surface` | `#0F0C07` | Surface above page background |
| `--bg-card` | `#0D0A06` | Card / panel background |
| `--bg-modal` | `#0B0906` | Modal backdrop |
| `--text-primary` | `#EDE5D0` | Body text (warm cream) |
| `--text-secondary` | `#A89060` | Secondary / label text (muted gold) |
| `--text-muted` | `#5C4A28` | Disabled / dim text |
| `--success` | `#52A870` | Success state (green) |
| `--error` | `#D85858` | Error state (red) |
| `--warning` | `#D49632` | Warning / amber state |
| `--font-display` | `'Playfair Display'` | Page titles and major headings |
| `--font-ui` | `'Plus Jakarta Sans'` | All UI labels, buttons, body copy |

---

## 📄 License

Private — all rights reserved. Internal use by RGMC Group only.
