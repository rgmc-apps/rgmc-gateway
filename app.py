import os
import re
import time
import smtplib
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from markupsafe import Markup, escape as html_escape
import requests
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20MB max upload

EMAIL_CONFIG = {
    "smtp_host":       os.environ.get("SMTP_HOST", "smtp.gmail.com"),
    "smtp_port":       int(os.environ.get("SMTP_PORT", "587")),
    "smtp_user":       os.environ.get("SMTP_USER", ""),
    "smtp_password":   os.environ.get("SMTP_PASSWORD", ""),
    "sender_email":    os.environ.get("SENDER_EMAIL", ""),
    "developer_email": os.environ.get("DEVELOPER_EMAIL", ""),
}

SUPABASE_URL         = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
APPROVER_EMAIL       = os.environ.get("APPROVER_EMAIL", "")
GATEWAY_BASE_URL     = os.environ.get("GATEWAY_BASE_URL", "")

# Fallback site list used when the systems table is empty or DB is unreachable.
SITES_FALLBACK = [
    {
        "id": "travel-expense",
        "name": "RGMC Travel And Expense Web",
        "category": "RGMC",
        "primary_url": "https://rgmc-portal-935246372408.asia-southeast1.run.app/login?returnUrl=%2F",
        "primary_label": "Primary",
        "backup_url": "http://portal.rgmcgroup.com:7171/",
        "backup_label": "Backup",
    },
    {
        "id": "creatives",
        "name": "RGMC Creatives",
        "category": "RGMC",
        "primary_url": "https://rgmccreatives-935246372408.asia-southeast1.run.app/",
        "primary_label": "Primary",
        "backup_url": "http://portal.rgmcgroup.com:6060/",
        "backup_label": "Backup",
    },
    {
        "id": "production",
        "name": "RGMC Production",
        "category": "RGMC",
        "primary_url": "https://rgmc-production-935246372408.asia-southeast1.run.app",
        "primary_label": "Open",
        "backup_url": "http://portal.rgmcgroup.com:8080/login?returnUrl=%2F",
        "backup_label": "Backup",
    },
    {
        "id": "garment-attributes",
        "name": "RGMC Garment Attributes Checker AI",
        "category": "RGMC",
        "primary_url": "https://rgmc-attribute-checker-ai-935246372408.us-central1.run.app/",
        "primary_label": "Open",
        "backup_url": None,
        "backup_label": None,
    },
    {
        "id": "inventory-app",
        "name": "RGMC Inventory Mobile App",
        "category": "RGMC",
        "primary_url": "https://drive.google.com/drive/folders/1uJxDnvHUz_s9qd6l0vs1tmmkoTMp8sFy?usp=drive_link",
        "primary_label": "Download APK",
        "backup_url": None,
        "backup_label": None,
    },
    {
        "id": "rgmc-consignment-app",
        "name": "RGMC Consignment Web App",
        "category": "RGMC",
        "primary_url": "https://rgmc-consignment-webapp-935246372408.asia-southeast1.run.app/",
        "primary_label": "Open",
        "backup_url": None,
        "backup_label": None,
    },
    {
        "id": "sbic-po-uploader",
        "name": "SBIC PO Uploader",
        "category": "SBIC",
        "primary_url": "https://po-uploader-935246372408.us-central1.run.app/",
        "primary_label": "Open",
        "backup_url": None,
        "backup_label": None,
    },
    {
        "id": "sbic-invoice-separator",
        "name": "SBIC Invoice Separator",
        "category": "SBIC",
        "primary_url": "https://sbic-invoice-splitter-935246372408.europe-west1.run.app/",
        "primary_label": "Open",
        "backup_url": None,
        "backup_label": None,
    },
    {
        "id": "sbic-ra-upload",
        "name": "SBIC RA Upload",
        "category": "SBIC",
        "primary_url": "https://ra-uploader-935246372408.us-central1.run.app/",
        "primary_label": "Open",
        "backup_url": None,
        "backup_label": None,
    },
    {
        "id": "nav-keywest",
        "name": "Keywest",
        "category": "NAV Sites",
        "primary_url": "http://portal.rgmcgroup.com:8088/KEYWEST",
        "primary_label": "Open",
        "backup_url": None,
        "backup_label": None,
    },
    {
        "id": "nav-alvita-prod",
        "name": "Alvita Prod",
        "category": "NAV Sites",
        "primary_url": "http://portal.rgmcgroup.com:8088/ALVITA_PROD",
        "primary_label": "Open",
        "backup_url": None,
        "backup_label": None,
    },
    {
        "id": "nav-covent-runway-prod",
        "name": "Covent Runway Prod",
        "category": "NAV Sites",
        "primary_url": "http://portal.rgmcgroup.com:8088/COVENT_RUNWAY_PROD",
        "primary_label": "Open",
        "backup_url": None,
        "backup_label": None,
    },
    {
        "id": "nav-lgap-prod",
        "name": "LGAP Prod",
        "category": "NAV Sites",
        "primary_url": "http://portal.rgmcgroup.com:8088/LGAP_PROD",
        "primary_label": "Open",
        "backup_url": None,
        "backup_label": None,
    },
    {
        "id": "nav-manila-taste",
        "name": "Manila Taste",
        "category": "NAV Sites",
        "primary_url": "http://portal.rgmcgroup.com:8088/MANILA_TASTE",
        "primary_label": "Open",
        "backup_url": None,
        "backup_label": None,
    },
    {
        "id": "nav-richfield-live",
        "name": "Richfield Live",
        "category": "NAV Sites",
        "primary_url": "http://portal.rgmcgroup.com:8088/RICHFIELD_LIVE",
        "primary_label": "Open",
        "backup_url": None,
        "backup_label": None,
    },
    {
        "id": "nav-other-comp-prod",
        "name": "Other Comp Prod",
        "category": "NAV Sites",
        "primary_url": "http://portal.rgmcgroup.com:8088/OTHER_COMP_PROD/WebClient/",
        "primary_label": "Open",
        "backup_url": None,
        "backup_label": None,
    },
    {
        "id": "nav-suncoast-prod",
        "name": "Suncoast Prod",
        "category": "NAV Sites",
        "primary_url": "http://portal.rgmcgroup.com:8088/SUNCOAST_PROD",
        "primary_label": "Open",
        "backup_url": None,
        "backup_label": None,
    },
    {
        "id": "nav-usgi-prod-live",
        "name": "USGI Prod Live",
        "category": "NAV Sites",
        "primary_url": "http://portal.rgmcgroup.com:8088/USGI_PROD_LIVE",
        "primary_label": "Open",
        "backup_url": None,
        "backup_label": None,
    },
    {
        "id": "nav-usgi-lgap-uat",
        "name": "USGI LGAP UAT",
        "category": "NAV Sites",
        "primary_url": "http://portal.rgmcgroup.com:8088/USGI_LGAP_UAT",
        "primary_label": "Open",
        "backup_url": None,
        "backup_label": None,
    },
]

