# Handoff

## Goal

Build and deploy a production-ready internal web portal called **RGMC Gateway** — a central hub for RGMC Group employees to access all internal systems, report problems, and monitor API health. The portal must run on **Google Cloud Run** via Docker.

**Acceptance criteria:**
- All 8 system links accessible with primary/backup buttons per site
- "Report a Problem" modal per site: collects Employee Name, Company Name, Department, Email, Problem Description, and Screenshots — sends an email with attachments to `DEVELOPER_EMAIL` env var
- Health check section showing live status of two APIs, auto-refreshing every 60 seconds
- Dockerfile builds and runs cleanly on Cloud Run
- UI uses the RGMC logo's gold color (`#C4972A`) with a dark luxury corporate theme

---

## Current State

**The codebase is complete and the design is fully applied. It has NOT been run or tested yet.** There is no `.env` file — only `.env.example`. The app has never been started locally or deployed to Cloud Run.

All 9 core files are written and internally consistent:

| File | Status |
|------|--------|
| `app.py` | ✅ Complete — Flask routes, email with attachments, health proxy |
| `requirements.txt` | ✅ flask 3.0.3, gunicorn 22.0.0, requests 2.32.3 |
| `Dockerfile` | ✅ Cloud Run ready, uses `$PORT` env var |
| `.env.example` | ✅ Documents all required env vars |
| `.gitignore` | ✅ |
| `.dockerignore` | ✅ |
| `templates/index.html` | ✅ Complete, uses Jinja2, loads Google Fonts |
| `static/style.css` | ✅ Full dark-gold theme, responsive |
| `static/script.js` | ✅ Modal logic, form submit, health fetch, auto-refresh |

**What works (by code review, not runtime test):**
- Flask routes: `GET /`, `POST /report`, `GET /api/health`
- Email: `smtplib` + `MIMEMultipart("mixed")` with screenshot attachments, sends to `DEVELOPER_EMAIL`
- Health check: proxies `/checkdb`, `/checkBigQuery` (HTTP-status based), and `/api/Health/connections` (parses `[{name, connected, error}]` array)
- UI: two-section systems grid (RGMC / SBIC), report modal, health cards, gold/dark theme

**Not yet done:**
- No local run / smoke test
- No Cloud Run deployment
- No real `.env` with credentials
- The `cloudbuild.yaml` from the reference project was NOT replicated (not requested)

---

## Files Actively Being Edited

- `C:\claude\rgmc-gateway\app.py` — created from scratch; Flask app with SITES list (8 entries), HEALTH_CHECKS list (2 APIs), `send_report_email()` using smtplib, three routes
- `C:\claude\rgmc-gateway\templates\index.html` — created then updated twice: (1) initial build, (2) header changed from text-logo to actual `<img>` tag using `logo.png`, (3) health section markup fixed to remove double `section-label` wrapper
- `C:\claude\rgmc-gateway\static\style.css` — created initially with a generic blue theme, then **fully replaced** with the dark-gold luxury corporate theme derived from the logo
- `C:\claude\rgmc-gateway\static\script.js` — created once, not modified since
- `C:\claude\rgmc-gateway\requirements.txt` — created once
- `C:\claude\rgmc-gateway\Dockerfile` — created once
- `C:\claude\rgmc-gateway\.env.example` — created once
- `C:\claude\rgmc-gateway\.gitignore` — created once
- `C:\claude\rgmc-gateway\.dockerignore` — created once

---

## Failed Attempts

No failed attempts in this session — all code was written fresh from scratch with no runtime errors encountered. The session was purely generative (no debugging required).

---

## Next Step

**Run the app locally to smoke-test all three routes:**

```powershell
cd C:\claude\rgmc-gateway

# 1. Create a real .env (copy example and fill in credentials)
Copy-Item .env.example .env
# Edit .env: set SMTP_USER, SMTP_PASSWORD, SENDER_EMAIL, DEVELOPER_EMAIL

# 2. Create venv and install
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 3. Load env and run
$env:SMTP_HOST="smtp.gmail.com"
$env:SMTP_PORT="587"
$env:SMTP_USER="your@gmail.com"
$env:SMTP_PASSWORD="your_app_password"
$env:DEVELOPER_EMAIL="it.arellanoerwin@gmail.com"
$env:PORT="8080"
python app.py
```

Then verify in browser at `http://localhost:8080`:
- Site cards render with correct links and category sections
- "Report Problem" modal opens and pre-fills system name
- Form submits and email arrives at `DEVELOPER_EMAIL` with attachments
- Health section fetches `/api/health` and renders status cards

---

## Context & Gotchas

**Email credentials:**
- The reference project (`C:\claude\sbic-manual-trigger-page`) uses Gmail App Password authentication (not plain password). The `.env.example` already reflects this. `SMTP_PASSWORD` must be a 16-character Gmail App Password, not the account password.
- If `DEVELOPER_EMAIL` is not set, the app logs a warning and skips sending (does not crash).

**Health check API response formats:**
- `/checkdb` and `/checkBigQuery` on the RGMC GCP API — response format is unknown; the code treats HTTP 200 as "OK" and displays the raw response body. Status is purely HTTP-status-code-driven.
- `/api/Health/connections` on the Inventory API — expected to return `[{name: string, connected: bool, error: string|null}]`. The code uses `c.get("connected") === true` check; if the API returns `"connected": "True"` (string) instead of bool, it will show as disconnected. Test this endpoint first.

**File upload limits:**
- `app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024` (20MB). JS limits to 5 files client-side but no server-side count limit.

**Cloud Run deployment:**
- Dockerfile uses `CMD exec gunicorn --bind :${PORT:-8080} --workers 1 --threads 8 --timeout 120 app:app`
- Cloud Run injects `PORT` automatically — no need to set it manually in env vars on Cloud Run
- All other env vars (`SMTP_*`, `DEVELOPER_EMAIL`) must be set in Cloud Run → Edit & Deploy → Variables & Secrets

**Design assets:**
- `static/logo.png` is already in the repo (1.3MB). The HTML loads it at `/static/logo.png` in the header as a white "stamp" box on the dark background. Logo has white background — this is intentional, looks like a premium badge.
- Google Fonts are loaded from CDN (`Playfair Display` + `DM Sans`). If deploying in an environment with no internet access, fonts will fall back to Georgia/system-sans gracefully via the CSS font-stack.

**Reference project:**
- Email pattern was sourced from `C:\claude\sbic-manual-trigger-page\app.py` — identical smtplib/STARTTLS approach, same env var naming convention.

**No `cloudbuild.yaml`:**
- The reference project had a `cloudbuild.yaml` for GCP Cloud Build CI/CD. This was not replicated because the user did not request it. If needed, copy from `C:\claude\sbic-manual-trigger-page\cloudbuild.yaml` and update the image name.
