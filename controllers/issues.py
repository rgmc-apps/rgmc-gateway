import re
import requests
from flask import Blueprint, request, jsonify, current_app, render_template

from config import SUPABASE_URL, SUPABASE_SERVICE_KEY
from services.supabase import supabase_req, resolve_action_names
from services.guards import _require_admin
from services.email import send_report_email, send_issue_resolved_email, send_issue_assigned_email, send_helpdesk_email, send_helpdesk_confirmation_email, send_issue_promoted_to_epic_email, send_issue_promoted_to_dev_email, send_issue_promoted_to_task_email

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
    _raw_dept_id = request.form.get("request_to_department_id", "").strip()
    form_data = {
        "employee_name":            request.form.get("employee_name", "").strip(),
        "company_name":             request.form.get("company_name", "").strip(),
        "viber_number":             request.form.get("viber_number", "").strip(),
        "email":                    request.form.get("email", "").strip(),
        "department":               request.form.get("department", "").strip(),
        "site_name":                request.form.get("site_name", "").strip(),
        "description":              request.form.get("description", "").strip(),
        "title":                    request.form.get("title", "").strip() or None,
        "error_code":               request.form.get("error_code", "").strip() or None,
        "user_payload":             request.form.get("user_payload", "").strip() or None,
        "request_category":         request.form.get("request_category", "").strip() or None,
        "priority":                 request.form.get("priority", "").strip() or None,
        "request_to_department_id": int(_raw_dept_id) if _raw_dept_id.isdigit() else None,
    }

    required = ["employee_name", "company_name", "viber_number", "email", "site_name", "description"]
    missing  = [k.replace("_", " ").title() for k in required if not form_data[k]]
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
    ticket_number: str | None = None
    attachment_urls: list[str] = []
    created_issue: dict | None = None

    if SUPABASE_URL and SUPABASE_SERVICE_KEY:
        try:
            issue_row = {
                "site_name":     form_data["site_name"],
                "employee_name": form_data["employee_name"],
                "company_name":  form_data["company_name"],
                "viber_number":  form_data["viber_number"],
                "email":         form_data["email"],
                "department":    form_data["department"] or "",
                "description":   form_data["description"],
            }
            if form_data["title"]:
                issue_row["title"] = form_data["title"]
            if form_data["error_code"]:
                issue_row["error_code"] = form_data["error_code"]
            if form_data["user_payload"]:
                issue_row["user_payload"] = form_data["user_payload"]
            if form_data["request_category"]:
                issue_row["request_category"] = form_data["request_category"]
            if form_data["priority"]:
                issue_row["priority"] = form_data["priority"]
            if form_data["request_to_department_id"]:
                issue_row["request_to_department_id"] = form_data["request_to_department_id"]
            rows = supabase_req("POST", "/issues", data=issue_row,
                                extra_headers={"Prefer": "return=representation"})
            if rows:
                created_issue = dict(rows[0])
                issue_id      = created_issue["id"]
                ticket_number = created_issue.get("ticket_number")
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
    send_report_email(form_data, email_attachments, ticket_number=ticket_number)

    if created_issue:
        from services.it_bot import notify_ticket_created
        if attachment_urls:
            created_issue["attachment_urls"] = attachment_urls
        notify_ticket_created(created_issue)

    msg = (f"Your report {ticket_number} has been submitted. The IT team will be in touch shortly."
           if ticket_number else
           "Your report has been submitted. The IT team will be in touch shortly.")
    return jsonify({"success": True, "message": msg, "ticket_number": ticket_number})