HEALTH_CHECKS = [
    {
        "id": "rgmc-gcp-api",
        "name": "RGMC GCP API",
        "base_url": "https://rgmc-gcp-api-935246372408.asia-southeast1.run.app",
        "endpoints": [
            {"path": "/checkdb", "label": "Database"},
            {"path": "/checkBigQuery", "label": "BigQuery"},
        ],
    },
    {
        "id": "rgmc-inventory-api",
        "name": "RGMC Inventory API",
        "base_url": "https://rgmcinventoryapi-935246372408.asia-southeast1.run.app",
        "endpoints": [
            {"path": "/api/Health/connections", "label": "Connections", "parse_connections": True},
        ],
    },
]


# ── Supabase helpers ──────────────────────────────────────────────────────────

def _sb_headers():
    return {
        "apikey":        SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=representation",
    }


def supabase_req(method, path, *, data=None, params=None, extra_headers=None):
    url = SUPABASE_URL.rstrip("/") + "/rest/v1" + path
    headers = _sb_headers()
    if extra_headers:
        headers.update(extra_headers)
    resp = requests.request(
        method, url, headers=headers, json=data, params=params, timeout=10
    )
    resp.raise_for_status()
    return resp.json() if resp.text else []


def generate_username(first_name: str, last_name: str) -> str:
    def clean(s):
        return re.sub(r"[^a-z0-9]", "", s.lower())

    base = clean(first_name[:1]) + clean(last_name.replace(" ", ""))
    base = base or "user"

    try:
        rows = supabase_req("GET", "/access_requests", params={
            "select": "username",
            "status": "eq.approved",
        })
        used = {r["username"] for r in rows if r.get("username")}
    except Exception:
        used = set()

    if base not in used:
        return base
    i = 1
    while f"{base}{i}" in used:
        i += 1
    return f"{base}{i}"


def _full_name(record: dict) -> str:
    mi = record.get("middle_initial", "").strip()
    parts = [record.get("first_name", ""), mi + "." if mi else "", record.get("last_name", "")]
    return " ".join(p for p in parts if p).replace("  ", " ").strip()


# ── Sites cache (DB-backed, falls back to SITES_FALLBACK) ────────────────────

_sites_cache: list | None = None
_sites_cache_ts: float = 0.0
_SITES_CACHE_TTL = 300  # seconds


def get_sites() -> list:
    global _sites_cache, _sites_cache_ts
    now = time.time()
    if _sites_cache is not None and (now - _sites_cache_ts) < _SITES_CACHE_TTL:
        return _sites_cache
    if SUPABASE_URL and SUPABASE_SERVICE_KEY:
        try:
            rows = supabase_req("GET", "/systems", params={
                "select": "id,name,category,primary_url,primary_label,backup_url,backup_label",
                "order":  "sort_order.asc,name.asc",
            })
            if rows:
                _sites_cache = rows
                _sites_cache_ts = now
                return _sites_cache
        except Exception as exc:
            app.logger.warning("Failed to load sites from DB, using fallback: %s", exc)
    _sites_cache = SITES_FALLBACK
    _sites_cache_ts = now
    return _sites_cache


