import time
import requests as http_requests

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
            "select": "username,first_name,middle_initial,last_name,display_name,avatar_url,company,department,position,email,viber_number,anydesk_id,systems,is_admin,is_developer,is_management,created_at",
            "order":  "created_at.asc",
        })
        return jsonify(rows)
    except Exception as exc:
        current_app.logger.error("Admin users fetch failed: %s", exc)
        return jsonify({"error": "Failed to fetch users"}), 500


@admin_bp.post("/api/admin/users")
def admin_create_user():
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]

    data     = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip().lower()
    if not username:
        return jsonify({"error": "username is required"}), 400

    try:
        existing = supabase_req("GET", "/users", params={"username": f"eq.{username}", "select": "username"})
        if existing:
            return jsonify({"error": f"Username '{username}' is already taken"}), 409
    except Exception:
        return jsonify({"error": "Failed to check username availability"}), 500

    payload = {"username": username, "systems": data.get("systems", []),
                "is_admin":      bool(data.get("is_admin",      False)),
                "is_developer":  bool(data.get("is_developer",  False)),
                "is_management": bool(data.get("is_management", False))}
    for field in ("first_name", "middle_initial", "last_name", "display_name",
                  "company", "department", "position", "email", "viber_number", "anydesk_id"):
        val = str(data.get(field, "")).strip()
        if val:
            payload[field] = val

    try:
        rows = supabase_req("POST", "/users", data=payload,
                            extra_headers={"Prefer": "return=representation"})
        return jsonify(rows[0] if rows else {}), 201
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.get("/api/admin/users/search")
def admin_search_user_names():
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]

    q = request.args.get("q", "").strip()
    if len(q) < 2:
        return jsonify([])

    try:
        rows = supabase_req("GET", "/access_requests", params={
            "or":    f"(first_name.ilike.*{q}*,last_name.ilike.*{q}*)",
            "select": "first_name,middle_initial,last_name,email,company,department,position",
            "order":  "created_at.desc",
            "limit":  "10",
        })
        seen, results = set(), []
        for r in (rows or []):
            key = (r.get("first_name", ""), r.get("last_name", ""), r.get("email", ""))
            if key not in seen:
                seen.add(key)
                results.append(r)
        return jsonify(results)
    except Exception:
        return jsonify([])


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
    allowed = {"is_admin", "is_developer", "is_management", "systems",
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
            "or":            "(is_developer.eq.true,is_admin.eq.true)",
            "is_management": "eq.false",
            "select":        "username,first_name,last_name,display_name,avatar_url,company,department,position,email,is_admin,is_developer",
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
    allowed = {"name", "category", "primary_url", "primary_label", "backup_url", "backup_label", "sort_order", "is_visible", "is_task", "tags"}
    patch   = {k: v for k, v in data.items() if k in allowed}
    if not patch:
        return jsonify({"error": "No valid fields"}), 400
    try:
        supabase_req("PATCH", "/systems", data=patch, params={"id": f"eq.{system_id}"})
        _invalidate_sites_cache()
        return jsonify({"success": True})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.get("/api/admin/systems/<string:system_id>/ping")
def ping_system(system_id):
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]

    try:
        rows = supabase_req("GET", "/systems", params={"id": f"eq.{system_id}", "select": "id,name,primary_url,backup_url"})
    except Exception:
        return jsonify({"error": "Failed to fetch system"}), 500

    if not rows:
        return jsonify({"error": "System not found"}), 404

    system = rows[0]
    url = system.get("primary_url") or system.get("backup_url")
    if not url:
        return jsonify({"id": system_id, "name": system.get("name"), "status": "no_url", "error": "No URL configured"}), 200

    t0 = time.monotonic()
    try:
        resp = http_requests.head(url, timeout=8, allow_redirects=True)
        if resp.status_code == 405:
            resp = http_requests.get(url, timeout=8, allow_redirects=True, stream=True)
        latency_ms = round((time.monotonic() - t0) * 1000)
        status = "ok" if resp.status_code < 500 else "error"
        return jsonify({
            "id":          system_id,
            "name":        system.get("name"),
            "url":         url,
            "status":      status,
            "http_status": resp.status_code,
            "latency_ms":  latency_ms,
        })
    except http_requests.Timeout:
        latency_ms = round((time.monotonic() - t0) * 1000)
        return jsonify({"id": system_id, "name": system.get("name"), "url": url, "status": "timeout", "latency_ms": latency_ms})
    except Exception as exc:
        latency_ms = round((time.monotonic() - t0) * 1000)
        return jsonify({"id": system_id, "name": system.get("name"), "url": url, "status": "down", "latency_ms": latency_ms, "error": str(exc)})


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


# ── Config: Companies ────────────────────────────────────────────────────────

@admin_bp.get("/api/admin/config/companies")
def config_list_companies():
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/companies", params={"select": "*", "order": "name.asc"})
        return jsonify(rows or [])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.post("/api/admin/config/companies")