def _submit_helpdesk_issue():
    _raw_hd_dept_id = request.form.get("request_to_department_id", "").strip()
    form_data = {
        "employee_name":            request.form.get("employee_name", "").strip(),
        "email":                    request.form.get("email", "").strip(),
        "viber_number":             request.form.get("viber_number", "").strip(),
        "company_name":             request.form.get("company_name", "").strip(),
        "department":               request.form.get("department", "").strip(),
        "anydesk_id":               request.form.get("anydesk_id", "").strip() or None,
        "ticket_type":              request.form.get("ticket_type", "").strip(),
        "request_category":         request.form.get("request_category", "").strip(),
        "request_subcategory":      request.form.get("request_subcategory", "").strip() or None,
        "request_type_name":        request.form.get("request_type_name", "").strip() or None,
        "business_impact":          request.form.get("business_impact", "").strip() or None,
        "urgency":                  request.form.get("urgency", "").strip() or None,
        "priority":                 request.form.get("priority", "").strip() or None,
        "title":                    request.form.get("title", "").strip() or None,
        "description":              request.form.get("description", "").strip(),
        "request_to_department_id": int(_raw_hd_dept_id) if _raw_hd_dept_id.isdigit() else None,
    }

    required = ["employee_name", "email", "viber_number", "company_name",
                "ticket_type", "request_category", "description"]
    missing = [k.replace("_", " ").title() for k in required if not form_data[k]]
    if missing:
        return jsonify({"success": False, "error": f"Missing: {', '.join(missing)}"}), 400

    if form_data["anydesk_id"] and not re.match(r'^\d{9}$', form_data["anydesk_id"]):
        return jsonify({"success": False, "error": "AnyDesk ID must be exactly 9 digits"}), 400

    raw_files = []
    for f in request.files.getlist("attachments"):
        if f and f.filename:
            raw_files.append({
                "filename":     f.filename,
                "content_type": f.content_type or "application/octet-stream",
                "data":         f.read(),
            })
    raw_files = raw_files[:5]

    site_name = form_data["request_subcategory"] or form_data["request_category"]

    issue_row = {
        "site_name":           site_name,
        "employee_name":       form_data["employee_name"],
        "company_name":        form_data["company_name"],
        "viber_number":        form_data["viber_number"],
        "email":               form_data["email"],
        "department":          form_data["department"],
        "description":         form_data["description"],
        "from_helpdesk":       True,
        "ticket_type":         form_data["ticket_type"],
        "request_category":    form_data["request_category"],
        "request_subcategory": form_data["request_subcategory"],
        "request_type_name":   form_data["request_type_name"],
        "business_impact":     form_data["business_impact"],
        "urgency":             form_data["urgency"],
        "priority":            form_data["priority"],
    }
    if form_data["anydesk_id"]:
        issue_row["anydesk_id"] = form_data["anydesk_id"]
    if form_data["title"]:
        issue_row["title"] = form_data["title"]
    if form_data["request_to_department_id"]:
        issue_row["request_to_department_id"] = form_data["request_to_department_id"]

    ticket_number = None
    issue_id = None
    attachment_urls: list[str] = []
    created_issue: dict | None = None

    if SUPABASE_URL and SUPABASE_SERVICE_KEY:
        try:
            rows = supabase_req("POST", "/issues", data=issue_row,
                                extra_headers={"Prefer": "return=representation"})
            if rows:
                created_issue = dict(rows[0])
                ticket_number = created_issue.get("ticket_number")
                issue_id      = created_issue.get("id")
        except Exception as exc:
            current_app.logger.error("Helpdesk issue save failed: %s", exc)

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
                    current_app.logger.error("Helpdesk attachment URL save failed: %s", exc)

    email_attachments = [{"filename": f["filename"], "data": f["data"]} for f in raw_files]
    try:
        send_helpdesk_email(form_data, ticket_number, attachments=email_attachments, issue_id=issue_id)
    except Exception as exc:
        current_app.logger.error("send_helpdesk_email failed: %s", exc)

    try:
        send_helpdesk_confirmation_email(form_data, ticket_number, issue_id=issue_id)
    except Exception as exc:
        current_app.logger.error("send_helpdesk_confirmation_email failed: %s", exc)

    if created_issue:
        from services.it_bot import notify_ticket_created
        if attachment_urls:
            created_issue["attachment_urls"] = attachment_urls
        notify_ticket_created(created_issue)

    msg = (f"Your ticket {ticket_number} has been submitted. The IT team will be in touch shortly."
           if ticket_number else
           "Your ticket has been submitted. The IT team will be in touch shortly.")
    return jsonify({"success": True, "message": msg, "ticket_number": ticket_number})


