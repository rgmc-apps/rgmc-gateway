import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders

from config import EMAIL_CONFIG, APPROVER_EMAIL, GATEWAY_BASE_URL

logger = logging.getLogger(__name__)


def _smtp_send(msg, to_addrs: list) -> bool:
    if not EMAIL_CONFIG["smtp_user"] or not EMAIL_CONFIG["smtp_password"]:
        logger.warning("SMTP credentials not configured — skipping send")
        return False
    try:
        with smtplib.SMTP(EMAIL_CONFIG["smtp_host"], EMAIL_CONFIG["smtp_port"]) as server:
            server.ehlo()
            server.starttls()
            server.login(EMAIL_CONFIG["smtp_user"], EMAIL_CONFIG["smtp_password"])
            server.sendmail(msg["From"], to_addrs, msg.as_string())
        return True
    except Exception as exc:
        logger.error("SMTP send error: %s", exc)
        return False


def send_report_email(form_data: dict, screenshots: list, ticket_number: str | None = None) -> bool:
    if not EMAIL_CONFIG["smtp_user"] or not EMAIL_CONFIG["smtp_password"]:
        logger.warning("Email credentials not set — skipping send")
        return False

    developer_email = EMAIL_CONFIG["developer_email"]
    if not developer_email:
        logger.warning("DEVELOPER_EMAIL not set — skipping send")
        return False

    from_addr = EMAIL_CONFIG["sender_email"] or EMAIL_CONFIG["smtp_user"]
    ticket_ref = f"{ticket_number} — " if ticket_number else ""
    subject   = f"[RGMC Problem Report] {ticket_ref}{form_data.get('site_name', 'Unknown System')}"
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
        {f'''<tr>
          <td style="padding:10px 14px;font-weight:600;font-size:13px;color:#64748b;width:160px;border-bottom:1px solid #e2e8f0;">TICKET NUMBER</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-weight:700;">{ticket_number}</td>
        </tr>''' if ticket_number else ''}
        <tr style="background:#f1f5f9;">
          <td style="padding:10px 14px;font-weight:600;font-size:13px;color:#64748b;width:160px;border-bottom:1px solid #e2e8f0;">EMPLOYEE NAME</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">{form_data.get('employee_name','')}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:600;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">COMPANY</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">{form_data.get('company_name','')}</td>
        </tr>
        <tr style="background:#f1f5f9;">
          <td style="padding:10px 14px;font-weight:600;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">VIBER NUMBER</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">{form_data.get('viber_number','')}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:600;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">EMAIL</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">{form_data.get('email','')}</td>
        </tr>
        {f'''<tr style="background:#f1f5f9;">
          <td style="padding:10px 14px;font-weight:600;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">DEPARTMENT</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">{form_data.get('department','')}</td>
        </tr>''' if form_data.get('department') else ''}
        <tr style="background:#f1f5f9;">
          <td style="padding:10px 14px;font-weight:600;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">SYSTEM</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">{form_data.get('site_name','')}</td>
        </tr>
        {f'''<tr>
          <td style="padding:10px 14px;font-weight:600;font-size:13px;color:#dc2626;">ERROR CODE</td>
          <td style="padding:10px 14px;font-weight:600;color:#dc2626;">{form_data.get("error_code","")}</td>
        </tr>''' if form_data.get('error_code') else ''}
      </table>
      {f'''<h3 style="margin:0 0 10px;font-size:15px;color:#1e293b;">User Input / Payload</h3>
      <div style="background:#f1f5f9;border-left:4px solid #64748b;padding:14px 16px;border-radius:0 6px 6px 0;font-size:13px;line-height:1.6;font-family:monospace;white-space:pre-wrap;word-break:break-all;margin-bottom:20px;">{form_data.get("user_payload","").replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")}</div>''' if form_data.get('user_payload') else ''}
      <h3 style="margin:0 0 10px;font-size:15px;color:#1e293b;">Problem Description</h3>
      <div style="background:#f8fafc;border-left:4px solid #2563eb;padding:14px 16px;border-radius:0 6px 6px 0;font-size:14px;line-height:1.6;">{description_html}</div>
      {'<p style="margin-top:16px;color:#64748b;font-size:13px;">&#128206; ' + str(len(screenshots)) + ' screenshot(s) attached.</p>' if screenshots else ''}
    </div>
    <div style="background:#f1f5f9;padding:12px 24px;font-size:12px;color:#94a3b8;">Sent via RGMC System Gateway</div>
  </div>