def config_create_company():
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    data = request.get_json(silent=True) or {}
    code = str(data.get("company_code", "")).strip().upper()
    name = str(data.get("name", "")).strip()
    if not code or not name:
        return jsonify({"error": "company_code and name are required"}), 400
    try:
        rows = supabase_req("POST", "/companies", data={"company_code": code, "name": name},
                            extra_headers={"Prefer": "return=representation"})
        return jsonify(rows[0] if rows else {}), 201
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/api/admin/config/companies/<string:code>", methods=["PATCH", "DELETE"])
def config_update_company(code):
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    if request.method == "DELETE":
        try:
            supabase_req("DELETE", "/companies", params={"company_code": f"eq.{code}"})
            return jsonify({"success": True})
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500
    data  = request.get_json(silent=True) or {}
    patch = {k: str(data[k]).strip() for k in ("name",) if k in data and str(data[k]).strip()}
    if not patch:
        return jsonify({"error": "Nothing to update"}), 400
    try:
        supabase_req("PATCH", "/companies", data=patch, params={"company_code": f"eq.{code}"})
        return jsonify({"success": True})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ── Config: Request Categories ────────────────────────────────────────────────

@admin_bp.get("/api/admin/config/request-categories")
def config_list_request_categories():
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/request_category", params={"select": "*", "order": "category_id.asc"})
        return jsonify(rows or [])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.post("/api/admin/config/request-categories")
def config_create_request_category():
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    data = request.get_json(silent=True) or {}
    name = str(data.get("category_name", "")).strip()
    if not name:
        return jsonify({"error": "category_name is required"}), 400
    payload = {
        "category_name":  name,
        "category_desc":  str(data.get("category_desc", "")).strip() or None,
        "category_group": str(data.get("category_group", "")).strip() or None,
    }
    try:
        rows = supabase_req("POST", "/request_category", data=payload,
                            extra_headers={"Prefer": "return=representation"})
        return jsonify(rows[0] if rows else {}), 201
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/api/admin/config/request-categories/<int:cat_id>", methods=["PATCH", "DELETE"])
def config_update_request_category(cat_id):
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    if request.method == "DELETE":
        try:
            supabase_req("DELETE", "/request_category", params={"category_id": f"eq.{cat_id}"})
            return jsonify({"success": True})
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500
    data = request.get_json(silent=True) or {}
    patch = {}
    if "category_name"  in data: patch["category_name"]  = str(data["category_name"]).strip()
    if "category_desc"  in data: patch["category_desc"]  = str(data["category_desc"]).strip() or None
    if "category_group" in data: patch["category_group"] = str(data["category_group"]).strip() or None
    if not patch:
        return jsonify({"error": "Nothing to update"}), 400
    try:
        supabase_req("PATCH", "/request_category", data=patch, params={"category_id": f"eq.{cat_id}"})
        return jsonify({"success": True})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ── Config: Request Types ─────────────────────────────────────────────────────

@admin_bp.get("/api/admin/config/request-types")
def config_list_request_types():
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/request_type", params={"select": "*", "order": "request_category.asc,id.asc"})
        return jsonify(rows or [])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.post("/api/admin/config/request-types")
def config_create_request_type():
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    data = request.get_json(silent=True) or {}
    cat  = str(data.get("request_category", "")).strip()
    typ  = str(data.get("request_type", "")).strip()
    if not cat or not typ:
        return jsonify({"error": "request_category and request_type are required"}), 400
    payload = {
        "request_category": cat,
        "request_type":     typ,
        "is_visible":       bool(data.get("is_visible", True)),
    }
    try:
        rows = supabase_req("POST", "/request_type", data=payload,
                            extra_headers={"Prefer": "return=representation"})
        return jsonify(rows[0] if rows else {}), 201
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/api/admin/config/request-types/<int:type_id>", methods=["PATCH", "DELETE"])
def config_update_request_type(type_id):
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    if request.method == "DELETE":
        try:
            supabase_req("DELETE", "/request_type", params={"id": f"eq.{type_id}"})
            return jsonify({"success": True})
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500
    data = request.get_json(silent=True) or {}
    patch = {}
    if "request_category" in data: patch["request_category"] = str(data["request_category"]).strip()
    if "request_type"     in data: patch["request_type"]     = str(data["request_type"]).strip()
    if "is_visible"       in data: patch["is_visible"]       = bool(data["is_visible"])
    if not patch:
        return jsonify({"error": "Nothing to update"}), 400
    try:
        supabase_req("PATCH", "/request_type", data=patch, params={"id": f"eq.{type_id}"})
        return jsonify({"success": True})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ── Config: Non-Software Items ────────────────────────────────────────────────

@admin_bp.get("/api/admin/config/non-software-items")
def config_list_non_software_items():
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/non_software_items", params={"select": "*", "order": "category.asc,id.asc"})
        return jsonify(rows or [])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.post("/api/admin/config/non-software-items")