@issues_bp.post("/api/helpdesk")
def api_submit_helpdesk():
    return _submit_helpdesk_issue()


@issues_bp.post("/report")
def report():
    """Legacy endpoint — kept for backwards compat."""
    return _submit_issue()


@issues_bp.post("/api/issues")
def api_submit_issue():
    return _submit_issue()


@issues_bp.get("/admin/issues/<issue_id>")
def admin_issue_detail(issue_id):
    return render_template("issue_view.html", issue_id=issue_id)


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
    admin_username, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]
    body    = request.get_json(silent=True) or {}
    allowed = {"status", "assigned_to", "title", "resolution_notes", "resolved_by", "request_to_department_id", "resolution_action_ids", "resolution_attachment_urls", "resolution_remarks"}
    patch   = {k: v for k, v in body.items() if k in allowed}
    if not patch:
        return jsonify({"error": "Nothing to update"}), 400

    # Fetch current issue to detect status transition and get reporter email
    old_status      = None
    old_assigned_to = None
    issue           = None
    try:
        rows = supabase_req("GET", "/issues", params={"id": f"eq.{issue_id}", "select": "*"})
        if rows:
            issue           = rows[0]
            old_status      = issue.get("status")
            old_assigned_to = issue.get("assigned_to")
    except Exception as exc:
        current_app.logger.warning("admin_patch_issue: could not fetch current issue: %s", exc)

    new_status = patch.get("status")
    notify_resolved = (
        new_status in ("resolved", "closed")
        and old_status not in ("resolved", "closed")
        and issue is not None
    )

    new_assigned_to  = patch.get("assigned_to")
    notify_assigned  = (
        "assigned_to" in patch
        and new_assigned_to
        and new_assigned_to != old_assigned_to
        and issue is not None
    )

    if notify_resolved:
        from datetime import datetime, timezone
        patch["resolved_at"] = datetime.now(timezone.utc).isoformat()

    try:
        supabase_req("PATCH", "/issues", data=patch, params={"id": f"eq.{issue_id}"})
    except Exception as exc:
        current_app.logger.error("admin_patch_issue failed: %s", exc)
        return jsonify({"error": "Update failed"}), 500

    if issue:
        from services.it_bot import notify_ticket_updated, build_changes
        changes = build_changes(issue, patch)
        if changes:
            notify_ticket_updated({**issue, **patch}, changes)

    if notify_resolved:
        resolution_notes = (patch.get("resolution_notes") or "").strip()
        resolver_name    = (patch.get("resolved_by") or "").strip()
        action_names     = resolve_action_names(patch.get("resolution_action_ids") or [])
        attachment_urls  = [u for u in (patch.get("resolution_attachment_urls") or []) if u]
        try:
            send_issue_resolved_email(
                issue, resolution_notes, resolver_name, new_status,
                action_names=action_names, attachment_urls=attachment_urls,
            )
        except Exception as exc:
            current_app.logger.error("send_issue_resolved_email failed: %s", exc)

    if notify_assigned:
        try:
            dev_users = supabase_req("GET", "/users", params={
                "username": f"in.({new_assigned_to},{admin_username})",
                "select":   "username,first_name,last_name,email",
            })
            dev_user   = next((u for u in (dev_users or []) if u["username"] == new_assigned_to), None)
            admin_user = next((u for u in (dev_users or []) if u["username"] == admin_username), None)
            assigned_by = (
                f"{admin_user.get('first_name','')} {admin_user.get('last_name','')}".strip()
                or admin_username
            ) if admin_user else admin_username
            if dev_user:
                send_issue_assigned_email(issue, dev_user, assigned_by)
        except Exception as exc:
            current_app.logger.error("send_issue_assigned_email failed: %s", exc)

    # Cascade assigned_to change to the linked user_task
    if "assigned_to" in patch and issue and issue.get("user_task_id"):
        try:
            supabase_req("PATCH", "/user_tasks",
                         data={"assigned_to": patch.get("assigned_to")},
                         params={"id": f"eq.{issue['user_task_id']}"})
        except Exception as exc:
            current_app.logger.warning("admin_patch_issue: user_task assigned_to sync failed: %s", exc)

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

    body     = request.get_json(silent=True) or {}
    assignee = (body.get("assigned_to") or "").strip() or None

    title = (issue.get("title") or
             f"[{issue['site_name']}] {issue['description'][:80]}{'…' if len(issue['description']) > 80 else ''}")
    desc  = (
        f"Reported by {issue['employee_name']} ({issue['company_name']}, {issue['department']})\n"
        f"Email: {issue['email']}\n\n"
        f"{issue['description']}"
    )
    dev_item_data = {
        "title":       title,
        "description": desc,
        "status":      "pending",
        "created_by":  admin_username,
    }
    if assignee:
        dev_item_data["assigned_to"] = assignee
    try:
        new_item = supabase_req("POST", "/dev_items", data=dev_item_data,
                                extra_headers={"Prefer": "return=representation"})
    except Exception as exc:
        current_app.logger.error("promote create dev_item failed: %s", exc)
        return jsonify({"error": "Failed to create dev item"}), 500

    dev_item_id = new_item[0]["id"] if new_item else None
    new_dev_item = new_item[0] if new_item else {}
    if dev_item_id:
        issue_patch = {"dev_item_id": dev_item_id}
        if assignee:
            issue_patch["status"]      = "in_progress"
            issue_patch["assigned_to"] = assignee  # always update assigned_to
        try:
            supabase_req("PATCH", "/issues", data=issue_patch, params={"id": f"eq.{issue_id}"})
        except Exception as exc:
            current_app.logger.error("promote link issue failed: %s", exc)

        # Fetch admin + assignee display names
        try:
            usernames = list(filter(None, [admin_username, assignee]))
            user_rows = supabase_req("GET", "/users", params={
                "username": f"in.({','.join(usernames)})",
                "select":   "username,first_name,last_name,display_name,email",
            }) if usernames else []
            admin_info    = next((u for u in (user_rows or []) if u["username"] == admin_username), {})
            assignee_info = next((u for u in (user_rows or []) if u["username"] == assignee), {}) if assignee else {}
            promoted_by   = (
                admin_info.get("display_name") or
                f"{admin_info.get('first_name','')} {admin_info.get('last_name','')}".strip() or
                admin_username
            )
            assignee_name = (
                f"{assignee_info.get('first_name','')} {assignee_info.get('last_name','')}".strip() or
                assignee or ""
            )
        except Exception as exc:
            current_app.logger.warning("promote: user lookup failed: %s", exc)
            promoted_by, assignee_name, assignee_info = admin_username, assignee or "", {}

        # Email to IT team
        try:
            send_issue_promoted_to_dev_email(issue, new_dev_item, assignee_name, promoted_by)
        except Exception as exc:
            current_app.logger.warning("promote dev email failed: %s", exc)

        # Assignment email to the assigned developer
        if assignee and assignee_info:
            try:
                send_issue_assigned_email(issue, assignee_info, promoted_by)
            except Exception as exc:
                current_app.logger.warning("promote dev assigned email failed: %s", exc)

        # Bot notification
        try:
            from services.it_bot import notify_issue_promoted_to_dev
            updated_issue = {**issue, **issue_patch}
            notify_issue_promoted_to_dev(updated_issue, new_dev_item)
        except Exception as exc:
            current_app.logger.warning("promote dev bot notify failed: %s", exc)

    return jsonify({"success": True, "dev_item_id": dev_item_id})