</body>
</html>"""

    msg = MIMEMultipart("mixed")
    msg["Subject"]  = subject
    msg["From"]     = from_addr
    msg["To"]       = developer_email
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
        logger.info("Report email sent: %s", subject)
        return True
    except Exception as exc:
        logger.error("Email send failed: %s", exc)
        return False


def send_approval_request_email(record: dict, base_url: str, is_additional: bool = False) -> bool:
    if not APPROVER_EMAIL:
        logger.warning("APPROVER_EMAIL not set — skipping approval email")
        return False

    from_addr    = EMAIL_CONFIG["sender_email"] or EMAIL_CONFIG["smtp_user"]
    full_name    = _full_name(record)
    token        = record.get("approval_token", "")
    approve_url  = f"{base_url}/access/approve/{token}"
    reject_url   = f"{base_url}/access/reject/{token}"
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
    label           = "Additional Access Request" if is_additional else "Access Request"
    msg["Subject"]  = f"[{label}] {full_name} — RGMC Gateway"
    msg["From"]     = from_addr
    msg["To"]       = APPROVER_EMAIL
    msg["Reply-To"] = record.get("email", from_addr)
    msg.attach(MIMEText(html, "html"))
    return _smtp_send(msg, [APPROVER_EMAIL])


def send_access_granted_email(record: dict, is_additional: bool = False) -> bool:
    user_email = record.get("email", "")
    if not user_email:
        return False

    from_addr    = EMAIL_CONFIG["sender_email"] or EMAIL_CONFIG["smtp_user"]
    it_email     = EMAIL_CONFIG["developer_email"] or from_addr
    full_name    = _full_name(record)
    username     = record.get("username", "—")
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

    subject     = "Additional Systems Access Approved — RGMC Gateway" if is_additional else "Your RGMC Gateway Access Has Been Approved"
    msg         = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = from_addr
    msg["To"]      = user_email
    msg.attach(MIMEText(html, "html"))
    return _smtp_send(msg, [user_email])


def send_access_rejected_email(record: dict, remarks: str = None) -> bool:
    user_email = record.get("email", "")
    if not user_email:
        return False

    from_addr    = EMAIL_CONFIG["sender_email"] or EMAIL_CONFIG["smtp_user"]
    it_email     = EMAIL_CONFIG["developer_email"] or from_addr
    systems_html = "".join(
        f'<li style="margin:5px 0;font-size:14px;color:#374151;">{s}</li>'
        for s in (record.get("systems") or [])
    )
    remarks_block = ""
    if remarks:
        remarks_html  = remarks.replace("\n", "<br>")
        remarks_block = f"""
      <div style="background:#fef2f2;border:1px solid rgba(220,38,38,.2);border-left:4px solid #dc2626;border-radius:0 6px 6px 0;padding:14px 16px;margin-bottom:24px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Reason</p>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">{remarks_html}</p>
      </div>"""

    html = f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:0;background:#f8fafc;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.12);">
    <div style="background:linear-gradient(135deg,#1a120a 0%,#0f0d08 100%);padding:28px 32px;border-bottom:3px solid #dc2626;">
      <h2 style="margin:0;font-size:22px;color:#f87171;">Access Request Not Approved</h2>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.65);font-size:14px;">RGMC System Gateway</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 16px;font-size:15px;">Hello <strong>{record.get('first_name','')}</strong>,</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#374151;">
        We regret to inform you that your access request for the <strong>RGMC Gateway</strong> has not been approved at this time.
      </p>
      {remarks_block}
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Systems Requested</p>
      <ul style="margin:0 0 28px;padding:0 0 0 18px;line-height:1.9;">{systems_html}</ul>
      <p style="margin:0;font-size:13px;color:#64748b;line-height:1.7;">
        If you believe this is in error or would like further clarification, please contact the IT department at
        <a href="mailto:{it_email}" style="color:#C4972A;text-decoration:none;font-weight:600;">{it_email}</a>.
      </p>
    </div>
    <div style="background:#f1f5f9;padding:14px 32px;font-size:12px;color:#94a3b8;">RGMC Group &mdash; Internal Systems Portal</div>
  </div>
</body>
</html>"""

    msg            = MIMEMultipart("alternative")
    msg["Subject"] = "Your RGMC Gateway Access Request — Not Approved"
    msg["From"]    = from_addr
    msg["To"]      = user_email
    msg.attach(MIMEText(html, "html"))
    return _smtp_send(msg, [user_email])


