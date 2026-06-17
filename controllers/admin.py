from flask import Blueprint, request, jsonify, render_template, current_app

from services.supabase import supabase_req
from services.guards import _require_admin
from services.sites import _invalidate_sites_cache
from services.email import send_admin_granted_email, send_access_granted_email, send_access_rejected_email
from models.access import _approve_record, _reject_record

admin_bp = Blueprint("admin", __name__)


@admin_bp.get("/admin")
def admin_page():
    return render_template("admin.html")


@admin_bp.get("/api/admin/requests")
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
        current_app.logger.error("Admin requests fetch failed: %s", exc)
        return jsonify({"error": "Failed to fetch requests"}), 500


@admin_bp.get("/api/admin/users")
def admin_get_users():
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/users", params={
            "select": "username,first_name,middle_initial,last_name,display_name,avatar_url,company,department,position,email,viber_number,anydesk_id,systems,is_admin,is_developer,created_at",
            "order":  "created_at.asc",
        })
        return jsonify(rows)
    except Exception as exc:
        current_app.logger.error("Admin users fetch failed: %s", exc)
        return jsonify({"error": "Failed to fetch users"}), 500


@admin_bp.route("/api/admin/users/<string:uname>", methods=["PATCH", "DELETE"])
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

    data  = request.get_json(silent=True) or {}
    allowed = {"is_admin", "is_developer", "systems",
               "first_name", "middle_initial", "last_name", "display_name",
               "company", "department", "position", "email", "viber_number", "anydesk_id"}
    patch = {k: v for k, v in data.items() if k in allowed}
    if not patch:
        return jsonify({"error": "No valid fields to update"}), 400
    try:
        rows = supabase_req("PATCH", "/users", data=patch, params={"username": f"eq.{uname}"})
        if patch.get("is_admin") is True and rows:
            send_admin_granted_email(rows[0])
        return jsonify({"success": True})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.get("/api/admin/dev-performance")
def admin_dev_performance():
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]

    try:
        users = supabase_req("GET", "/users", params={
            "or":     "(is_developer.eq.true,is_admin.eq.true)",
            "select": "username,first_name,last_name,display_name,avatar_url,company,department,position,email,is_admin,is_developer",
        })
    except Exception as exc:
        current_app.logger.error("admin_dev_performance users: %s", exc)
        return jsonify({"error": "Failed to fetch developers"}), 500

    try:
        items = supabase_req("GET", "/dev_items", params={
            "select": "id,title,status,system_id,dev_item_type,start_date,estimated_end_date,actual_end_date,created_by,created_at",
            "order":  "created_at.desc",
        })
    except Exception as exc:
        current_app.logger.error("admin_dev_performance items: %s", exc)
        return jsonify({"error": "Failed to fetch dev items"}), 500

    try:
        systems = supabase_req("GET", "/systems", params={"select": "id,name"})
        sys_map = {s["id"]: s["name"] for s in (systems or [])}
    except Exception:
        sys_map = {}

    items_by_dev = {}
    for item in (items or []):
        key = item.get("created_by") or ""
        items_by_dev.setdefault(key, []).append(item)

    STATUSES = ("pending", "ongoing", "coding", "testing", "done")
    result = []
    for user in (users or []):
        uname      = user["username"]
        user_items = items_by_dev.get(uname, [])
        counts     = {s: 0 for s in STATUSES}
        for item in user_items:
            s = item.get("status") or ""
            if s in counts:
                counts[s] += 1
        counts["total"] = sum(counts[s] for s in STATUSES)

        sys_ids   = {item["system_id"] for item in user_items if item.get("system_id")}
        sys_names = sorted(sys_map.get(sid, sid) for sid in sys_ids)

        enriched = [{
            "id":                 i["id"],
            "title":              i.get("title") or "",
            "status":             i.get("status") or "",
            "dev_item_type":      i.get("dev_item_type") or "",
            "system_name":        sys_map.get(i["system_id"], "") if i.get("system_id") else "",
            "start_date":         i.get("start_date") or "",
            "estimated_end_date": i.get("estimated_end_date") or "",
            "actual_end_date":    i.get("actual_end_date") or "",
            "created_at":         i.get("created_at") or "",
        } for i in user_items]

        result.append({
            "username":     uname,
            "first_name":   user.get("first_name") or "",
            "last_name":    user.get("last_name") or "",
            "display_name": user.get("display_name") or "",
            "avatar_url":   user.get("avatar_url") or "",
            "email":        user.get("email") or "",
            "company":      user.get("company") or "",
            "department":   user.get("department") or "",
            "position":     user.get("position") or "",
            "is_admin":     bool(user.get("is_admin")),
            "is_developer": bool(user.get("is_developer")),
            "counts":       counts,
            "systems":      sys_names,
            "items":        enriched,
        })

    result.sort(key=lambda u: (-u["counts"]["total"], (u["first_name"] + u["last_name"]).lower()))
    return jsonify(result)


@admin_bp.get("/api/admin/systems")
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


@admin_bp.post("/api/admin/systems")
def admin_create_system():
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]
    data    = request.get_json(silent=True) or {}
    is_task = bool(data.get("is_task", False))
    required = ["id", "name", "category"] if is_task else ["id", "name", "category", "primary_url", "primary_label"]
    missing  = [f for f in required if not str(data.get(f, "")).strip()]
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


@admin_bp.route("/api/admin/systems/<string:system_id>", methods=["PATCH", "DELETE"])
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

    data    = request.get_json(silent=True) or {}
    allowed = {"name", "category", "primary_url", "primary_label", "backup_url", "backup_label", "sort_order", "is_visible", "is_task"}
    patch   = {k: v for k, v in data.items() if k in allowed}
    if not patch:
        return jsonify({"error": "No valid fields"}), 400
    try:
        supabase_req("PATCH", "/systems", data=patch, params={"id": f"eq.{system_id}"})
        _invalidate_sites_cache()
        return jsonify({"success": True})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.post("/api/admin/requests/<string:request_id>/approve")
def admin_approve_request(request_id):
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]

    try:
        rows = supabase_req("GET", "/access_requests", params={"id": f"eq.{request_id}", "select": "*"})
    except Exception:
        return jsonify({"error": "Failed to fetch request"}), 500

    if not rows:
        return jsonify({"error": "Request not found"}), 404

    record = rows[0]
    if record["status"] != "pending":
        return jsonify({"error": f"Request is already {record['status']}"}), 409

    is_additional  = bool(record.get("username"))
    username, err  = _approve_record(record)
    if err:
        return jsonify({"error": err}), 500

    send_access_granted_email(record, is_additional=is_additional)
    return jsonify({"success": True, "username": username})


@admin_bp.post("/api/admin/requests/<string:request_id>/reject")
def admin_reject_request(request_id):
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]

    try:
        rows = supabase_req("GET", "/access_requests", params={"id": f"eq.{request_id}", "select": "*"})
    except Exception:
        return jsonify({"error": "Failed to fetch request"}), 500

    if not rows:
        return jsonify({"error": "Request not found"}), 404

    record = rows[0]
    if record["status"] != "pending":
        return jsonify({"error": f"Request is already {record['status']}"}), 409

    body    = request.get_json(silent=True) or {}
    remarks = (body.get("remarks") or "").strip() or None

    ok, reject_err = _reject_record(request_id, remarks)
    if reject_err:
        return jsonify({"error": reject_err}), 500

    send_access_rejected_email(record, remarks)
    return jsonify({"success": True})