@issues_bp.post("/api/admin/issues/<issue_id>/promote-task")
def admin_promote_issue_to_task(issue_id):
    admin_username, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/issues", params={"id": f"eq.{issue_id}", "select": "*"})
    except Exception as exc:
        current_app.logger.error("promote-task fetch issue failed: %s", exc)
        return jsonify({"error": "Failed to fetch issue"}), 500
    if not rows:
        return jsonify({"error": "Issue not found"}), 404

    issue = rows[0]
    if issue.get("task_id"):
        return jsonify({"error": "Already promoted to a task"}), 409

    body     = request.get_json(silent=True) or {}
    assignee = (body.get("assigned_to") or "").strip() or None

    task_name = (issue.get("title") or
                 f"[{issue['site_name']}] {issue['description'][:80]}{'…' if len(issue['description']) > 80 else ''}")
    desc = (
        f"Reported by {issue['employee_name']} ({issue['company_name']}, {issue.get('department','')})\n"
        f"Email: {issue['email']}\n\n"
        f"{issue['description']}"
    )
    task_data = {
        "task_name":   task_name,
        "description": desc,
        "issue_id":    issue_id,
        "status":      "open",
        "is_active":   True,
        "created_by":  admin_username,
    }
    if assignee:
        task_data["assigned_to"] = assignee
    try:
        new_task = supabase_req("POST", "/tasks", data=task_data,
                                extra_headers={"Prefer": "return=representation"})
    except Exception as exc:
        current_app.logger.error("promote-task create task failed: %s", exc)
        return jsonify({"error": "Failed to create task"}), 500

    task_id  = new_task[0]["id"] if new_task else None
    new_task_obj = new_task[0] if new_task else {}
    if task_id:
        issue_patch = {"task_id": task_id}
        if assignee:
            issue_patch["status"]      = "in_progress"
            issue_patch["assigned_to"] = assignee  # always update assigned_to
        try:
            supabase_req("PATCH", "/issues", data=issue_patch, params={"id": f"eq.{issue_id}"})
        except Exception as exc:
            current_app.logger.error("promote-task link issue failed: %s", exc)

        # Fetch admin + assignee display names
        try:
            usernames = list(filter(None, [admin_username, assignee]))
            user_rows = supabase_req("GET", "/users", params={
                "username": f"in.({','.join(usernames)})",
                "select":   "username,first_name,last_name,display_name,email",
            }) if usernames else []
            admin_info    = next((u for u in (user_rows or []) if u["username"] == admin_username), {})
            assignee_info = next((u for u in (user_rows or []) if u["username"] == assignee), {}) if assignee else {}
            promoted_by   = (
                admin_info.get("display_name") or
                f"{admin_info.get('first_name','')} {admin_info.get('last_name','')}".strip() or
                admin_username
            )
            assignee_name = (
                f"{assignee_info.get('first_name','')} {assignee_info.get('last_name','')}".strip() or
                assignee or ""
            )
        except Exception as exc:
            current_app.logger.warning("promote-task: user lookup failed: %s", exc)
            promoted_by, assignee_name, assignee_info = admin_username, assignee or "", {}

        # Email to IT team
        try:
            send_issue_promoted_to_task_email(issue, new_task_obj, assignee_name, promoted_by)
        except Exception as exc:
            current_app.logger.warning("promote-task email failed: %s", exc)

        # Assignment email to the assigned developer
        if assignee and assignee_info:
            try:
                send_issue_assigned_email(issue, assignee_info, promoted_by)
            except Exception as exc:
                current_app.logger.warning("promote-task assigned email failed: %s", exc)

        # Bot notification
        try:
            from services.it_bot import notify_issue_promoted_to_task
            updated_issue = {**issue, **issue_patch}
            notify_issue_promoted_to_task(updated_issue, new_task_obj)
        except Exception as exc:
            current_app.logger.warning("promote-task bot notify failed: %s", exc)

    return jsonify({"success": True, "task_id": task_id})