def send_admin_granted_email(user_record: dict) -> bool:
    user_email = user_record.get("email", "")
    if not user_email:
        return False

    from_addr  = EMAIL_CONFIG["sender_email"] or EMAIL_CONFIG["smtp_user"]
    first_name = user_record.get("first_name", "")
    username   = user_record.get("username", "")
    admin_url  = (GATEWAY_BASE_URL or "").rstrip("/") + "/admin"

    html = f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:0;background:#f8fafc;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.12);">
    <div style="background:linear-gradient(135deg,#1a120a 0%,#0f0d08 100%);padding:28px 32px;border-bottom:3px solid #C4972A;">
      <h2 style="margin:0;font-size:22px;color:#C4972A;">Admin Access Granted</h2>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.65);font-size:14px;">RGMC System Gateway</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 16px;font-size:15px;">Hello <strong>{first_name}</strong>,</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#374151;">
        You have been granted <strong>Admin access</strong> to the RGMC Gateway. You can now manage user
        requests, update user system access, and configure available systems from the Admin Panel.
      </p>
      <div style="background:linear-gradient(135deg,#f8fafc,#f1f5f9);border:1px solid #e2e8f0;border-left:4px solid #C4972A;border-radius:0 8px 8px 0;padding:18px 20px;margin-bottom:28px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.1em;">Your Username</p>
        <p style="margin:0;font-size:24px;font-weight:700;color:#1a120a;font-family:monospace;">{username}</p>
      </div>
      {'<p style="margin:0 0 20px;font-size:14px;color:#374151;">Access the Admin Panel here:</p><a href="' + admin_url + '" style="display:inline-block;padding:12px 28px;background:#C4972A;color:#0d0a06;text-decoration:none;border-radius:7px;font-size:14px;font-weight:700;">' + admin_url + '</a>' if admin_url.strip('/') else ''}
    </div>
    <div style="background:#f1f5f9;padding:14px 32px;font-size:12px;color:#94a3b8;">RGMC Group &mdash; Internal Systems Portal</div>
  </div>
</body>
</html>"""

    msg            = MIMEMultipart("alternative")
    msg["Subject"] = "Admin Access Granted — RGMC Gateway"
    msg["From"]    = from_addr
    msg["To"]      = user_email
    msg.attach(MIMEText(html, "html"))
    return _smtp_send(msg, [user_email])


def send_issue_resolved_email(
    issue: dict,
    resolution_notes: str,
    resolver_name: str,
    new_status: str,
    action_names: list | None = None,
    attachment_urls: list | None = None,
) -> bool:
    user_email = issue.get("email", "")
    if not user_email:
        logger.warning("Issue has no reporter email — skipping resolved notification")
        return False

    from_addr     = EMAIL_CONFIG["sender_email"] or EMAIL_CONFIG["smtp_user"]
    it_email      = EMAIL_CONFIG["developer_email"] or from_addr
    site_name     = issue.get("site_name", "Unknown System")
    employee_name = issue.get("employee_name", "")
    raw_desc      = issue.get("description", "")
    title         = issue.get("title") or raw_desc[:80] + ("…" if len(raw_desc) > 80 else "")

    def _he(s): return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    status_label = "Resolved" if new_status == "resolved" else "Closed"
    accent_color = "#15803d" if new_status == "resolved" else "#64748b"

    notes_block = ""
    if resolution_notes:
        notes_block = f"""
      <div style="margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Resolution Notes</p>
        <div style="background:#f0fdf4;border:1px solid rgba(21,128,61,.18);border-left:4px solid #15803d;border-radius:0 6px 6px 0;padding:14px 16px;font-size:14px;line-height:1.6;color:#374151;">{_he(resolution_notes).replace(chr(10), "<br>")}</div>
      </div>"""

    resolver_block = ""
    if resolver_name:
        resolver_block = f"""
      <p style="margin:0 0 24px;font-size:14px;color:#374151;">
        <span style="font-weight:700;color:#64748b;text-transform:uppercase;font-size:11px;letter-spacing:.06em;">Resolved by</span><br>
        <span style="font-size:15px;font-weight:600;color:#1e293b;">{_he(resolver_name)}</span>
      </p>"""

    actions_block = ""
    if action_names:
        pills = "".join(
            f'<span style="display:inline-block;margin:3px 4px 3px 0;padding:4px 12px;'
            f'background:#f0fdf4;border:1px solid rgba(21,128,61,.22);border-radius:20px;'
            f'font-size:13px;color:#15803d;font-weight:600;">&#10003;&nbsp;{_he(n)}</span>'
            for n in action_names
        )
        actions_block = f"""
      <div style="margin-bottom:24px;">
        <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Actions Taken</p>
        <div style="line-height:2;">{pills}</div>
      </div>"""

    attachments_block = ""
    valid_urls = [u for u in (attachment_urls or []) if u][:5]
    if valid_urls:
        thumbs = "".join(
            f'<a href="{_he(u)}" style="display:inline-block;margin:0 6px 6px 0;vertical-align:top;">'
            f'<img src="{_he(u)}" width="120" height="90" '
            f'style="display:block;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;" alt="attachment">'
            f'</a>'
            for u in valid_urls
        )
        attachments_block = f"""
      <div style="margin-bottom:24px;">
        <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Resolution Attachments</p>
        <div>{thumbs}</div>
      </div>"""

    desc_preview = _he(raw_desc)
    if len(desc_preview) > 300:
        desc_preview = desc_preview[:300] + "…"

    html = f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:0;background:#f8fafc;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.12);">
    <div style="background:linear-gradient(135deg,#1a120a 0%,#0f0d08 100%);padding:28px 32px;border-bottom:3px solid {accent_color};">
      <h2 style="margin:0;font-size:22px;color:#fff;">Issue {status_label}</h2>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.65);font-size:14px;">{_he(site_name)}</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 16px;font-size:15px;">Hello <strong>{_he(employee_name)}</strong>,</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#374151;">
        Your issue report for <strong>{_he(site_name)}</strong> has been marked as
        <strong style="color:{accent_color};">{status_label}</strong> by the IT team.
      </p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Your Original Report</p>
        <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#1e293b;">{_he(title)}</p>
        <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">{desc_preview}</p>
      </div>

      {notes_block}
      {resolver_block}
      {actions_block}
      {attachments_block}

      <p style="margin:0;font-size:13px;color:#64748b;line-height:1.7;">
        If the issue persists or you have further questions, please contact the IT department at
        <a href="mailto:{_he(it_email)}" style="color:#C4972A;text-decoration:none;font-weight:600;">{_he(it_email)}</a>.
      </p>
      {_confirm_fix_btn_html(issue.get("id"))}
    </div>
    <div style="background:#f1f5f9;padding:14px 32px;font-size:12px;color:#94a3b8;">RGMC Group &mdash; Internal Systems Portal</div>
  </div>
</body>
</html>"""

    msg            = MIMEMultipart("alternative")
    msg["Subject"] = f"Your Issue Has Been {status_label} — {site_name}"
    msg["From"]    = from_addr
    msg["To"]      = user_email
    msg.attach(MIMEText(html, "html"))
    return _smtp_send(msg, [user_email])