def _invalidate_sites_cache():
    global _sites_cache
    _sites_cache = None


# ── Email helpers ─────────────────────────────────────────────────────────────

def _smtp_send(msg, to_addrs: list) -> bool:
    if not EMAIL_CONFIG["smtp_user"] or not EMAIL_CONFIG["smtp_password"]:
        app.logger.warning("SMTP credentials not configured — skipping send")
        return False
    try:
        with smtplib.SMTP(EMAIL_CONFIG["smtp_host"], EMAIL_CONFIG["smtp_port"]) as server:
            server.ehlo()
            server.starttls()
            server.login(EMAIL_CONFIG["smtp_user"], EMAIL_CONFIG["smtp_password"])
            server.sendmail(msg["From"], to_addrs, msg.as_string())
        return True
    except Exception as exc:
        app.logger.error("SMTP send error: %s", exc)
        return False


def send_report_email(form_data: dict, screenshots: list) -> bool:
    if not EMAIL_CONFIG["smtp_user"] or not EMAIL_CONFIG["smtp_password"]:
        app.logger.warning("Email credentials not set — skipping send")
        return False

    developer_email = EMAIL_CONFIG["developer_email"]
    if not developer_email:
        app.logger.warning("DEVELOPER_EMAIL not set — skipping send")
        return False

    from_addr = EMAIL_CONFIG["sender_email"] or EMAIL_CONFIG["smtp_user"]
    subject = f"[RGMC Problem Report] {form_data.get('site_name', 'Unknown System')}"

    description_html = form_data.get("description", "").replace("\n", "<br>")

    html_body = f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:0;background:#f8fafc;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
    <div style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);padding:24px;color:#fff;">
      <h2 style="margin:0;font-size:20px;">Problem Report</h2>
      <p style="margin:4px 0 0;opacity:.7;font-size:14px;">{form_data.get('site_name','')}</p>
    </div>
    <div style="padding:24px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr style="background:#f1f5f9;">
          <td style="padding:10px 14px;font-weight:600;font-size:13px;color:#64748b;width:160px;border-bottom:1px solid #e2e8f0;">EMPLOYEE NAME</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">{form_data.get('employee_name','')}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:600;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">COMPANY</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">{form_data.get('company_name','')}</td>
        </tr>
        <tr style="background:#f1f5f9;">
          <td style="padding:10px 14px;font-weight:600;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">DEPARTMENT</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">{form_data.get('department','')}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:600;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">EMAIL</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">{form_data.get('email','')}</td>
        </tr>
        <tr style="background:#f1f5f9;">
          <td style="padding:10px 14px;font-weight:600;font-size:13px;color:#64748b;">SYSTEM</td>
          <td style="padding:10px 14px;">{form_data.get('site_name','')}</td>
        </tr>
      </table>
      <h3 style="margin:0 0 10px;font-size:15px;color:#1e293b;">Problem Description</h3>
      <div style="background:#f8fafc;border-left:4px solid #2563eb;padding:14px 16px;border-radius:0 6px 6px 0;font-size:14px;line-height:1.6;">{description_html}</div>
      {'<p style="margin-top:16px;color:#64748b;font-size:13px;">&#128206; ' + str(len(screenshots)) + ' screenshot(s) attached.</p>' if screenshots else ''}
    </div>
    <div style="background:#f1f5f9;padding:12px 24px;font-size:12px;color:#94a3b8;">Sent via RGMC System Gateway</div>
  </div>
