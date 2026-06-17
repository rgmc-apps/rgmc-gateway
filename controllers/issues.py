import re
import requests
from flask import Blueprint, request, jsonify, current_app

from config import SUPABASE_URL, SUPABASE_SERVICE_KEY
from services.supabase import supabase_req
from services.guards import _require_admin
from services.email import send_report_email, send_issue_resolved_email

issues_bp = Blueprint("issues", __name__)


def _upload_issue_attachment(issue_id: str, index: int, filename: str, data: bytes, content_type: str) -> str | None:
    safe_name = re.sub(r"[^a-zA-Z0-9.\-_]", "_", filename)
    path      = f"{issue_id}/{index}_{safe_name}"
    url       = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/issue-attachments/{path}"
    try:
        resp = requests.put(
            url,
            headers={
                "apikey":        SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type":  content_type or "application/octet-stream",
                "x-upsert":      "true",
            },
            data=data,
            timeout=30,
        )
        resp.raise_for_status()
        return f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/public/issue-attachments/{path}"
    except Exception as exc:
        current_app.logger.error("Attachment upload failed: %s", exc)
        return None


def _submit_issue():
    form_data = {
        "employee_name": request.form.get("employee_name", "").strip(),
        "company_name":  request.form.get("company_name", "").strip(),
        "department":    request.form.get("department", "").strip(),
        "email":         request.form.get("email", "").strip(),
        "site_name":     request.form.get("site_name", "").strip(),
        "description":   request.form.get("description", "").strip(),
        "title":         request.form.get("title", "").strip() or None,
        "error_code":    request.form.get("error_code", "").strip() or None,
    }

    missing = [k.replace("_", " ").title() for k, v in form_data.items() if k != "title" and not v]
    if missing:
        return jsonify({"success": False, "error": f"Missing: {', '.join(missing)}"}), 400

    raw_files = []
    for f in request.files.getlist("attachments"):
        if f and f.filename:
            raw_files.append({
                "filename":     f.filename,
                "content_type": f.content_type or "application/octet-stream",
                "data":         f.read(),
            })
    raw_files = raw_files[:5]

    issue_id: str | None = None
    attachment_urls: list[str] = []

    if SUPABASE_URL and SUPABASE_SERVICE_KEY:
        try:
            issue_row = {
                "site_name":     form_data["site_name"],
                "employee_name": form_data["employee_name"],
                "company_name":  form_data["company_name"],
                "department":    form_data["department"],
                "email":         form_data["email"],
                "description":   form_data["description"],
            }
            if form_data["title"]:
                issue_row["title"] = form_data["title"]
            if form_data["error_code"]:
                issue_row["error_code"] = form_data["error_code"]
            rows = supabase_req("POST", "/issues", data=issue_row,
                                extra_headers={"Prefer": "return=representation"})
            if rows:
                issue_id = rows[0]["id"]
        except Exception as exc:
            current_app.logger.error("Issue save failed: %s", exc)

        if issue_id and raw_files:
            for i, f in enumerate(raw_files):
                url = _upload_issue_attachment(issue_id, i, f["filename"], f["data"], f["content_type"])
                if url:
                    attachment_urls.append(url)
            if attachment_urls:
                try:
                    supabase_req("PATCH", "/issues",
                                 data={"attachment_urls": attachment_urls},
                                 params={"id": f"eq.{issue_id}"})
                except Exception as exc:
                    current_app.logger.error("Attachment URL save failed: %s", exc)

    email_attachments = [{"filename": f["filename"], "data": f["data"]} for f in raw_files]
    send_report_email(form_data, email_attachments)

    return jsonify({"success": True, "message": "Your report has been submitted. The IT team will be in touch shortly."})


@issues_bp.post("/report")
def report():
    """Legacy endpoint — kept for backwards compat."""
    return _submit_issue()


@issues_bp.post("/api/issues")
def api_submit_issue():
    return _submit_issue()