def send_issue_assigned_email(issue: dict, developer: dict, assigned_by_name: str) -> bool:
    dev_email = developer.get("email", "")
    if not dev_email:
        logger.warning("Developer has no email — skipping assignment notification")
        return False

    from_addr     = EMAIL_CONFIG["sender_email"] or EMAIL_CONFIG["smtp_user"]
    it_email      = EMAIL_CONFIG["developer_email"] or from_addr
    first_name    = developer.get("first_name") or developer.get("username", "")
    site_name     = issue.get("site_name", "Unknown System")
    raw_desc      = issue.get("description", "")
    title         = issue.get("title") or raw_desc[:80] + ("…" if len(raw_desc) > 80 else "")
    error_code    = issue.get("error_code") or ""
    description_html = raw_desc.replace("\n", "<br>")

    def _he(s): return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    ticket_number = issue.get("ticket_number") or ""
    ticket_row = f"""
        <tr style="background:#f8fafc;">
          <td style="padding:10px 14px;font-weight:600;font-size:13px;color:#64748b;width:140px;border-bottom:1px solid #e2e8f0;">TICKET</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-weight:700;">{_he(ticket_number)}</td>
        </tr>""" if ticket_number else ""

    error_code_row = f"""
        <tr>
          <td style="padding:10px 14px;font-weight:600;font-size:13px;color:#dc2626;border-bottom:1px solid #e2e8f0;">ERROR CODE</td>
          <td style="padding:10px 14px;font-weight:600;color:#dc2626;border-bottom:1px solid #e2e8f0;">{_he(error_code)}</td>
        </tr>""" if error_code else ""

    viber_row = f"""
        <tr style="background:#f8fafc;">
          <td style="padding:10px 14px;font-weight:600;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">VIBER / PHONE</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">{_he(issue.get('viber_number',''))}</td>
        </tr>""" if issue.get("viber_number") else ""

    html = f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:0;background:#f8fafc;">
  <div style="max-width:620px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.12);">
    <div style="background:linear-gradient(135deg,#1a120a 0%,#0f0d08 100%);padding:28px 32px;border-bottom:3px solid #C4972A;">
      <h2 style="margin:0;font-size:22px;color:#C4972A;">Issue Assigned to You</h2>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.65);font-size:14px;">{_he(site_name)}</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 16px;font-size:15px;">Hello <strong>{_he(first_name)}</strong>,</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#374151;">
        An issue has been assigned to you by <strong>{_he(assigned_by_name)}</strong>. Please review the details below.
      </p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;border-radius:8px;overflow:hidden;">
        {ticket_row}
        <tr style="background:#f8fafc;">
          <td style="padding:10px 14px;font-weight:600;font-size:13px;color:#64748b;width:140px;border-bottom:1px solid #e2e8f0;">SYSTEM</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-weight:600;">{_he(site_name)}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:600;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">REPORTER</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">{_he(issue.get('employee_name',''))}</td>
        </tr>
        <tr style="background:#f8fafc;">
          <td style="padding:10px 14px;font-weight:600;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">COMPANY</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">{_he(issue.get('company_name',''))}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:600;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">DEPARTMENT</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">{_he(issue.get('department',''))}</td>
        </tr>
        {viber_row}{error_code_row}
      </table>

      <div style="margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Issue</p>
        <p style="margin:0 0 10px;font-size:16px;font-weight:600;color:#1e293b;">{_he(title)}</p>
        <div style="background:#f8fafc;border-left:4px solid #C4972A;padding:14px 16px;border-radius:0 6px 6px 0;font-size:14px;line-height:1.6;color:#374151;">{description_html}</div>
      </div>

      <p style="margin:0;font-size:13px;color:#64748b;line-height:1.7;">
        For questions, contact the IT department at
        <a href="mailto:{_he(it_email)}" style="color:#C4972A;text-decoration:none;font-weight:600;">{_he(it_email)}</a>.
      </p>
      {_ticket_btn_html(issue.get("id"))}
    </div>
    <div style="background:#f1f5f9;padding:14px 32px;font-size:12px;color:#94a3b8;">RGMC Group &mdash; Internal Systems Portal</div>
  </div>