</body>
</html>"""

    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = developer_email
    msg["Reply-To"] = form_data.get("email", from_addr)
    msg.attach(MIMEText(html_body, "html"))

    for screenshot in screenshots:
        part = MIMEBase("application", "octet-stream")
        part.set_payload(screenshot["data"])
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f'attachment; filename="{screenshot["filename"]}"')
        msg.attach(part)

    try:
        with smtplib.SMTP(EMAIL_CONFIG["smtp_host"], EMAIL_CONFIG["smtp_port"]) as server:
            server.ehlo()
            server.starttls()
            server.login(EMAIL_CONFIG["smtp_user"], EMAIL_CONFIG["smtp_password"])
            server.sendmail(from_addr, [developer_email], msg.as_string())
        app.logger.info("Report email sent: %s", subject)
        return True
    except Exception as exc:
        app.logger.error("Email send failed: %s", exc)
        return False


def send_approval_request_email(record: dict, base_url: str, is_additional: bool = False) -> bool:
    """Send an email to the approver with one-click approve/reject links."""
    if not APPROVER_EMAIL:
        app.logger.warning("APPROVER_EMAIL not set — skipping approval email")
        return False

    from_addr = EMAIL_CONFIG["sender_email"] or EMAIL_CONFIG["smtp_user"]
    full_name = _full_name(record)
    token = record.get("approval_token", "")
    approve_url = f"{base_url}/access/approve/{token}"
    reject_url  = f"{base_url}/access/reject/{token}"
    systems_html = "".join(
        f'<li style="margin:5px 0;font-size:14px;color:#374151;">{s}</li>'
        for s in (record.get("systems") or [])
    )

    html = f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:0;background:#f8fafc;">
  <div style="max-width:620px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.12);">
    <div style="background:linear-gradient(135deg,#1a120a 0%,#0f0d08 100%);padding:28px 32px;border-bottom:3px solid #C4972A;">
      <h2 style="margin:0;font-size:22px;color:#C4972A;">{'Additional Access Request' if is_additional else 'Access Request'}</h2>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.65);font-size:14px;">RGMC Gateway &mdash; Action Required</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 22px;font-size:15px;color:#374151;">{'An existing user is requesting access to additional systems.' if is_additional else 'A new access request has been submitted and requires your approval.'}</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;border-radius:8px;overflow:hidden;">
        <tr style="background:#f8fafc;">
          <td style="padding:11px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;width:130px;border-bottom:1px solid #e2e8f0;">Full Name</td>
          <td style="padding:11px 16px;font-size:14px;color:#1e293b;border-bottom:1px solid #e2e8f0;font-weight:600;">{full_name}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #e2e8f0;">Company</td>
          <td style="padding:11px 16px;font-size:14px;color:#1e293b;border-bottom:1px solid #e2e8f0;">{record.get('company','')}</td>
        </tr>
        <tr style="background:#f8fafc;">
          <td style="padding:11px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #e2e8f0;">Department</td>
          <td style="padding:11px 16px;font-size:14px;color:#1e293b;border-bottom:1px solid #e2e8f0;">{record.get('department','')}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #e2e8f0;">Position</td>
          <td style="padding:11px 16px;font-size:14px;color:#1e293b;border-bottom:1px solid #e2e8f0;">{record.get('position','')}</td>
        </tr>
        <tr style="background:#f8fafc;">
          <td style="padding:11px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Email</td>
          <td style="padding:11px 16px;font-size:14px;color:#1e293b;">{record.get('email','')}</td>
        </tr>
      </table>
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Systems Requested</p>
      <ul style="margin:0 0 32px;padding:0 0 0 18px;line-height:1.9;">{systems_html}</ul>
      <table style="border-collapse:collapse;">
        <tr>
          <td style="padding-right:14px;">
            <a href="{approve_url}" style="display:inline-block;padding:14px 36px;background:#15803d;color:#fff;text-decoration:none;border-radius:7px;font-size:15px;font-weight:700;letter-spacing:.02em;">&#10003;&nbsp; Approve</a>
          </td>
          <td>
            <a href="{reject_url}" style="display:inline-block;padding:14px 36px;background:#dc2626;color:#fff;text-decoration:none;border-radius:7px;font-size:15px;font-weight:700;letter-spacing:.02em;">&#10007;&nbsp; Reject</a>
          </td>
        </tr>
      </table>
      <p style="margin:22px 0 0;font-size:12px;color:#94a3b8;line-height:1.8;">
        Clicking a button above will immediately process this request.<br>
        If buttons don't work, copy the URL into your browser:<br>
        <span style="color:#64748b;">Approve:</span> {approve_url}<br>
        <span style="color:#64748b;">Reject:</span> {reject_url}
      </p>
    </div>
    <div style="background:#f1f5f9;padding:14px 32px;font-size:12px;color:#94a3b8;">Sent via RGMC System Gateway</div>
  </div>
</body>
</html>"""

    msg = MIMEMultipart("alternative")
    label = "Additional Access Request" if is_additional else "Access Request"
    msg["Subject"]  = f"[{label}] {full_name} — RGMC Gateway"
    msg["From"]     = from_addr
    msg["To"]       = APPROVER_EMAIL
    msg["Reply-To"] = record.get("email", from_addr)
    msg.attach(MIMEText(html, "html"))
    return _smtp_send(msg, [APPROVER_EMAIL])


