from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, render_template, current_app
from services.supabase import supabase_req
from services.guards import _require_admin
from services.email import send_issue_resolved_email, send_task_status_email

tasks_bp = Blueprint("tasks", __name__)

VALID_STATUSES = ('open', 'in_progress', 'for_review', 'done')
STATUS_ORDER   = {s: i for i, s in enumerate(VALID_STATUSES)}


@tasks_bp.get("/tasks")
def tasks_page():
    return render_template("tasks.html")


@tasks_bp.get("/api/tasks")
def api_list_tasks():
    admin_username, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]

    include_inactive = request.args.get("include_inactive", "").lower() == "true"
    params = {"select": "*", "order": "created_at.desc"}
    if not include_inactive:
        params["is_active"] = "eq.true"

    try:
        rows = supabase_req("GET", "/tasks", params=params)
        return jsonify(rows or [])
    except Exception as exc:
        current_app.logger.error("api_list_tasks failed: %s", exc)
        return jsonify({"error": "Failed to fetch tasks"}), 500


@tasks_bp.post("/api/tasks")
def api_create_task():
    admin_username, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]

    body = request.get_json(silent=True) or {}
    task_name = (body.get("task_name") or "").strip()
    if not task_name:
        return jsonify({"error": "task_name is required"}), 400

    data = {
        "task_name":  task_name,
        "created_by": admin_username,
        "status":     "open",
        "is_active":  True,
    }
    for field in ("task_type", "description", "start_date", "estimated_end_date"):
        val = body.get(field)
        if val:
            data[field] = val

    try:
        rows = supabase_req("POST", "/tasks", data=data,
                            extra_headers={"Prefer": "return=representation"})
        return jsonify(rows[0] if rows else data), 201
    except Exception as exc:
        current_app.logger.error("api_create_task failed: %s", exc)
        return jsonify({"error": "Failed to create task"}), 500


@tasks_bp.patch("/api/tasks/<task_id>")
def api_update_task(task_id):
    admin_username, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]

    body = request.get_json(silent=True) or {}
    allowed = {
        "task_name", "task_type", "description", "status",
        "is_active", "start_date", "estimated_end_date", "actual_end_date",
    }
    patch = {k: v for k, v in body.items() if k in allowed}
    if not patch:
        return jsonify({"error": "Nothing to update"}), 400

    new_status = patch.get("status")
    if new_status and new_status not in VALID_STATUSES:
        return jsonify({"error": f"Invalid status: {new_status}"}), 400

    # Fetch current task for status comparison and issue link
    old_task = None
    try:
        rows = supabase_req("GET", "/tasks", params={"id": f"eq.{task_id}", "select": "*"})
        if rows:
            old_task = rows[0]
    except Exception as exc:
        current_app.logger.warning("api_update_task: could not fetch task: %s", exc)

    if old_task is None:
        return jsonify({"error": "Task not found"}), 404

    old_status = old_task.get("status")

    # Auto-set actual_end_date when done
    if new_status == "done" and not old_task.get("actual_end_date") and "actual_end_date" not in patch:
        patch["actual_end_date"] = datetime.now(timezone.utc).date().isoformat()
    elif new_status and new_status != "done":
        if "actual_end_date" not in patch:
            patch["actual_end_date"] = None

    patch["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        supabase_req("PATCH", "/tasks", data=patch, params={"id": f"eq.{task_id}"})
    except Exception as exc:
        current_app.logger.error("api_update_task patch failed: %s", exc)
        return jsonify({"error": "Update failed"}), 500

    # Handle linked issue side-effects when task becomes done
    issue = None
    issue_id = old_task.get("issue_id")
    if issue_id:
        try:
            issue_rows = supabase_req("GET", "/issues", params={"id": f"eq.{issue_id}", "select": "*"})
            issue = issue_rows[0] if issue_rows else None
        except Exception as exc:
            current_app.logger.warning("api_update_task: could not fetch linked issue: %s", exc)

    if new_status == "done" and old_status != "done" and issue:
        # Cascade resolve linked issue if not already terminal
        issue_status = issue.get("status", "")
        if issue_status not in ("resolved", "closed"):
            try:
                supabase_req("PATCH", "/issues",
                             data={"status": "resolved"},
                             params={"id": f"eq.{issue_id}"})
                try:
                    send_issue_resolved_email(issue, "", admin_username, "resolved")
                except Exception as email_exc:
                    current_app.logger.error("send_issue_resolved_email failed: %s", email_exc)
            except Exception as exc:
                current_app.logger.error("api_update_task: cascade resolve issue failed: %s", exc)

    # Send task status email on forward status transitions
    if new_status and old_status and new_status != old_status:
        old_order = STATUS_ORDER.get(old_status, -1)
        new_order = STATUS_ORDER.get(new_status, -1)
        if new_order > old_order and issue:
            try:
                send_task_status_email(old_task, issue, old_status, new_status, admin_username)
            except Exception as exc:
                current_app.logger.error("send_task_status_email failed: %s", exc)

    # Return updated task
    try:
        updated = supabase_req("GET", "/tasks", params={"id": f"eq.{task_id}", "select": "*"})
        return jsonify(updated[0] if updated else {"success": True})
    except Exception:
        return jsonify({"success": True})


@tasks_bp.delete("/api/tasks/<task_id>")
def api_delete_task(task_id):
    admin_username, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]

    try:
        supabase_req("DELETE", "/tasks", params={"id": f"eq.{task_id}"})
        return jsonify({"success": True})
    except Exception as exc:
        current_app.logger.error("api_delete_task failed: %s", exc)
        return jsonify({"error": "Delete failed"}), 500


@tasks_bp.get("/api/tasks/<task_id>/logs")
def api_get_task_logs(task_id):
    admin_username, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]

    try:
        rows = supabase_req("GET", "/task_activity_logs", params={
            "task_id": f"eq.{task_id}",
            "order":   "created_at.asc",
            "select":  "*",
        })
        return jsonify(rows or [])
    except Exception as exc:
        current_app.logger.error("api_get_task_logs failed: %s", exc)
        return jsonify({"error": "Failed to fetch logs"}), 500


@tasks_bp.post("/api/tasks/<task_id>/logs")
def api_add_task_log(task_id):
    admin_username, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]

    body = request.get_json(silent=True) or {}
    message = (body.get("message") or "").strip()
    if not message:
        return jsonify({"error": "message is required"}), 400

    try:
        rows = supabase_req("POST", "/task_activity_logs", data={
            "task_id":  task_id,
            "username": admin_username,
            "message":  message,
        }, extra_headers={"Prefer": "return=representation"})
        return jsonify(rows[0] if rows else {"success": True}), 201
    except Exception as exc:
        current_app.logger.error("api_add_task_log failed: %s", exc)
        return jsonify({"error": "Failed to add log"}), 500