</body>
</html>"""

    msg            = MIMEMultipart("alternative")
    msg["Subject"] = f"[Issue Assigned] {title} — {site_name}"
    msg["From"]    = from_addr
    msg["To"]      = dev_email
    msg["Reply-To"] = issue.get("email", from_addr)
    msg.attach(MIMEText(html, "html"))
    return _smtp_send(msg, [dev_email])


def send_task_status_email(
    task: dict,
    issue: dict,
    old_status: str,
    new_status: str,
    changed_by: str,
    action_names: list | None = None,
    attachment_urls: list | None = None,
) -> bool:
    user_email = issue.get("email", "")
    if not user_email:
        return False

    from_addr  = EMAIL_CONFIG["sender_email"] or EMAIL_CONFIG["smtp_user"]
    site_name  = issue.get("site_name", "Unknown System")

    STATUS_LABELS = {
        "open":        "Open",
        "in_progress": "In Progress",
        "for_review":  "Under Review",
        "done":        "Done",
    }
    STATUS_COLORS = {
        "open":        "#6b7280",
        "in_progress": "#3b82f6",
        "for_review":  "#f59e0b",
        "done":        "#15803d",
    }

    new_label  = STATUS_LABELS.get(new_status, new_status)
    new_color  = STATUS_COLORS.get(new_status, "#64748b")
    task_name  = task.get("task_name", "")
    ticket_num = issue.get("ticket_number")

    def _he(s): return str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    ticket_row = f"""
        <tr style="background:#f8fafc;">
          <td style="padding:10px 14px;font-weight:600;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;width:140px;border-bottom:1px solid #e2e8f0;">Ticket</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-weight:700;">{_he(ticket_num)}</td>
        </tr>""" if ticket_num else ""

    # Resolution fields — only shown when status becomes done
    actions_block = ""
    if new_status == "done" and action_names:
        pills = "".join(
            f'<span style="display:inline-block;margin:3px 4px 3px 0;padding:4px 12px;'
            f'background:#f0fdf4;border:1px solid rgba(21,128,61,.22);border-radius:20px;'
            f'font-size:13px;color:#15803d;font-weight:600;">&#10003;&nbsp;{_he(n)}</span>'
            for n in action_names
        )
        actions_block = f"""
      <div style="margin-bottom:24px;">
        <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Actions Taken</p>
        <div style="line-height:2;">{pills}</div>
      </div>"""

    attachments_block = ""
    if new_status == "done":
        valid_urls = [u for u in (attachment_urls or []) if u][:5]
        if valid_urls:
            thumbs = "".join(
                f'<a href="{_he(u)}" style="display:inline-block;margin:0 6px 6px 0;vertical-align:top;">'
                f'<img src="{_he(u)}" width="120" height="90" '
                f'style="display:block;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;" alt="attachment">'
                f'</a>'
                for u in valid_urls
            )
            attachments_block = f"""
      <div style="margin-bottom:24px;">
        <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Resolution Attachments</p>
        <div>{thumbs}</div>
      </div>"""

    footer_note = (
        "Your issue has been resolved by the team. If the problem persists, please submit a new report."
        if new_status == "done"
        else "You will be notified again when the status changes further or when your issue is fully resolved."
    )

    html = f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:0;background:#f8fafc;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.12);">
    <div style="background:linear-gradient(135deg,#1a120a 0%,#0f0d08 100%);padding:28px 32px;border-bottom:3px solid {new_color};">
      <h2 style="margin:0;font-size:22px;color:#fff;">Task Update</h2>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.65);font-size:14px;">{_he(site_name)}</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#374151;">
        A task linked to your issue has been updated. Here are the latest details:
      </p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;border-radius:8px;overflow:hidden;">
        {ticket_row}
        <tr>
          <td style="padding:10px 14px;font-weight:600;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;width:140px;border-bottom:1px solid #e2e8f0;">Task</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-weight:600;">{_he(task_name)}</td>
        </tr>
        <tr style="background:#f8fafc;">
          <td style="padding:10px 14px;font-weight:600;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #e2e8f0;">New Status</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">
            <span style="display:inline-block;padding:3px 12px;background:{new_color};border-radius:20px;color:#fff;font-size:12px;font-weight:700;">{_he(new_label)}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:600;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Updated By</td>
          <td style="padding:10px 14px;">{_he(changed_by)}</td>
        </tr>
      </table>

      {actions_block}
      {attachments_block}

      <p style="margin:0;font-size:13px;color:#64748b;line-height:1.7;">{footer_note}</p>
      {_ticket_btn_html(issue.get("id"))}
    </div>
    <div style="background:#f1f5f9;padding:14px 32px;font-size:12px;color:#94a3b8;">RGMC Group &mdash; Internal Systems Portal</div>
  </div>
</body>
</html>"""

    subject = f"Task Update: {new_label} — {site_name}"
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = from_addr
    msg["To"]      = user_email
    msg.attach(MIMEText(html, "html"))
    return _smtp_send(msg, [user_email])


