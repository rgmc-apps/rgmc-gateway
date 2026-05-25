import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
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

SITES = [
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
        "primary_url": "http://portal.rgmcgroup.com:8080/login?returnUrl=%2F",
        "primary_label": "Open",
        "backup_url": None,
        "backup_label": None,
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


@app.route("/")
def index():
    return render_template("index.html", sites=SITES)


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


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port, debug=False)