def send_access_granted_email(record: dict, is_additional: bool = False) -> bool:
    """Notify the user that their access has been approved."""
    user_email = record.get("email", "")
    if not user_email:
        return False

    from_addr = EMAIL_CONFIG["sender_email"] or EMAIL_CONFIG["smtp_user"]
    it_email  = EMAIL_CONFIG["developer_email"] or from_addr
    full_name = _full_name(record)
    username  = record.get("username", "—")
    systems_html = "".join(
        f'<li style="margin:5px 0;font-size:14px;color:#374151;">{s}</li>'
        for s in (record.get("systems") or [])
    )
    heading      = "Additional Access Approved" if is_additional else "Access Approved"
    intro        = (
        "Your request for additional system access has been <strong style='color:#15803d;'>approved</strong>. "
        "The following systems have been added to your account:"
        if is_additional else
        "Your access request for the <strong>RGMC Gateway</strong> has been "
        "<strong style='color:#15803d;'>approved</strong>. Your account has been created "
        "with the following credentials:"
    )
    username_block = "" if is_additional else f"""
      <div style="background:linear-gradient(135deg,#f8fafc,#f1f5f9);border:1px solid #e2e8f0;border-left:4px solid #C4972A;border-radius:8px;padding:22px 24px;margin-bottom:28px;text-align:center;">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.1em;">Your Username</p>
        <p style="margin:0;font-size:32px;font-weight:700;color:#1a120a;font-family:monospace;letter-spacing:.06em;">{username}</p>
        <p style="margin:10px 0 0;font-size:12px;color:#94a3b8;">Contact the IT department to set your password and complete account activation.</p>
      </div>"""
    systems_label = "Additional Systems Granted" if is_additional else "Systems Access Granted"

    html = f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:0;background:#f8fafc;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.12);">
    <div style="background:linear-gradient(135deg,#1a120a 0%,#0f0d08 100%);padding:28px 32px;border-bottom:3px solid #C4972A;">
      <h2 style="margin:0;font-size:22px;color:#C4972A;">{heading}</h2>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.65);font-size:14px;">RGMC System Gateway</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 16px;font-size:15px;">Hello <strong>{record.get('first_name','')}</strong>,</p>
      <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#374151;">{intro}</p>
      {username_block}
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">{systems_label}</p>
      <ul style="margin:0 0 28px;padding:0 0 0 18px;line-height:1.9;">{systems_html}</ul>
      <p style="margin:0;font-size:13px;color:#64748b;line-height:1.7;">For any questions or assistance, please contact the IT department at
        <a href="mailto:{it_email}" style="color:#C4972A;text-decoration:none;font-weight:600;">{it_email}</a>.
      </p>
    </div>
    <div style="background:#f1f5f9;padding:14px 32px;font-size:12px;color:#94a3b8;">RGMC Group &mdash; Internal Systems Portal</div>
  </div>