def _ticket_btn_html(issue_id: str | None) -> str:
    if not issue_id:
        return ""
    base = (GATEWAY_BASE_URL or "").rstrip("/")
    url  = f"{base}/admin/issues/{issue_id}"
    return (f'<div style="margin-top:24px;">'
            f'<a href="{url}" style="display:inline-block;padding:12px 28px;background:#C4972A;'
            f'color:#0d0a06;text-decoration:none;border-radius:7px;font-size:14px;font-weight:700;'
            f'letter-spacing:.02em;">View Ticket &rarr;</a></div>')


def _confirm_fix_btn_html(issue_id: str | None) -> str:
    if not issue_id:
        return ""
    base        = (GATEWAY_BASE_URL or "").rstrip("/")
    confirm_url = f"{base}/api/public/issues/{issue_id}/confirm-fix"
    ticket_url  = f"{base}/admin/issues/{issue_id}"
    return f"""
      <div style="margin-top:28px;padding:20px 24px;background:#f0fdf4;border:1px solid rgba(21,128,61,.18);border-top:3px solid #15803d;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.05em;">Was your issue resolved?</p>
        <p style="margin:0 0 16px;font-size:13px;color:#374151;line-height:1.6;">
          If the fix worked on your end, please confirm so our team knows the issue is fully resolved.
        </p>
        <table style="border-collapse:collapse;">
          <tr>
            <td style="padding-right:10px;">
              <a href="{confirm_url}" style="display:inline-block;padding:11px 24px;background:#15803d;color:#fff;text-decoration:none;border-radius:7px;font-size:14px;font-weight:700;letter-spacing:.02em;">&#10003;&nbsp; Yes, It&#39;s Fixed</a>
            </td>
            <td>
              <a href="{ticket_url}" style="display:inline-block;padding:11px 20px;background:#fff;color:#374151;text-decoration:none;border-radius:7px;font-size:13px;font-weight:600;border:1px solid #d1d5db;">View Ticket</a>
            </td>
          </tr>
        </table>
        <p style="margin:12px 0 0;font-size:11px;color:#94a3b8;">
          Still having issues? Contact IT at the email above.
        </p>
      </div>"""


_TICKET_TYPE_LABELS = {
    'service_request':  'Service Request',
    'incident_problem': 'Incident / Problem',
    'change_request':   'Change Request',
    'request':          'Request',
    'incident_report':  'Incident Report',
}
_IMPACT_LABELS = {
    'high':   'High — Company Wide',
    'medium': 'Medium — Department to Team Wide',
    'low':    'Low — Single Person / User',
}
_URGENCY_LABELS = {
    'high':   'High — Immediate',
    'medium': 'Medium — Needs Prompt Action',
    'low':    'Low — Can Wait',
}
_PRIORITY_LABELS = {
    'P1': 'P1 — Critical / Show Stopper',
    'P2': 'P2 — High Risk',
    'P3': 'P3 — Medium Risk',
    'P4': 'P4 — Low Risk',
}


