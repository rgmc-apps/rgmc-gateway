from flask import Blueprint, render_template, request, jsonify, current_app

from config import SUPABASE_URL, SUPABASE_SERVICE_KEY
from services.supabase import supabase_req
from services.email import send_helpdesk_email, send_helpdesk_confirmation_email
from controllers.issues import _upload_issue_attachment

general_helpdesk_bp = Blueprint("general_helpdesk", __name__)


@general_helpdesk_bp.get("/general-helpdesk")
def general_helpdesk_page():
    return render_template("general_helpdesk.html")


@general_helpdesk_bp.post("/api/general-helpdesk")
def api_general_helpdesk():
    _raw_dept_id = request.form.get("request_to_department_id", "").strip()
    form_data = {
        "employee_name":            request.form.get("employee_name", "").strip(),
        "email":                    request.form.get("email", "").strip(),
        "viber_number":             request.form.get("viber_number", "").strip(),
        "company_name":             request.form.get("company_name", "").strip(),
        "department":               request.form.get("department", "").strip(),
        "ticket_type":              request.form.get("ticket_type", "").strip(),
        "request_category":         request.form.get("request_category", "").strip(),
        "request_type_name":        request.form.get("request_type_name", "").strip() or None,
        "business_impact":          request.form.get("business_impact", "").strip() or None,
        "urgency":                  request.form.get("urgency", "").strip() or None,
        "priority":                 request.form.get("priority", "").strip() or None,
        "title":                    request.form.get("title", "").strip() or None,
        "description":              request.form.get("description", "").strip(),
        "request_to_department_id": int(_raw_dept_id) if _raw_dept_id.isdigit() else None,
    }

    required = ["employee_name", "email", "viber_number", "company_name", "ticket_type", "description"]
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

    category = form_data["request_category"] or "General"

    issue_row = {
        "site_name":        category,
        "employee_name":    form_data["employee_name"],
        "company_name":     form_data["company_name"],
        "viber_number":     form_data["viber_number"],
        "email":            form_data["email"],
        "department":       form_data["department"],
        "description":      form_data["description"],
        "from_helpdesk":    True,
        "ticket_type":      form_data["ticket_type"],
        "request_category":   form_data["request_category"],
        "request_type_name":  form_data["request_type_name"],
        "business_impact":    form_data["business_impact"],
        "urgency":          form_data["urgency"],
        "priority":         form_data["priority"],
    }
    if form_data["title"]:
        issue_row["title"] = form_data["title"]
    if form_data["request_to_department_id"]:
        issue_row["request_to_department_id"] = form_data["request_to_department_id"]

    ticket_number = None
    issue_id = None
    attachment_urls: list[str] = []

    if SUPABASE_URL and SUPABASE_SERVICE_KEY:
        try:
            rows = supabase_req("POST", "/issues", data=issue_row,
                                extra_headers={"Prefer": "return=representation"})
            if rows:
                ticket_number = rows[0].get("ticket_number")
                issue_id      = rows[0].get("id")
        except Exception as exc:
            current_app.logger.error("General helpdesk issue save failed: %s", exc)

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
                    current_app.logger.error("General helpdesk attachment save failed: %s", exc)

    email_attachments = [{"filename": f["filename"], "data": f["data"]} for f in raw_files]
    try:
        send_helpdesk_email(form_data, ticket_number, attachments=email_attachments, issue_id=issue_id)
    except Exception as exc:
        current_app.logger.error("send_helpdesk_email (general) failed: %s", exc)

    try:
        send_helpdesk_confirmation_email(form_data, ticket_number, issue_id=issue_id)
    except Exception as exc:
        current_app.logger.error("send_helpdesk_confirmation_email (general) failed: %s", exc)

    msg = (f"Your request {ticket_number} has been submitted. The team will be in touch shortly."
           if ticket_number else
           "Your request has been submitted. The team will be in touch shortly.")
    return jsonify({"success": True, "message": msg, "ticket_number": ticket_number})