@issues_bp.post("/api/admin/issues/<issue_id>/promote-epic")
def admin_promote_issue_to_epic(issue_id):
    admin_username, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/issues", params={"id": f"eq.{issue_id}", "select": "*"})
    except Exception as exc:
        current_app.logger.error("promote-epic fetch issue failed: %s", exc)
        return jsonify({"error": "Failed to fetch issue"}), 500
    if not rows:
        return jsonify({"error": "Issue not found"}), 404

    issue = rows[0]
    if issue.get("epic_id"):
        return jsonify({"error": "Already promoted to an epic"}), 409

    epic_name = (issue.get("title") or
                 f"[{issue['site_name']}] {issue['description'][:80]}{'…' if len(issue['description']) > 80 else ''}")
    epic_desc = (
        f"Reported by {issue['employee_name']} ({issue['company_name']}, {issue.get('department', '')})\n"
        f"Email: {issue['email']}\n\n"
        f"{issue['description']}"
    )
    epic_data = {
        "epic_name":        epic_name,
        "epic_description": epic_desc,
        "epic_status":      "planning",
        "is_active":        True,
    }
    try:
        new_epic = supabase_req("POST", "/epics", data=epic_data,
                                extra_headers={"Prefer": "return=representation"})
    except Exception as exc:
        current_app.logger.error("promote-epic create epic failed: %s", exc)
        return jsonify({"error": "Failed to create epic"}), 500

    epic_id = new_epic[0]["epic_id"] if new_epic else None
    if epic_id:
        try:
            supabase_req("PATCH", "/issues", data={"epic_id": epic_id},
                         params={"id": f"eq.{issue_id}"})
        except Exception as exc:
            current_app.logger.error("promote-epic link issue failed: %s", exc)

        # Email notification (fire-and-forget)
        try:
            admin_rows = supabase_req("GET", "/users",
                                      params={"username": f"eq.{admin_username}", "select": "first_name,last_name,display_name"})
            admin_info = admin_rows[0] if admin_rows else {}
            promoted_by = (
                admin_info.get("display_name") or
                f"{admin_info.get('first_name','')} {admin_info.get('last_name','')}".strip() or
                admin_username
            )
            send_issue_promoted_to_epic_email(issue, new_epic[0], promoted_by)
        except Exception as exc:
            current_app.logger.warning("promote-epic email failed: %s", exc)

        # Bot notification (fire-and-forget)
        try:
            from services.it_bot import notify_issue_promoted_to_epic
            updated_issue = dict(issue)
            updated_issue["epic_id"] = epic_id
            notify_issue_promoted_to_epic(updated_issue, new_epic[0])
        except Exception as exc:
            current_app.logger.warning("promote-epic bot notify failed: %s", exc)

    return jsonify({"success": True, "epic_id": epic_id})