def config_create_non_software_item():
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    data   = request.get_json(silent=True) or {}
    cat    = str(data.get("category", "")).strip()
    subcat = str(data.get("subcategory", "")).strip()
    if not cat or not subcat:
        return jsonify({"error": "category and subcategory are required"}), 400
    payload = {
        "category":   cat,
        "subcategory": subcat,
        "is_visible": bool(data.get("is_visible", True)),
    }
    try:
        rows = supabase_req("POST", "/non_software_items", data=payload,
                            extra_headers={"Prefer": "return=representation"})
        return jsonify(rows[0] if rows else {}), 201
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/api/admin/config/non-software-items/<int:item_id>", methods=["PATCH", "DELETE"])
def config_update_non_software_item(item_id):
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    if request.method == "DELETE":
        try:
            supabase_req("DELETE", "/non_software_items", params={"id": f"eq.{item_id}"})
            return jsonify({"success": True})
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500
    data = request.get_json(silent=True) or {}
    patch = {}
    if "category"    in data: patch["category"]    = str(data["category"]).strip()
    if "subcategory" in data: patch["subcategory"] = str(data["subcategory"]).strip()
    if "is_visible"  in data: patch["is_visible"]  = bool(data["is_visible"])
    if not patch:
        return jsonify({"error": "Nothing to update"}), 400
    try:
        supabase_req("PATCH", "/non_software_items", data=patch, params={"id": f"eq.{item_id}"})
        return jsonify({"success": True})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ── Config: Departments ──────────────────────────────────────────────────

@admin_bp.get("/api/admin/config/departments")
def config_list_departments():
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/departments", params={"select": "*", "order": "department_name.asc"})
        return jsonify(rows or [])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.post("/api/admin/config/departments")
def config_create_department():
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    data = request.get_json(silent=True) or {}
    code = str(data.get("department_code", "")).strip().upper()
    name = str(data.get("department_name", "")).strip()
    if not code or not name:
        return jsonify({"error": "department_code and department_name are required"}), 400
    payload = {
        "department_code": code,
        "department_name": name,
        "department_desc": str(data.get("department_desc", "")).strip() or None,
        "is_active":       bool(data.get("is_active", True)),
    }
    try:
        rows = supabase_req("POST", "/departments", data=payload,
                            extra_headers={"Prefer": "return=representation"})
        return jsonify(rows[0] if rows else {}), 201
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/api/admin/config/departments/<int:dept_id>", methods=["PATCH", "DELETE"])
def config_update_department(dept_id):
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    if request.method == "DELETE":
        try:
            supabase_req("DELETE", "/departments", params={"department_id": f"eq.{dept_id}"})
            return jsonify({"success": True})
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500
    data  = request.get_json(silent=True) or {}
    patch = {}
    if "department_name" in data: patch["department_name"] = str(data["department_name"]).strip()
    if "department_code" in data: patch["department_code"] = str(data["department_code"]).strip().upper()
    if "department_desc" in data: patch["department_desc"] = str(data["department_desc"]).strip() or None
    if "is_active"       in data: patch["is_active"]       = bool(data["is_active"])
    if not patch:
        return jsonify({"error": "Nothing to update"}), 400
    try:
        supabase_req("PATCH", "/departments", data=patch, params={"department_id": f"eq.{dept_id}"})
        return jsonify({"success": True})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ── Config: Brands ───────────────────────────────────────────────────────────

@admin_bp.get("/api/admin/config/brands")
def config_list_brands():
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/brands", params={"select": "*", "order": "brand_name.asc"})
        return jsonify(rows or [])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.post("/api/admin/config/brands")
def config_create_brand():
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    data = request.get_json(silent=True) or {}
    code = str(data.get("brand_code", "")).strip().upper()
    name = str(data.get("brand_name", "")).strip()
    if not code or not name:
        return jsonify({"error": "brand_code and brand_name are required"}), 400
    payload = {
        "brand_code":    code,
        "brand_name":    name,
        "brand_initial": str(data.get("brand_initial", "")).strip().upper(),
        "brand_desc":    str(data.get("brand_desc", "")).strip(),
    }
    try:
        rows = supabase_req("POST", "/brands", data=payload,
                            extra_headers={"Prefer": "return=representation"})
        return jsonify(rows[0] if rows else {}), 201
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/api/admin/config/brands/<string:code>", methods=["PATCH", "DELETE"])
def config_update_brand(code):
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    if request.method == "DELETE":
        try:
            supabase_req("DELETE", "/brands", params={"brand_code": f"eq.{code}"})
            return jsonify({"success": True})
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500
    data  = request.get_json(silent=True) or {}
    patch = {}
    if "brand_name"    in data: patch["brand_name"]    = str(data["brand_name"]).strip()
    if "brand_initial" in data: patch["brand_initial"] = str(data["brand_initial"]).strip().upper()
    if "brand_desc"    in data: patch["brand_desc"]    = str(data["brand_desc"]).strip()
    if not patch:
        return jsonify({"error": "Nothing to update"}), 400
    try:
        supabase_req("PATCH", "/brands", data=patch, params={"brand_code": f"eq.{code}"})
        return jsonify({"success": True})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


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