@issues_bp.get("/api/admin/issues")
def admin_get_issues():
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/issues", params={
            "select": "*",
            "order":  "created_at.desc",
        })
        return jsonify(rows or [])
    except Exception as exc:
        current_app.logger.error("admin_get_issues failed: %s", exc)
        return jsonify({"error": "Failed to fetch issues"}), 500


@issues_bp.route("/api/admin/issues/<issue_id>", methods=["PATCH"])
def admin_patch_issue(issue_id):
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]
    body    = request.get_json(silent=True) or {}
    allowed = {"status", "assigned_to", "title", "resolution_notes", "resolved_by"}
    patch   = {k: v for k, v in body.items() if k in allowed}
    if not patch:
        return jsonify({"error": "Nothing to update"}), 400

    # Fetch current issue to detect status transition and get reporter email
    old_status = None
    issue      = None
    try:
        rows = supabase_req("GET", "/issues", params={"id": f"eq.{issue_id}", "select": "*"})
        if rows:
            issue      = rows[0]
            old_status = issue.get("status")
    except Exception as exc:
        current_app.logger.warning("admin_patch_issue: could not fetch current issue: %s", exc)

    new_status = patch.get("status")
    notify     = (
        new_status in ("resolved", "closed")
        and old_status not in ("resolved", "closed")
        and issue is not None
    )

    if notify:
        from datetime import datetime, timezone
        patch["resolved_at"] = datetime.now(timezone.utc).isoformat()

    try:
        supabase_req("PATCH", "/issues", data=patch, params={"id": f"eq.{issue_id}"})
    except Exception as exc:
        current_app.logger.error("admin_patch_issue failed: %s", exc)
        return jsonify({"error": "Update failed"}), 500

    if notify:
        resolution_notes = (patch.get("resolution_notes") or "").strip()
        resolver_name    = (patch.get("resolved_by") or "").strip()
        try:
            send_issue_resolved_email(issue, resolution_notes, resolver_name, new_status)
        except Exception as exc:
            current_app.logger.error("send_issue_resolved_email failed: %s", exc)

    return jsonify({"success": True})


@issues_bp.post("/api/admin/issues/<issue_id>/promote")
def admin_promote_issue(issue_id):
    admin_username, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/issues", params={"id": f"eq.{issue_id}", "select": "*"})
    except Exception as exc:
        current_app.logger.error("promote fetch issue failed: %s", exc)
        return jsonify({"error": "Failed to fetch issue"}), 500
    if not rows:
        return jsonify({"error": "Issue not found"}), 404

    issue = rows[0]
    if issue.get("dev_item_id"):
        return jsonify({"error": "Already promoted to a dev item"}), 409

    title = (issue.get("title") or
             f"[{issue['site_name']}] {issue['description'][:80]}{'…' if len(issue['description']) > 80 else ''}")
    desc  = (
        f"Reported by {issue['employee_name']} ({issue['company_name']}, {issue['department']})\n"
        f"Email: {issue['email']}\n\n"
        f"{issue['description']}"
    )
    try:
        new_item = supabase_req("POST", "/dev_items", data={
            "title":       title,
            "description": desc,
            "status":      "pending",
            "created_by":  admin_username,
        }, extra_headers={"Prefer": "return=representation"})
    except Exception as exc:
        current_app.logger.error("promote create dev_item failed: %s", exc)
        return jsonify({"error": "Failed to create dev item"}), 500

    dev_item_id = new_item[0]["id"] if new_item else None
    if dev_item_id:
        try:
            supabase_req("PATCH", "/issues",
                         data={"dev_item_id": dev_item_id, "status": "in_progress"},
                         params={"id": f"eq.{issue_id}"})
        except Exception as exc:
            current_app.logger.error("promote link issue failed: %s", exc)

    return jsonify({"success": True, "dev_item_id": dev_item_id})