@issues_bp.get("/api/issues/<issue_id>/activity")
def get_issue_activity(issue_id):
    result = []

    try:
        rows = supabase_req("GET", "/issues", params={
            "id":     f"eq.{issue_id}",
            "select": "id,user_task_id,dev_item_id",
        })
    except Exception:
        return jsonify([])
    if not rows:
        return jsonify([])
    issue = rows[0]

    try:
        comments = supabase_req("GET", "/issue_comments", params={
            "issue_id": f"eq.{issue_id}",
            "order":    "created_at.asc",
            "select":   "id,username,comment,created_at",
        })
        for c in (comments or []):
            result.append({
                "type":       "comment",
                "username":   c["username"],
                "text":       c["comment"],
                "created_at": c["created_at"],
            })
    except Exception:
        pass

    user_task_id = issue.get("user_task_id")
    if user_task_id:
        try:
            logs = supabase_req("GET", "/task_item_logs", params={
                "task_id": f"eq.{user_task_id}",
                "order":   "created_at.asc",
                "select":  "username,from_status,to_status,created_at",
            })
            for l in (logs or []):
                result.append({
                    "type":       "moved",
                    "source":     "task",
                    "username":   l["username"],
                    "from":       l.get("from_status"),
                    "to":         l["to_status"],
                    "created_at": l["created_at"],
                })
        except Exception:
            pass
        try:
            activity = supabase_req("GET", "/task_activity_logs", params={
                "task_id": f"eq.{user_task_id}",
                "order":   "created_at.asc",
                "select":  "username,message,created_at",
            })
            for a in (activity or []):
                result.append({
                    "type":       "note",
                    "source":     "task",
                    "username":   a["username"],
                    "text":       a["message"],
                    "created_at": a["created_at"],
                })
        except Exception:
            pass

    dev_item_id = issue.get("dev_item_id")
    if dev_item_id:
        try:
            logs = supabase_req("GET", "/dev_item_logs", params={
                "item_id": f"eq.{dev_item_id}",
                "order":   "created_at.asc",
                "select":  "username,from_status,to_status,created_at",
            })
            for l in (logs or []):
                result.append({
                    "type":       "moved",
                    "source":     "dev",
                    "username":   l["username"],
                    "from":       l.get("from_status"),
                    "to":         l["to_status"],
                    "created_at": l["created_at"],
                })
        except Exception:
            pass

    result.sort(key=lambda x: x.get("created_at") or "")
    return jsonify(result)


