from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify, render_template, current_app

from services.supabase import supabase_req
from services.guards import _require_developer
from services.sites import _invalidate_sites_cache
from services.email import send_issue_resolved_email

developer_bp = Blueprint("developer", __name__)

_DEV_STATUS_LABEL = {
    "pending": "Pending",
    "ongoing": "Ongoing",
    "coding":  "Coding",
    "testing": "Testing",
    "done":    "Done",
}


@developer_bp.get("/developer")
def developer_page():
    return render_template("developer.html")


@developer_bp.get("/api/dev/items")
def dev_get_items():
    _, err = _require_developer()
    if err:
        return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/dev_items", params={
            "select": "*",
            "order":  "created_at.asc",
        })
        return jsonify(rows)
    except Exception as exc:
        current_app.logger.error("dev_get_items failed: %s", exc)
        return jsonify({"error": "Failed to fetch items"}), 500


@developer_bp.post("/api/dev/items")
def dev_create_item():
    username, err = _require_developer()
    if err:
        return jsonify(err[0]), err[1]
    data  = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "Title is required"}), 400
    item = {
        "title":              title,
        "description":        (data.get("description") or "").strip() or None,
        "status":             "pending",
        "system_id":          data.get("system_id") or None,
        "start_date":         data.get("start_date") or None,
        "estimated_end_date": data.get("estimated_end_date") or None,
        "dev_item_type":      (data.get("dev_item_type") or "").strip() or None,
        "created_by":         username,
    }
    try:
        rows    = supabase_req("POST", "/dev_items", data=item)
        created = rows[0] if rows else {}
        if created.get("id"):
            try:
                supabase_req("POST", "/dev_item_logs", data={
                    "item_id":     created["id"],
                    "username":    username,
                    "from_status": None,
                    "to_status":   "pending",
                })
            except Exception as exc:
                current_app.logger.warning("dev_create_item: movement log failed: %s", exc)
        return jsonify(created), 201
    except Exception as exc:
        current_app.logger.error("dev_create_item failed: %s", exc)
        return jsonify({"error": "Failed to create item"}), 500


@developer_bp.route("/api/dev/items/<string:item_id>", methods=["PATCH"])
def dev_update_item(item_id):
    dev_username, err = _require_developer()
    if err:
        return jsonify(err[0]), err[1]
    data    = request.get_json(silent=True) or {}
    remarks = (data.get("remarks") or "").strip()
    allowed = {"title", "description", "status", "system_id", "start_date", "estimated_end_date", "actual_end_date", "dev_item_type"}
    patch   = {k: v for k, v in data.items() if k in allowed}
    if "status" in patch and patch["status"] not in ("pending", "ongoing", "coding", "testing", "done"):
        return jsonify({"error": "Invalid status"}), 400
    if not patch:
        return jsonify({"error": "No valid fields to update"}), 400

    old_status = None
    if "status" in patch:
        try:
            existing = supabase_req("GET", "/dev_items", params={"id": f"eq.{item_id}", "select": "status"})
            if existing:
                old_status = existing[0].get("status")
        except Exception:
            pass

    becoming_done = patch.get("status") == "done" and old_status != "done"

    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        rows = supabase_req("PATCH", "/dev_items", data=patch, params={"id": f"eq.{item_id}"})
    except Exception as exc:
        current_app.logger.error("dev_update_item failed: %s", exc)
        return jsonify({"error": "Failed to update item"}), 500

    # Log status movement
    new_status = patch.get("status")
    if new_status and old_status != new_status:
        try:
            supabase_req("POST", "/dev_item_logs", data={
                "item_id":     item_id,
                "username":    dev_username,
                "from_status": old_status,
                "to_status":   new_status,
            })
        except Exception as exc:
            current_app.logger.warning("dev_update_item: movement log failed: %s", exc)
        try:
            from_lbl = _DEV_STATUS_LABEL.get(old_status, old_status) if old_status else "—"
            to_lbl   = _DEV_STATUS_LABEL.get(new_status, new_status)
            supabase_req("POST", "/dev_activity_logs", data={
                "item_id":  item_id,
                "username": dev_username,
                "message":  f"{dev_username} moved this from {from_lbl} to {to_lbl}",
            })
        except Exception as exc:
            current_app.logger.warning("dev_update_item: activity log failed: %s", exc)

    if becoming_done:
        try:
            linked = supabase_req("GET", "/issues", params={
                "dev_item_id": f"eq.{item_id}",
                "select":      "*",
            })
            if linked:
                issue = linked[0]
                if issue.get("status") not in ("resolved", "closed"):
                    dev_row = supabase_req("GET", "/users", params={
                        "username": f"eq.{dev_username}",
                        "select":   "first_name,last_name",
                    })
                    resolver_name = ""
                    if dev_row:
                        u = dev_row[0]
                        resolver_name = f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip() or dev_username
                    issue_patch = {
                        "status":           "resolved",
                        "resolution_notes": remarks or None,
                        "resolved_by":      resolver_name or None,
                        "resolved_at":      datetime.now(timezone.utc).isoformat(),
                    }
                    supabase_req("PATCH", "/issues", data=issue_patch, params={"id": f"eq.{issue['id']}"})
                    send_issue_resolved_email(issue, remarks, resolver_name, "resolved")
        except Exception as exc:
            current_app.logger.error("dev_update_item issue cascade failed: %s", exc)

    return jsonify(rows[0] if rows else {})