def send_helpdesk_email(form_data: dict, ticket_number: str | None, attachments: list | None = None, issue_id: str | None = None) -> bool:
    developer_email = EMAIL_CONFIG["developer_email"]
    if not developer_email:
        logger.warning("DEVELOPER_EMAIL not set — skipping helpdesk email")
        return False

    from_addr  = EMAIL_CONFIG["sender_email"] or EMAIL_CONFIG["smtp_user"]
    ticket_ref = ticket_number or "—"
    tt_label   = _TICKET_TYPE_LABELS.get(form_data.get("ticket_type", ""), form_data.get("ticket_type", "—"))
    impact_lbl = _IMPACT_LABELS.get(form_data.get("business_impact", ""), form_data.get("business_impact", "—") or "—")
    urgency_lbl= _URGENCY_LABELS.get(form_data.get("urgency", ""), form_data.get("urgency", "—") or "—")
    priority_lbl = _PRIORITY_LABELS.get(form_data.get("priority", ""), form_data.get("priority", "—") or "—")
    desc_html  = (form_data.get("description") or "").replace("\n", "<br>")

    def _opt_row(label, value, shade=False):
        if not value:
            return ""
        bg = ' style="background:#f1f5f9;"' if shade else ''
        return (f'<tr{bg}>'
                f'<td style="padding:10px 14px;font-weight:600;font-size:13px;color:#64748b;width:180px;border-bottom:1px solid #e2e8f0;">{label}</td>'
                f'<td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">{value}</td>'
                f'</tr>')

    rows_html = (
        _opt_row("TICKET NUMBER", f'<strong style="font-family:monospace;">{ticket_ref}</strong>', shade=True) +
        _opt_row("TICKET TYPE",   tt_label) +
        _opt_row("NAME",          form_data.get("employee_name", ""), shade=True) +
        _opt_row("EMAIL",         form_data.get("email", "")) +
        _opt_row("VIBER / PHONE", form_data.get("viber_number", ""), shade=True) +
        _opt_row("COMPANY",       form_data.get("company_name", "")) +
        _opt_row("DEPARTMENT",    form_data.get("department", ""), shade=True) +
        _opt_row("ANYDESK ID",    form_data.get("anydesk_id", "")) +
        _opt_row("CATEGORY",      form_data.get("request_category", ""), shade=True) +
        _opt_row("SUB-CATEGORY",  form_data.get("request_subcategory", "")) +
        _opt_row("REQUEST TYPE",  form_data.get("request_type_name", ""), shade=True) +
        _opt_row("BUSINESS IMPACT", impact_lbl) +
        _opt_row("URGENCY",       urgency_lbl, shade=True) +
        _opt_row("PRIORITY",      priority_lbl)
    )

    title_block = ""
    if form_data.get("title"):
        title_block = f'<p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#1e293b;">{form_data["title"]}</p>'

    attach_note = ""
    if attachments:
        attach_note = f'<p style="margin-top:16px;color:#64748b;font-size:13px;">&#128206; {len(attachments)} attachment(s) included.</p>'

    html_body = f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:0;background:#f8fafc;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
    <div style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);padding:24px 28px;color:#fff;">
      <h2 style="margin:0;font-size:20px;">IT Helpdesk Ticket</h2>
      <p style="margin:4px 0 0;opacity:.7;font-size:14px;font-family:monospace;">{ticket_ref}</p>
    </div>
    <div style="padding:24px 28px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        {rows_html}
      </table>
      <h3 style="margin:0 0 8px;font-size:15px;color:#1e293b;">Description</h3>
      {title_block}
      <div style="background:#f8fafc;border-left:4px solid #2563eb;padding:14px 16px;border-radius:0 6px 6px 0;font-size:14px;line-height:1.6;">{desc_html}</div>
      {attach_note}
      {_ticket_btn_html(issue_id)}
    </div>
    <div style="background:#f1f5f9;padding:12px 28px;font-size:12px;color:#94a3b8;">Sent via RGMC IT Online Helpdesk</div>
  </div>