</body>
</html>"""

    subject = "Additional Systems Access Approved — RGMC Gateway" if is_additional else "Your RGMC Gateway Access Has Been Approved"
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = from_addr
    msg["To"]      = user_email
    msg.attach(MIMEText(html, "html"))
    return _smtp_send(msg, [user_email])


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html", sites=get_sites())


@app.route("/report", methods=["POST"])
def report():
    form_data = {
        "employee_name": request.form.get("employee_name", "").strip(),
        "company_name":  request.form.get("company_name", "").strip(),
        "department":    request.form.get("department", "").strip(),
        "email":         request.form.get("email", "").strip(),
        "site_name":     request.form.get("site_name", "").strip(),
        "description":   request.form.get("description", "").strip(),
    }

    missing = [k.replace("_", " ").title() for k, v in form_data.items() if not v]
    if missing:
        return jsonify({"success": False, "error": f"Missing: {', '.join(missing)}"}), 400

    screenshots = []
    for f in request.files.getlist("screenshots"):
        if f and f.filename:
            screenshots.append({"filename": f.filename, "data": f.read()})

    success = send_report_email(form_data, screenshots)
    if success:
        return jsonify({"success": True, "message": "Your report has been submitted. The IT team will be in touch shortly."})
    return jsonify({"success": False, "error": "Failed to send report. Please contact IT directly."}), 500


@app.route("/access-request", methods=["POST"])
def access_request():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return jsonify({"success": False, "error": "Access request system is not configured."}), 503

    data = {
        "first_name":     request.form.get("first_name", "").strip(),
        "last_name":      request.form.get("last_name", "").strip(),
        "middle_initial": request.form.get("middle_initial", "").strip(),
        "company":        request.form.get("company", "").strip(),
        "department":     request.form.get("department", "").strip(),
        "position":       request.form.get("position", "").strip(),
        "email":          request.form.get("email", "").strip(),
        "systems":        request.form.getlist("systems"),
    }

    required = ["first_name", "last_name", "company", "department", "position", "email"]
    missing = [f.replace("_", " ").title() for f in required if not data[f]]
    if missing:
        return jsonify({"success": False, "error": f"Required fields missing: {', '.join(missing)}"}), 400
    if not data["systems"]:
        return jsonify({"success": False, "error": "Please select at least one system."}), 400

    try:
        rows = supabase_req("POST", "/access_requests", data=data)
        record = rows[0] if rows else {}
    except Exception as exc:
        app.logger.error("Supabase insert failed: %s", exc)
        return jsonify({"success": False, "error": "Failed to save your request. Please try again."}), 500

    base_url = (GATEWAY_BASE_URL or request.host_url).rstrip("/")
    send_approval_request_email(record, base_url)

    return jsonify({
        "success": True,
        "message": "Your access request has been submitted. You will receive an email notification once it has been reviewed.",
    })


@app.route("/access-request/additional", methods=["POST"])
def access_request_additional():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return jsonify({"success": False, "error": "Access request system is not configured."}), 503

    username    = request.form.get("username", "").strip().lower()
    new_systems = request.form.getlist("systems")

    if not username:
        return jsonify({"success": False, "error": "Session expired. Please sign in again."}), 400
    if not new_systems:
        return jsonify({"success": False, "error": "Please select at least one system."}), 400

    try:
        rows = supabase_req("GET", "/access_requests", params={
            "username": f"eq.{username}",
            "status":   "eq.approved",
            "select":   "*",
            "order":    "created_at.asc",
            "limit":    "1",
        })
    except Exception as exc:
        app.logger.error("Supabase lookup failed: %s", exc)
        return jsonify({"success": False, "error": "Failed to retrieve your account. Please try again."}), 500

    if not rows:
        return jsonify({"success": False, "error": "Account not found. Please sign in again."}), 404

    existing = rows[0]

    new_data = {
        "first_name":     existing["first_name"],
        "last_name":      existing["last_name"],
        "middle_initial": existing.get("middle_initial", ""),
        "company":        existing["company"],
        "department":     existing["department"],
        "position":       existing["position"],
        "email":          existing["email"],
        "systems":        new_systems,
        "username":       username,
    }

    try:
        ins = supabase_req("POST", "/access_requests", data=new_data)
        record = ins[0] if ins else {}
    except Exception as exc:
        app.logger.error("Supabase insert failed: %s", exc)
        return jsonify({"success": False, "error": "Failed to save request. Please try again."}), 500

    base_url = (GATEWAY_BASE_URL or request.host_url).rstrip("/")
    send_approval_request_email(record, base_url, is_additional=True)

    return jsonify({
        "success": True,
        "message": "Your additional access request has been submitted. You will be notified once it has been approved.",
    })


@app.route("/verify-username", methods=["POST"])
def verify_username():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return jsonify({"success": False, "error": "Authentication system is not configured."}), 503

    username = request.form.get("username", "").strip().lower()
    if not username:
        return jsonify({"success": False, "error": "Please enter your username."}), 400

    # 1. Check users table first — preferred path, has is_admin flag
    try:
        user_rows = supabase_req("GET", "/users", params={
            "username": f"eq.{username}",
            "select":   "username,first_name,last_name,company,department,email,systems,is_admin",
        })
        if user_rows:
            u = user_rows[0]
            first = u.get("first_name", "")
            last  = u.get("last_name", "")
            return jsonify({
                "success":    True,
                "username":   u["username"],
                "first_name": first,
                "full_name":  f"{first} {last}".strip(),
                "company":    u.get("company", ""),
                "department": u.get("department", ""),
                "email":      u.get("email", ""),
                "systems":    u.get("systems", []),
                "is_admin":   u.get("is_admin", False),
            })
    except Exception as exc:
        app.logger.error("Supabase users lookup failed: %s", exc)

    # 2. Fallback: check access_requests for users not yet in users table
    try:
        rows = supabase_req("GET", "/access_requests", params={
            "username": f"eq.{username}",
            "status":   "eq.approved",
            "select":   "username,first_name,last_name,company,department,email,systems",
            "order":    "created_at.asc",
            "limit":    "1",
        })
    except Exception as exc:
        app.logger.error("Supabase verify-username failed: %s", exc)
        return jsonify({"success": False, "error": "Authentication failed. Please try again."}), 500

    if not rows:
        return jsonify({
            "success": False,
            "error": "Username not found or access not yet approved. Please request access.",
        }), 404

    record = rows[0]
    first = record.get("first_name", "")
    last  = record.get("last_name", "")
    return jsonify({
        "success":    True,
        "username":   record["username"],
        "first_name": first,
        "full_name":  f"{first} {last}".strip(),
        "company":    record.get("company", ""),
        "department": record.get("department", ""),
        "email":      record.get("email", ""),
        "systems":    record.get("systems", []),
        "is_admin":   False,
    })


@app.route("/access/approve/<token>")
def access_approve(token):
    if not SUPABASE_URL:
        return render_template("access_result.html", success=False,
                               title="Not Configured",
                               message=Markup("The access management system is not configured.")), 503
    try:
        rows = supabase_req("GET", "/access_requests",
                            params={"approval_token": f"eq.{token}", "select": "*"})
    except Exception as exc:
        app.logger.error("Supabase lookup failed: %s", exc)
        return render_template("access_result.html", success=False, title="Error",
                               message=Markup("Failed to retrieve the access request. Please try again.")), 500

    if not rows:
        return render_template("access_result.html", success=False, title="Not Found",
                               message=Markup("This access request link is invalid or has already been processed.")), 404

    record = rows[0]
    if record["status"] != "pending":
        processed = "approved" if record["status"] == "approved" else "rejected"
        return render_template("access_result.html", success=False, title="Already Processed",
                               message=Markup(f"This request has already been <strong>{processed}</strong>.")), 409

    # A pre-set username signals this is an additional-access request
    is_additional = bool(record.get("username"))

    if is_additional:
        username = record["username"]
        # Merge the new systems into the user's primary approved record
        try:
            primary = supabase_req("GET", "/access_requests", params={
                "username": f"eq.{username}",
                "status":   "eq.approved",
                "select":   "id,systems",
                "order":    "created_at.asc",
                "limit":    "1",
            })
            if primary:
                merged = list({*(primary[0].get("systems") or []), *(record.get("systems") or [])})
                supabase_req("PATCH", "/access_requests",
                             data={"systems": merged},
                             params={"id": f"eq.{primary[0]['id']}"})
        except Exception as exc:
            app.logger.error("System merge failed: %s", exc)
    else:
        username = generate_username(record["first_name"], record["last_name"])

    try:
        supabase_req("PATCH", "/access_requests", data={
            "status":       "approved",
            "username":     username,
            "processed_at": datetime.now(timezone.utc).isoformat(),
        }, params={"id": f"eq.{record['id']}"})
    except Exception as exc:
        app.logger.error("Supabase update failed: %s", exc)
        return render_template("access_result.html", success=False, title="Error",
                               message=Markup("Failed to approve the request. Please try again.")), 500

    record["username"] = username

    # Sync to users table
    if is_additional:
        try:
            user_rows = supabase_req("GET", "/users", params={
                "username": f"eq.{username}", "select": "systems",
            })
            if user_rows:
                current = set(user_rows[0].get("systems") or [])
                current.update(record.get("systems") or [])
                supabase_req("PATCH", "/users",
                             data={"systems": list(current)},
                             params={"username": f"eq.{username}"})
        except Exception as exc:
            app.logger.error("Users systems sync failed: %s", exc)
    else:
        try:
            supabase_req("POST", "/users", data={
                "username":       username,
                "first_name":     record.get("first_name", ""),
                "last_name":      record.get("last_name", ""),
                "middle_initial": record.get("middle_initial", ""),
                "company":        record.get("company", ""),
                "department":     record.get("department", ""),
                "position":       record.get("position", ""),
                "email":          record.get("email", ""),
                "systems":        record.get("systems", []),
            }, extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
        except Exception as exc:
            app.logger.error("Users upsert failed: %s", exc)

    send_access_granted_email(record, is_additional=is_additional)

    full_name = _full_name(record)
    if is_additional:
        new_systems = html_escape(", ".join(record.get("systems") or []))
        msg = Markup(
            f"Additional access for <strong>{html_escape(full_name)}</strong> has been approved.<br><br>"
            f"Systems added: <strong>{new_systems}</strong><br>"
            f"A notification email has been sent to <strong>{html_escape(record['email'])}</strong>."
        )
    else:
        msg = Markup(
            f"Access for <strong>{html_escape(full_name)}</strong> has been approved.<br><br>"
            f"Username <strong>{html_escape(username)}</strong> has been assigned.<br>"
            f"A confirmation email has been sent to <strong>{html_escape(record['email'])}</strong>."
        )
    return render_template("access_result.html", success=True, title="Access Approved", message=msg)


@app.route("/access/reject/<token>")
def access_reject(token):
    if not SUPABASE_URL:
        return render_template("access_result.html", success=False,
                               title="Not Configured",
                               message=Markup("The access management system is not configured.")), 503
    try:
        rows = supabase_req("GET", "/access_requests",
                            params={"approval_token": f"eq.{token}", "select": "*"})
    except Exception as exc:
        app.logger.error("Supabase lookup failed: %s", exc)
        return render_template("access_result.html", success=False, title="Error",
                               message=Markup("Failed to retrieve the access request. Please try again.")), 500

    if not rows:
        return render_template("access_result.html", success=False, title="Not Found",
                               message=Markup("This access request link is invalid or has already been processed.")), 404

    record = rows[0]
    if record["status"] != "pending":
        processed = "approved" if record["status"] == "approved" else "rejected"
        return render_template("access_result.html", success=False, title="Already Processed",
                               message=Markup(f"This request has already been <strong>{processed}</strong>.")), 409

    try:
        supabase_req("PATCH", "/access_requests", data={
            "status":       "rejected",
            "processed_at": datetime.now(timezone.utc).isoformat(),
        }, params={"id": f"eq.{record['id']}"})
    except Exception as exc:
        app.logger.error("Supabase update failed: %s", exc)
        return render_template("access_result.html", success=False, title="Error",
                               message=Markup("Failed to reject the request. Please try again.")), 500

    full_name = _full_name(record)
    return render_template("access_result.html", success=False, title="Request Rejected",
                           message=Markup(
                               f"The access request for <strong>{html_escape(full_name)}</strong> has been "
                               f"<strong style='color:#dc2626;'>rejected</strong>."
                           ))


@app.route("/api/health")
def health_check():
    results = []
    for check in HEALTH_CHECKS:
        api_result = {"id": check["id"], "name": check["name"], "endpoints": []}
        for ep in check["endpoints"]:
            url = check["base_url"] + ep["path"]
            try:
                resp = requests.get(url, timeout=10)
                if ep.get("parse_connections"):
                    try:
                        connections = resp.json()
                        all_ok = all(c.get("connected", False) for c in connections) if connections else False
                        api_result["endpoints"].append({
                            "path": ep["path"],
                            "label": ep["label"],
                            "status": "ok" if all_ok else "error",
                            "connections": connections,
                        })
                    except Exception:
                        api_result["endpoints"].append({
                            "path": ep["path"],
                            "label": ep["label"],
                            "status": "error",
                            "error": "Invalid JSON response",
                        })
                else:
                    try:
                        data = resp.json()
                    except Exception:
                        data = resp.text
                    api_result["endpoints"].append({
                        "path": ep["path"],
                        "label": ep["label"],
                        "status": "ok" if resp.status_code < 400 else "error",
                        "http_status": resp.status_code,
                        "response": data,
                    })
            except requests.Timeout:
                api_result["endpoints"].append({
                    "path": ep["path"],
                    "label": ep["label"],
                    "status": "timeout",
                    "error": "Request timed out",
                })
            except Exception as exc:
                api_result["endpoints"].append({
                    "path": ep["path"],
                    "label": ep["label"],
                    "status": "error",
                    "error": str(exc),
                })
        results.append(api_result)
    return jsonify(results)


# ── Admin ─────────────────────────────────────────────────────────────────────

@app.route("/admin")
def admin_page():
    return render_template("admin.html")


def _require_admin():
    """Returns (username, None) if valid admin, else (None, (error_dict, status_code))."""
    username = request.headers.get("X-Gateway-Username", "").strip().lower()
    if not username:
        return None, ({"error": "Authentication required"}, 401)
    try:
        rows = supabase_req("GET", "/users", params={
            "username": f"eq.{username}",
            "select":   "username,is_admin",
        })
    except Exception:
        return None, ({"error": "Authentication failed"}, 500)
    if not rows or not rows[0].get("is_admin"):
        return None, ({"error": "Admin access required"}, 403)
    return rows[0]["username"], None


@app.route("/api/admin/requests")
def admin_get_requests():
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]
    status = request.args.get("status")
    params = {"select": "*", "order": "created_at.desc"}
    if status:
        params["status"] = f"eq.{status}"
    try:
        rows = supabase_req("GET", "/access_requests", params=params)
        return jsonify(rows)
    except Exception as exc:
        app.logger.error("Admin requests fetch failed: %s", exc)
        return jsonify({"error": "Failed to fetch requests"}), 500


@app.route("/api/admin/users", methods=["GET"])
def admin_get_users():
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/users", params={
            "select": "username,first_name,last_name,company,department,position,email,systems,is_admin,created_at",
            "order":  "created_at.asc",
        })
        return jsonify(rows)
    except Exception as exc:
        app.logger.error("Admin users fetch failed: %s", exc)
        return jsonify({"error": "Failed to fetch users"}), 500


@app.route("/api/admin/users/<string:uname>", methods=["PATCH", "DELETE"])
def admin_update_user(uname):
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]

    if request.method == "DELETE":
        try:
            supabase_req("DELETE", "/users", params={"username": f"eq.{uname}"})
            return jsonify({"success": True})
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

    data = request.get_json(silent=True) or {}
    patch = {k: v for k, v in data.items() if k in {"is_admin", "systems"}}
    if not patch:
        return jsonify({"error": "No valid fields to update"}), 400
    try:
        supabase_req("PATCH", "/users", data=patch, params={"username": f"eq.{uname}"})
        return jsonify({"success": True})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/admin/systems", methods=["GET"])
def admin_get_systems():
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/systems", params={
            "select": "*",
            "order":  "sort_order.asc,name.asc",
        })
        return jsonify(rows)
    except Exception as exc:
        return jsonify({"error": "Failed to fetch systems"}), 500


@app.route("/api/admin/systems", methods=["POST"])
def admin_create_system():
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]
    data = request.get_json(silent=True) or {}
    required = ["id", "name", "category", "primary_url", "primary_label"]
    missing = [f for f in required if not str(data.get(f, "")).strip()]
    if missing:
        return jsonify({"error": f"Missing: {', '.join(missing)}"}), 400
    if "sort_order" not in data:
        data["sort_order"] = 999
    try:
        rows = supabase_req("POST", "/systems", data=data)
        _invalidate_sites_cache()
        return jsonify(rows[0] if rows else {}), 201
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/admin/systems/<string:system_id>", methods=["PATCH", "DELETE"])
def admin_update_system(system_id):
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]

    if request.method == "DELETE":
        try:
            supabase_req("DELETE", "/systems", params={"id": f"eq.{system_id}"})
            _invalidate_sites_cache()
            return jsonify({"success": True})
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

    data = request.get_json(silent=True) or {}
    allowed = {"name", "category", "primary_url", "primary_label", "backup_url", "backup_label", "sort_order"}
    patch = {k: v for k, v in data.items() if k in allowed}
    if not patch:
        return jsonify({"error": "No valid fields"}), 400
    try:
        supabase_req("PATCH", "/systems", data=patch, params={"id": f"eq.{system_id}"})
        _invalidate_sites_cache()
        return jsonify({"success": True})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port, debug=False)