@developer_bp.delete("/api/dev/items/<string:item_id>")
def dev_delete_item(item_id):
    _, err = _require_developer()
    if err:
        return jsonify(err[0]), err[1]
    try:
        supabase_req("DELETE", "/dev_items", params={"id": f"eq.{item_id}"})
        return jsonify({"success": True})
    except Exception as exc:
        current_app.logger.error("dev_delete_item failed: %s", exc)
        return jsonify({"error": "Failed to delete item"}), 500


@developer_bp.get("/api/dev/items/archive")
def dev_get_archive():
    _, err = _require_developer()
    if err:
        return jsonify(err[0]), err[1]
    try:
        weeks = min(max(int(request.args.get("weeks", 2)), 1), 52)
    except (ValueError, TypeError):
        weeks = 2
    cutoff = (datetime.now(timezone.utc) - timedelta(weeks=weeks)).date().isoformat()
    try:
        rows = supabase_req("GET", "/dev_items", params={
            "select":          "*",
            "status":          "eq.done",
            "actual_end_date": f"lt.{cutoff}",
            "order":           "actual_end_date.desc",
        })
        return jsonify(rows or [])
    except Exception as exc:
        current_app.logger.error("dev_get_archive failed: %s", exc)
        return jsonify({"error": "Failed to fetch archive"}), 500


@developer_bp.get("/api/dev/items/<string:item_id>/movement")
def dev_get_movement_logs(item_id):
    _, err = _require_developer()
    if err:
        return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/dev_item_logs", params={
            "item_id": f"eq.{item_id}",
            "select":  "*",
            "order":   "created_at.asc",
        })
        return jsonify(rows or [])
    except Exception as exc:
        current_app.logger.error("dev_get_movement_logs failed: %s", exc)
        return jsonify({"error": "Failed to fetch movement logs"}), 500


@developer_bp.get("/api/dev/items/<string:item_id>/logs")
def dev_get_logs(item_id):
    _, err = _require_developer()
    if err:
        return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/dev_activity_logs", params={
            "item_id": f"eq.{item_id}",
            "select":  "*",
            "order":   "created_at.asc",
        })
        return jsonify(rows)
    except Exception as exc:
        current_app.logger.error("dev_get_logs failed: %s", exc)
        return jsonify({"error": "Failed to fetch logs"}), 500


@developer_bp.post("/api/dev/items/<string:item_id>/logs")
def dev_add_log(item_id):
    username, err = _require_developer()
    if err:
        return jsonify(err[0]), err[1]
    data    = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    if not message:
        return jsonify({"error": "Message is required"}), 400
    raw_hours = data.get("hours_spent")
    try:
        hours_spent = float(raw_hours) if raw_hours is not None and str(raw_hours).strip() != "" else None
        if hours_spent is not None and hours_spent < 0:
            hours_spent = None
    except (ValueError, TypeError):
        hours_spent = None
    log_row = {"item_id": item_id, "username": username, "message": message}
    if hours_spent is not None:
        log_row["hours_spent"] = hours_spent
    try:
        rows = supabase_req("POST", "/dev_activity_logs", data=log_row)
        return jsonify(rows[0] if rows else {}), 201
    except Exception as exc:
        current_app.logger.error("dev_add_log failed: %s", exc)
        return jsonify({"error": "Failed to add log"}), 500


@developer_bp.get("/api/dev/systems")
def dev_get_systems():
    _, err = _require_developer()
    if err:
        return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/systems", params={
            "select": "id,name,category,primary_url,primary_label,backup_url,backup_label,sort_order,is_visible",
            "order":  "sort_order.asc,name.asc",
        })
        return jsonify(rows)
    except Exception as exc:
        current_app.logger.error("dev_get_systems failed: %s", exc)
        return jsonify({"error": "Failed to fetch systems"}), 500


@developer_bp.post("/api/dev/systems")
def dev_create_system():
    _, err = _require_developer()
    if err:
        return jsonify(err[0]), err[1]
    data     = request.get_json(silent=True) or {}
    required = ["id", "name", "category", "primary_url", "primary_label"]
    missing  = [f for f in required if not str(data.get(f, "")).strip()]
    if missing:
        return jsonify({"error": f"Missing: {', '.join(missing)}"}), 400
    if "sort_order" not in data:
        data["sort_order"] = 999
    if "is_visible" not in data:
        data["is_visible"] = True
    try:
        rows = supabase_req("POST", "/systems", data=data)
        _invalidate_sites_cache()
        return jsonify(rows[0] if rows else {}), 201
    except Exception as exc:
        current_app.logger.error("dev_create_system failed: %s", exc)
        return jsonify({"error": str(exc)}), 500


@developer_bp.get("/api/dev/members")
def dev_get_members():
    _, err = _require_developer()
    if err:
        return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/users", params={
            "or":            "(is_developer.eq.true,is_admin.eq.true)",
            "is_management": "eq.false",
            "select":        "username,first_name,last_name,display_name,avatar_url",
        })
    except Exception as exc:
        current_app.logger.error("dev_get_members failed: %s", exc)
        return jsonify({"error": "Failed to fetch members"}), 500
    return jsonify(rows or [])