@issues_bp.post("/api/issues/<issue_id>/comments")
def post_issue_comment(issue_id):
    username = request.headers.get("X-Gateway-Username", "").strip().lower()
    if not username:
        return jsonify({"error": "Authentication required"}), 401

    body    = request.get_json(silent=True) or {}
    comment = (body.get("comment") or "").strip()
    if not comment:
        return jsonify({"error": "Comment cannot be empty"}), 400

    try:
        rows = supabase_req("POST", "/issue_comments", data={
            "issue_id": issue_id,
            "username": username,
            "comment":  comment,
        }, extra_headers={"Prefer": "return=representation"})
        return jsonify({"success": True, "comment": rows[0] if rows else {}})
    except Exception as exc:
        current_app.logger.error("post_issue_comment failed: %s", exc)
        return jsonify({"error": "Failed to save comment"}), 500


@issues_bp.get("/api/admin/issues/search")
def admin_search_issues():
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]
    q = request.args.get("q", "").strip()
    try:
        params = {
            "select": "id,ticket_number,title,description,status,site_name,employee_name",
            "order":  "created_at.desc",
            "limit":  "30",
        }
        if q:
            safe = q.replace("*", "").replace("(", "").replace(")", "")
            params["or"] = (
                f"(ticket_number.ilike.*{safe}*,"
                f"title.ilike.*{safe}*,"
                f"description.ilike.*{safe}*,"
                f"employee_name.ilike.*{safe}*,"
                f"site_name.ilike.*{safe}*)"
            )
        rows = supabase_req("GET", "/issues", params=params)
        return jsonify(rows or [])
    except Exception as exc:
        current_app.logger.error("admin_search_issues failed: %s", exc)
        return jsonify({"error": str(exc)}), 500


