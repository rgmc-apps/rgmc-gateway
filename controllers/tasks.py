from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, render_template, current_app
from services.supabase import supabase_req, resolve_action_names
from services.guards import _require_admin
from services.email import send_issue_resolved_email, send_task_status_email

tasks_bp = Blueprint("tasks", __name__)


def _get_status_meta(slugs):
    """Return {slug: {is_terminal, is_initial, sort_order, label}} for all given slugs."""
    if not slugs:
        return {}
    slug_list = ",".join(slugs)
    try:
        rows = supabase_req("GET", "/task_statuses", params={
            "slug":  f"in.({slug_list})",
            "scope": "eq.admin",
            "select": "slug,label,is_terminal,is_initial,sort_order",
        })
        return {r["slug"]: r for r in rows}
    except Exception:
        return {}


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
        "resolution_notes", "resolution_action_ids", "resolution_attachment_urls",
    }
    patch = {k: v for k, v in body.items() if k in allowed}
    if not patch:
        return jsonify({"error": "Nothing to update"}), 400

    new_status = patch.get("status")

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

    # Resolve is_terminal / sort_order for old and new statuses
    new_is_terminal = False
    old_is_terminal = False
    new_sort_order  = 0
    old_sort_order  = 0
    if new_status or old_status:
        slugs_to_check = list({s for s in [new_status, old_status] if s})
        sm = _get_status_meta(slugs_to_check)
        if new_status:
            new_is_terminal = sm.get(new_status, {}).get("is_terminal", False)
            new_sort_order  = sm.get(new_status, {}).get("sort_order",  0)
        if old_status:
            old_is_terminal = sm.get(old_status, {}).get("is_terminal", False)
            old_sort_order  = sm.get(old_status, {}).get("sort_order",  0)
        label_map = {slug: info.get("label", slug) for slug, info in sm.items()}
    else:
        label_map = {}

    # Auto-set actual_end_date when moving to terminal status
    if new_status and new_is_terminal and not old_task.get("actual_end_date") and "actual_end_date" not in patch:
        patch["actual_end_date"] = datetime.now(timezone.utc).date().isoformat()
    elif new_status and not new_is_terminal:
        if "actual_end_date" not in patch:
            patch["actual_end_date"] = None

    # Auto-set start_date when first moving away from initial status (task is being worked on)
    if new_status and not old_task.get("start_date") and "start_date" not in patch and not new_is_terminal:
        patch["start_date"] = datetime.now(timezone.utc).date().isoformat()

    patch["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        supabase_req("PATCH", "/tasks", data=patch, params={"id": f"eq.{task_id}"})
    except Exception as exc:
        current_app.logger.error("api_update_task patch failed: %s", exc)
        return jsonify({"error": "Update failed"}), 500

    # Post movement comment when status changes
    if new_status and old_status and new_status != old_status:
        old_label = label_map.get(old_status, old_status)
        new_label = label_map.get(new_status, new_status)
        try:
            supabase_req("POST", "/task_activity_logs", data={
                "task_id":  task_id,
                "username": admin_username,
                "message":  f"Status: {old_label} → {new_label}",
            }, extra_headers={"Prefer": "return=representation"})
        except Exception as exc:
            current_app.logger.warning("api_update_task: movement log failed: %s", exc)

    # Handle linked issue side-effects when task reaches terminal status
    issue = None
    issue_id = old_task.get("issue_id")
    if issue_id:
        try:
            issue_rows = supabase_req("GET", "/issues", params={"id": f"eq.{issue_id}", "select": "*"})
            issue = issue_rows[0] if issue_rows else None
        except Exception as exc:
            current_app.logger.warning("api_update_task: could not fetch linked issue: %s", exc)

    task_action_ids  = patch.get("resolution_action_ids") or []
    task_attach_urls = [u for u in (patch.get("resolution_attachment_urls") or []) if u]
    task_res_notes   = (patch.get("resolution_notes") or "").strip() or None

    if new_status and new_is_terminal and not old_is_terminal and issue:
        # Cascade resolve linked issue if not already terminal
        issue_status = issue.get("status", "")
        if issue_status not in ("resolved", "closed"):
            try:
                cascade_patch = {
                    "status":                     "resolved",
                    "resolution_action_ids":      task_action_ids or None,
                    "resolution_attachment_urls": task_attach_urls or None,
                }
                if task_res_notes:
                    cascade_patch["resolution_notes"] = task_res_notes
                supabase_req("PATCH", "/issues", data=cascade_patch, params={"id": f"eq.{issue_id}"})
                task_action_names = resolve_action_names(task_action_ids)
                try:
                    send_issue_resolved_email(
                        issue, task_res_notes or "", admin_username, "resolved",
                        action_names=task_action_names, attachment_urls=task_attach_urls,
                    )
                except Exception as email_exc:
                    current_app.logger.error("send_issue_resolved_email failed: %s", email_exc)
                try:
                    assignee = old_task.get("assigned_to") or admin_username
                    _cp = [f"Linked task marked as done by {assignee}."]
                    if task_res_notes:
                        _cp.append(f"\nResolution notes: {task_res_notes}")
                    if task_action_names:
                        _cp.append(f"\nActions taken: {', '.join(task_action_names)}")
                    supabase_req("POST", "/issue_comments", data={
                        "issue_id": issue_id,
                        "username": admin_username,
                        "comment":  "\n".join(_cp),
                    }, extra_headers={"Prefer": "return=representation"})
                except Exception as exc:
                    current_app.logger.warning("api_update_task: auto-comment failed: %s", exc)
            except Exception as exc:
                current_app.logger.error("api_update_task: cascade resolve issue failed: %s", exc)

    # Send task status email on forward status transitions
    if new_status and old_status and new_status != old_status:
        if new_sort_order > old_sort_order and issue:
            try:
                email_action_names = resolve_action_names(task_action_ids) if new_is_terminal else []
                send_task_status_email(
                    old_task, issue, old_status, new_status, admin_username,
                    action_names=email_action_names, attachment_urls=task_attach_urls if new_is_terminal else [],
                )
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