</body>
</html>"""

    msg = MIMEMultipart("mixed")
    msg["Subject"]  = f"[Helpdesk] {ticket_ref} — {tt_label}"
    msg["From"]     = from_addr
    msg["To"]       = developer_email
    msg["Reply-To"] = form_data.get("email", from_addr)
    msg.attach(MIMEText(html_body, "html"))

    for att in (attachments or []):
        part = MIMEBase("application", "octet-stream")
        part.set_payload(att["data"])
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f'attachment; filename="{att["filename"]}"')
        msg.attach(part)

    return _smtp_send(msg, [developer_email])


def send_helpdesk_confirmation_email(form_data: dict, ticket_number: str | None, issue_id: str | None = None) -> bool:
    user_email = form_data.get("email", "")
    if not user_email:
        logger.warning("Helpdesk submission has no reporter email — skipping confirmation")
        return False

    from_addr    = EMAIL_CONFIG["sender_email"] or EMAIL_CONFIG["smtp_user"]
    it_email     = EMAIL_CONFIG["developer_email"] or from_addr
    ticket_ref   = ticket_number or "—"
    first_name   = (form_data.get("employee_name") or "").split()[0] if form_data.get("employee_name") else "there"
    tt_label     = _TICKET_TYPE_LABELS.get(form_data.get("ticket_type", ""), form_data.get("ticket_type", "—"))
    priority_lbl = _PRIORITY_LABELS.get(form_data.get("priority", ""), form_data.get("priority") or "—")

    def _he(s): return str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def _opt_row(label, value, shade=False):
        if not value:
            return ""
        bg = ' style="background:#f1f5f9;"' if shade else ''
        return (f'<tr{bg}>'
                f'<td style="padding:9px 14px;font-weight:600;font-size:12px;color:#64748b;width:160px;border-bottom:1px solid #e2e8f0;">{label}</td>'
                f'<td style="padding:9px 14px;font-size:14px;border-bottom:1px solid #e2e8f0;">{_he(value)}</td>'
                f'</tr>')

    rows_html = (
        _opt_row("TICKET TYPE",  tt_label, shade=True) +
        _opt_row("COMPANY",      form_data.get("company_name", "")) +
        _opt_row("DEPARTMENT",   form_data.get("department", ""), shade=True) +
        _opt_row("CATEGORY",     form_data.get("request_category", "")) +
        _opt_row("SUB-CATEGORY", form_data.get("request_subcategory", ""), shade=True) +
        _opt_row("REQUEST TYPE", form_data.get("request_type_name", "")) +
        _opt_row("PRIORITY",     priority_lbl, shade=True)
    )

    desc_html  = _he(form_data.get("description") or "").replace("\n", "<br>")
    title_block = ""
    if form_data.get("title"):
        title_block = f'<p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#1e293b;">{_he(form_data["title"])}</p>'

    html = f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:0;background:#f8fafc;">
  <div style="max-width:620px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.12);">
    <div style="background:linear-gradient(135deg,#1a120a 0%,#0f0d08 100%);padding:28px 32px;border-bottom:3px solid #C4972A;">
      <h2 style="margin:0;font-size:22px;color:#C4972A;">Ticket Received</h2>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.65);font-size:14px;font-family:monospace;">{_he(ticket_ref)}</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 16px;font-size:15px;">Hello <strong>{_he(first_name)}</strong>,</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#374151;">
        Your IT helpdesk ticket has been <strong style="color:#15803d;">received</strong> and will be attended to shortly. Here is a summary of your submission:
      </p>

      <div style="background:linear-gradient(135deg,#f8fafc,#f1f5f9);border:1px solid #e2e8f0;border-left:4px solid #C4972A;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;text-align:center;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.1em;">Your Ticket Number</p>
        <p style="margin:0;font-size:28px;font-weight:700;color:#1a120a;font-family:monospace;letter-spacing:.06em;">{_he(ticket_ref)}</p>
        <p style="margin:8px 0 0;font-size:12px;color:#94a3b8;">Please keep this reference for follow-ups.</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        {rows_html}
      </table>

      <div style="margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Your Description</p>
        {title_block}
        <div style="background:#f8fafc;border-left:4px solid #2563eb;padding:14px 16px;border-radius:0 6px 6px 0;font-size:14px;line-height:1.6;color:#374151;">{desc_html}</div>
      </div>

      <p style="margin:0;font-size:13px;color:#64748b;line-height:1.7;">
        Our IT team will review your ticket and get back to you as soon as possible.
        For urgent concerns, you may reach us directly at
        <a href="mailto:{_he(it_email)}" style="color:#C4972A;text-decoration:none;font-weight:600;">{_he(it_email)}</a>.
      </p>
      {_ticket_btn_html(issue_id)}
    </div>
    <div style="background:#f1f5f9;padding:14px 32px;font-size:12px;color:#94a3b8;">RGMC Group &mdash; IT Online Helpdesk</div>
  </div>
</body>
</html>"""

    msg            = MIMEMultipart("alternative")
    msg["Subject"] = f"[Helpdesk] Ticket {ticket_ref} Received — RGMC IT"
    msg["From"]    = from_addr
    msg["To"]      = user_email
    msg.attach(MIMEText(html, "html"))
    return _smtp_send(msg, [user_email])


def _full_name(record: dict) -> str:
    mi    = record.get("middle_initial", "").strip()
    parts = [record.get("first_name", ""), mi + "." if mi else "", record.get("last_name", "")]
    return " ".join(p for p in parts if p).replace("  ", " ").strip()