@issues_bp.post("/api/admin/issues/<issue_id>/link")
def admin_link_issue(issue_id):
    admin_username, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]

    body         = request.get_json(silent=True) or {}
    link_type    = body.get("link_type", "")       # 'issue' | 'task' | 'dev_item'
    target_id    = (body.get("target_id") or "").strip()
    is_duplicate = bool(body.get("is_duplicate"))

    if not link_type or not target_id:
        return jsonify({"error": "link_type and target_id are required"}), 400

    # Fetch current issue
    try:
        rows = supabase_req("GET", "/issues", params={"id": f"eq.{issue_id}", "select": "*"})
    except Exception as exc:
        current_app.logger.error("admin_link_issue: fetch issue failed: %s", exc)
        return jsonify({"error": "Failed to fetch issue"}), 500
    if not rows:
        return jsonify({"error": "Issue not found"}), 404
    issue = rows[0]

    patch = {}

    if link_type == "issue":
        if target_id == issue_id:
            return jsonify({"error": "An issue cannot be linked to itself"}), 400
        # Verify target exists
        try:
            t_rows = supabase_req("GET", "/issues", params={
                "id":     f"eq.{target_id}",
                "select": "id,ticket_number,title,description",
            })
        except Exception as exc:
            return jsonify({"error": "Failed to fetch target issue"}), 500
        if not t_rows:
            return jsonify({"error": "Target issue not found"}), 404
        target = t_rows[0]

        patch["linked_issue_id"] = target_id
        patch["is_duplicate"]    = is_duplicate

        if is_duplicate:
            from datetime import datetime, timezone
            ticket = target.get("ticket_number") or target_id[:8]
            label  = target.get("title") or (target.get("description") or "")[:80]
            patch["status"]           = "resolved"
            patch["resolution_notes"] = f"Duplicate of #{ticket}" + (f": {label}" if label else "")
            patch["resolved_by"]      = admin_username
            patch["resolved_at"]      = datetime.now(timezone.utc).isoformat()

    elif link_type == "task":
        # Verify task exists
        try:
            t_rows = supabase_req("GET", "/tasks", params={"id": f"eq.{target_id}", "select": "id"})
        except Exception:
            return jsonify({"error": "Failed to fetch target task"}), 500
        if not t_rows:
            return jsonify({"error": "Task not found"}), 404
        patch["task_id"] = target_id

    elif link_type == "dev_item":
        # Verify dev item exists
        try:
            t_rows = supabase_req("GET", "/dev_items", params={"id": f"eq.{target_id}", "select": "id"})
        except Exception:
            return jsonify({"error": "Failed to fetch target dev item"}), 500
        if not t_rows:
            return jsonify({"error": "Dev item not found"}), 404
        patch["dev_item_id"] = target_id

    else:
        return jsonify({"error": f"Invalid link_type: {link_type}"}), 400

    try:
        supabase_req("PATCH", "/issues", data=patch, params={"id": f"eq.{issue_id}"})
    except Exception as exc:
        current_app.logger.error("admin_link_issue: patch failed: %s", exc)
        return jsonify({"error": "Failed to link issue"}), 500

    # Send resolved email if marked duplicate
    if is_duplicate and patch.get("status") == "resolved":
        try:
            send_issue_resolved_email(
                issue, patch.get("resolution_notes", ""), admin_username, "resolved",
            )
        except Exception as exc:
            current_app.logger.error("admin_link_issue: resolved email failed: %s", exc)

    return jsonify({"success": True})


@issues_bp.post("/api/admin/issues/<issue_id>/promote-user-task")
def admin_promote_issue_to_user_task(issue_id):
    admin_username, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/issues", params={"id": f"eq.{issue_id}", "select": "*"})
    except Exception as exc:
        current_app.logger.error("promote-user-task fetch issue failed: %s", exc)
        return jsonify({"error": "Failed to fetch issue"}), 500
    if not rows:
        return jsonify({"error": "Issue not found"}), 404

    issue = rows[0]
    if issue.get("user_task_id"):
        return jsonify({"error": "Already promoted to a user task"}), 409

    title = (issue.get("title") or
             f"[{issue['site_name']}] {issue['description'][:80]}{'…' if len(issue['description']) > 80 else ''}")
    desc = (
        f"Reported by {issue['employee_name']} ({issue['company_name']}, {issue.get('department', '')})\n"
        f"Email: {issue['email']}\n\n"
        f"{issue['description']}"
    )

    dept_id   = issue.get("request_to_department_id")
    dept_name = issue.get("department") or ""

    if dept_id and not dept_name:
        try:
            dept_rows = supabase_req("GET", "/departments", params={
                "department_id": f"eq.{dept_id}", "select": "department_name",
            })
            if dept_rows:
                dept_name = dept_rows[0].get("department_name", "")
        except Exception:
            pass

    try:
        new_task = supabase_req("POST", "/user_tasks", data={
            "title":           title,
            "description":     desc,
            "status":          "open",
            "created_by":      admin_username,
            "department_id":   dept_id,
            "department_name": dept_name or None,
        }, extra_headers={"Prefer": "return=representation"})
    except Exception as exc:
        current_app.logger.error("promote-user-task create user_task failed: %s", exc)
        return jsonify({"error": "Failed to create user task"}), 500

    user_task_id = new_task[0]["id"] if new_task else None
    if user_task_id:
        try:
            supabase_req("PATCH", "/issues",
                         data={"user_task_id": user_task_id, "status": "in_progress"},
                         params={"id": f"eq.{issue_id}"})
        except Exception as exc:
            current_app.logger.error("promote-user-task link issue failed: %s", exc)

    return jsonify({"success": True, "user_task_id": user_task_id})
