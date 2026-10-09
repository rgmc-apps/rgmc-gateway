import os
import re
import uuid
from collections import defaultdict
from datetime import datetime, timezone
import requests as http_requests

from flask import Blueprint, request, jsonify, render_template, current_app
from werkzeug.security import generate_password_hash

from config import SUPABASE_URL, SUPABASE_SERVICE_KEY
from services.supabase import supabase_req, email_taken, get_app_setting, set_app_setting
from services.guards import _require_admin, _require_dept_head
from services.sites import _invalidate_sites_cache, ping_system_by_id, SystemNotFoundError
from services.shift import validate_shift_fields
from services.dev_performance import build_dev_performance_report
from services.email import send_admin_granted_email, send_access_granted_email, send_access_rejected_email, send_password_changed_email, send_user_created_email, send_developer_promoted_email
from services import github as github_service
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
    _, _, err = _require_dept_head()
    if err:
        return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/users", params={
            "select": "username,first_name,middle_initial,last_name,display_name,avatar_url,company,department,position,email,viber_number,anydesk_id,github_username,systems,is_admin,is_developer,is_management,is_department_head,created_at,shift_days,shift_start,shift_end",
            "order":  "created_at.asc",
        })
        return jsonify(rows)
    except Exception as exc:
        current_app.logger.error("Admin users fetch failed: %s", exc)
        return jsonify({"error": "Failed to fetch users"}), 500


@admin_bp.get("/api/admin/users/suggest-username")
def admin_suggest_username():
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]

    first = str(request.args.get("first", "")).strip()
    last  = str(request.args.get("last",  "")).strip()
    mi    = str(request.args.get("mi",    "")).strip()
    if not first or not last:
        return jsonify({"username": ""})

    def clean(s):
        return re.sub(r"[^a-z0-9]", "", s.lower())

    try:
        rows = supabase_req("GET", "/users", params={"select": "username"})
        used = {r["username"] for r in (rows or []) if r.get("username")}
    except Exception:
        used = set()

    words          = [w for w in first.split() if w]
    first_word     = clean(words[0]) if words else ""
    other_initials = "".join(clean(w)[0] for w in words[1:] if clean(w))
    mi_clean       = clean(mi[:1]) if mi else ""
    clean_last     = clean(last.replace(" ", ""))

    for n in range(1, len(first_word) + 1):
        candidate = first_word[:n] + other_initials + mi_clean + clean_last
        if candidate and candidate not in used:
            return jsonify({"username": candidate})

    base = (first_word + other_initials + mi_clean + clean_last) or "user"
    i = 1
    while f"{base}{i}" in used:
        i += 1
    return jsonify({"username": f"{base}{i}"})


@admin_bp.post("/api/admin/users")
def admin_create_user():
    admin_username, err = _require_admin()
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

    email = str(data.get("email", "")).strip()
    if email and email_taken(email):
        return jsonify({"error": f"Email '{email}' is already registered to another user"}), 409

    payload = {"username": username, "systems": data.get("systems", []),
                "is_admin":            bool(data.get("is_admin",            False)),
                "is_developer":        bool(data.get("is_developer",        False)),
                "is_management":       bool(data.get("is_management",       False)),
                "is_department_head":  bool(data.get("is_department_head",  False))}
    for field in ("first_name", "middle_initial", "last_name", "display_name",
                  "company", "department", "position", "email", "viber_number", "anydesk_id"):
        val = str(data.get(field, "")).strip()
        if val:
            payload[field] = val

    new_password = str(data.get("password", "")).strip()
    if new_password:
        payload["password_hash"] = generate_password_hash(new_password)

    try:
        rows = supabase_req("POST", "/users", data=payload,
                            extra_headers={"Prefer": "return=representation"})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    if rows and bool(data.get("send_email")):
        try:
            admin_rows = supabase_req("GET", "/users", params={
                "username": f"eq.{admin_username}",
                "select":   "first_name,last_name,display_name",
            })
            if admin_rows:
                a = admin_rows[0]
                admin_name = a.get("display_name") or f"{a.get('first_name','')} {a.get('last_name','')}".strip() or admin_username
            else:
                admin_name = admin_username
        except Exception:
            admin_name = admin_username
        try:
            send_user_created_email(rows[0], admin_name, password=new_password or None)
        except Exception as exc:
            current_app.logger.error("send_user_created_email failed: %s", exc)

    return jsonify(rows[0] if rows else {}), 201


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
    admin_username, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]

    if request.method == "DELETE":
        try:
            supabase_req("DELETE", "/users", params={"username": f"eq.{uname}"})
            return jsonify({"success": True})
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

    data  = request.get_json(silent=True) or {}
    allowed = {"is_admin", "is_developer", "is_management", "is_department_head", "systems",
               "first_name", "middle_initial", "last_name", "display_name",
               "company", "department", "position", "email", "viber_number", "anydesk_id",
               "github_username"}
    patch = {k: v for k, v in data.items() if k in allowed}

    if "email" in patch:
        new_email = str(patch["email"] or "").strip()
        if new_email and email_taken(new_email, exclude_username=uname):
            return jsonify({"error": f"Email '{new_email}' is already registered to another user"}), 409

    try:
        patch.update(validate_shift_fields(data))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    new_password = str(data.get("password", "")).strip()
    if new_password:
        patch["password_hash"] = generate_password_hash(new_password)

    if not patch:
        return jsonify({"error": "No valid fields to update"}), 400
    try:
        rows = supabase_req("PATCH", "/users", data=patch,
                            params={"username": f"eq.{uname}"},
                            extra_headers={"Prefer": "return=representation"})
        if patch.get("is_admin") is True and rows:
            send_admin_granted_email(rows[0])
        if patch.get("is_developer") is True and rows:
            send_developer_promoted_email(rows[0])
        if new_password and rows:
            try:
                admin_rows = supabase_req("GET", "/users", params={
                    "username": f"eq.{admin_username}",
                    "select":   "first_name,last_name,display_name",
                })
                if admin_rows:
                    a = admin_rows[0]
                    admin_name = a.get("display_name") or f"{a.get('first_name','')} {a.get('last_name','')}".strip() or admin_username
                else:
                    admin_name = admin_username
            except Exception:
                admin_name = admin_username
            changed_at = datetime.now(timezone.utc).strftime("%B %d, %Y at %I:%M %p UTC")
            send_password_changed_email(rows[0], admin_name, changed_at)
        return jsonify({"success": True})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.get("/api/admin/dev-performance")
def admin_dev_performance():
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]
    try:
        result = build_dev_performance_report()
    except Exception as exc:
        current_app.logger.error("admin_dev_performance failed: %s", exc)
        return jsonify({"error": "Failed to fetch developer performance data"}), 500
    return jsonify(result)


@admin_bp.get("/api/admin/github-profile/<login>")
def admin_github_profile(login):
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]
    profile = github_service.fetch_public_profile(login)
    if profile is None:
        return jsonify({"error": "GitHub user not found"}), 404
    return jsonify(profile)


@admin_bp.get("/api/admin/systems")
def admin_get_systems():
    _, _, err = _require_dept_head()
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
    data       = request.get_json(silent=True) or {}
    is_task    = bool(data.get("is_task", False))
    is_windows = bool(data.get("is_windows_based", False))
    required   = ["id", "name", "category"] if (is_task or is_windows) else ["id", "name", "category", "primary_url", "primary_label"]
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
    allowed = {"name", "category", "primary_url", "primary_label", "backup_url", "backup_label", "sort_order", "is_visible", "is_helpdesk_visible", "is_task", "tags", "is_windows_based", "windows_launcher_url", "windows_manifest_url", "git_link"}
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
        result = ping_system_by_id(system_id)
    except SystemNotFoundError:
        return jsonify({"error": "System not found"}), 404
    except Exception:
        return jsonify({"error": "Failed to fetch system"}), 500
    return jsonify(result)


_WIN_BUCKET      = "system-files"
_WIN_MAX_BYTES   = 150 * 1024 * 1024  # 150 MB
_WIN_ALLOWED_EXT = {".exe", ".appref-ms", ".application", ".manifest", ".msi", ".xml"}
_WIN_CONTENT_TYPES = {
    ".exe":         "application/vnd.microsoft.portable-executable",
    ".appref-ms":   "application/x-ms-application",
    ".application": "application/x-ms-application",
    ".manifest":    "text/xml",
    ".msi":         "application/x-msi",
    ".xml":         "text/xml",
}


@admin_bp.post("/api/admin/systems/<string:system_id>/upload")
def admin_upload_system_file(system_id):
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]

    file_type = request.form.get("file_type", "").strip()
    if file_type not in ("launcher", "manifest"):
        return jsonify({"error": "file_type must be 'launcher' or 'manifest'"}), 400

    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"error": "No file provided"}), 400

    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in _WIN_ALLOWED_EXT:
        return jsonify({"error": f"Unsupported file type. Allowed: {', '.join(sorted(_WIN_ALLOWED_EXT))}"}), 400

    data = f.read()
    if len(data) > _WIN_MAX_BYTES:
        return jsonify({"error": "File too large (max 150 MB)"}), 400

    safe_name  = re.sub(r"[^a-zA-Z0-9.\-_]", "_", f.filename)
    uid        = str(uuid.uuid4())[:8]
    path       = f"{system_id}/{file_type}/{uid}_{safe_name}"
    content_type = _WIN_CONTENT_TYPES.get(ext, "application/octet-stream")

    upload_url = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/{_WIN_BUCKET}/{path}"
    try:
        resp = http_requests.put(
            upload_url,
            headers={
                "apikey":        SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type":  content_type,
            },
            data=data,
            timeout=60,
        )
        resp.raise_for_status()
    except Exception as exc:
        current_app.logger.error("Windows system file upload failed: %s", exc)
        return jsonify({"error": "Upload failed"}), 500

    public_url = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/public/{_WIN_BUCKET}/{path}"
    db_field   = "windows_launcher_url" if file_type == "launcher" else "windows_manifest_url"
    try:
        supabase_req("PATCH", "/systems", data={db_field: public_url}, params={"id": f"eq.{system_id}"})
        _invalidate_sites_cache()
    except Exception as exc:
        current_app.logger.warning("Failed to update system %s with %s URL: %s", system_id, file_type, exc)

    return jsonify({"url": public_url, "field": db_field})


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
    systems_needed = data.get("systems_needed")
    if systems_needed is not None:
        systems_needed = [str(s) for s in systems_needed if s] or None
    payload = {
        "department_code": code,
        "department_name": name,
        "department_desc": str(data.get("department_desc", "")).strip() or None,
        "is_active":       bool(data.get("is_active", True)),
        "systems_needed":  systems_needed,
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
    if "systems_needed"  in data:
        sn = data["systems_needed"]
        patch["systems_needed"] = [str(s) for s in sn if s] if sn else None
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


_CI_STOPWORDS = {
    "the","a","an","and","or","but","is","are","was","were","be","been","being",
    "to","of","in","on","at","for","with","by","from","up","down","out","off",
    "this","that","these","those","it","its","as","if","then","than","so",
    "i","you","he","she","we","they","my","your","our","their","me","us","him","her",
    "not","no","yes","do","does","did","doing","have","has","had","having",
    "can","could","will","would","shall","should","may","might","must",
    "please","need","needed","needs","issue","issues","problem","problems",
    "error","errors","system","systems","app","application","portal","request",
    "unable","cannot","cant","dont","doesnt","isnt","wont","again","also","already",
    "when","where","why","how","what","who","which","there","here","into","onto",
    "still","just","only","very","get","getting","got","make","made","using","use",
    "used","after","before","some","any","all","each","every","other","such","same",
    "own","new","old","one","two","first","second","via","per","etc","kindly",
}
_CI_WORD_RE = re.compile(r"[a-z][a-z'-]{2,}")


def _ci_tokenize(text: str) -> list[str]:
    return _CI_WORD_RE.findall((text or "").lower())


def _ci_keyword_phrases(title: str, description: str, exclude: set) -> set:
    words = [w for w in _ci_tokenize(f"{title} {description}")
             if w not in _CI_STOPWORDS and w not in exclude]
    phrases = set(words)
    for i in range(len(words) - 1):
        phrases.add(f"{words[i]} {words[i + 1]}")
    return phrases


def _ci_cluster_by_keywords(items: list, exclude: set = frozenset(), min_count: int = 2, max_clusters: int = 8) -> list:
    """Group issue items by shared significant keywords/phrases in their title+description.
    Multi-word phrases are preferred over single words so a more specific recurring
    complaint (e.g. "mode of transport") isn't buried under a generic word (e.g. "mode")."""
    phrase_issue_map = defaultdict(list)
    for it in items:
        for p in _ci_keyword_phrases(it.get("title", ""), it.get("description", ""), exclude):
            phrase_issue_map[p].append(it)

    counts = {p: len(v) for p, v in phrase_issue_map.items()}
    candidates = [p for p, c in counts.items() if c >= min_count]
    candidates.sort(key=lambda p: (-len(p.split()), -counts[p], p))

    chosen, used_issue_sets = [], []
    for p in candidates:
        issue_ids = {it.get("id") for it in phrase_issue_map[p]}
        if any(issue_ids <= s for s in used_issue_sets):
            continue
        used_issue_sets.append(issue_ids)
        chosen.append(p)
        if len(chosen) >= max_clusters:
            break

    return [
        {
            "keyword": p,
            "count":   counts[p],
            "issues": [
                {"id": it.get("id"), "ticket_number": it.get("ticket_number"),
                 "title": it.get("title"), "status": it.get("status")}
                for it in phrase_issue_map[p]
            ],
        }
        for p in chosen
    ]


@admin_bp.get("/api/admin/common-issues")
def admin_common_issues():
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]

    try:
        issues = supabase_req("GET", "/issues", params={
            "select": "id,ticket_number,title,description,status,site_name,request_category,"
                      "employee_name,company_name,resolved_by,resolved_at,resolution_notes,"
                      "resolution_action_ids,resolution_attachment_urls,created_at,assigned_to,"
                      "dev_item_id,task_id,user_task_id,is_duplicate",
            "order":  "created_at.desc",
        })
    except Exception as exc:
        current_app.logger.error("admin_common_issues: fetch failed: %s", exc)
        return jsonify({"error": "Failed to fetch issues"}), 500

    # Resolve action IDs → names in a single lookup
    action_name_map = {}
    try:
        action_rows = supabase_req("GET", "/actions", params={
            "select":    "action_id,action_name",
            "is_active": "eq.true",
        })
        action_name_map = {r["action_id"]: r["action_name"] for r in (action_rows or [])}
    except Exception:
        pass

    from services.shift import shift_age_days, fetch_shift_map
    shift_map = fetch_shift_map()

    def _age_days(iss):
        return shift_age_days(iss.get("created_at"), None, shift_map.get(iss.get("assigned_to")))

    def _res_days(iss):
        if not iss.get("resolved_at"):
            return None
        return shift_age_days(iss.get("created_at"), iss.get("resolved_at"), shift_map.get(iss.get("assigned_to")))

    def _enrich(iss):
        ids          = iss.get("resolution_action_ids") or []
        dev_item_id  = iss.get("dev_item_id")
        task_id      = iss.get("task_id")
        user_task_id = iss.get("user_task_id")
        is_dup       = bool(iss.get("is_duplicate"))
        if is_dup:
            res_type = "duplicate"
        elif dev_item_id:
            res_type = "dev_item"
        elif task_id or user_task_id:
            res_type = "task"
        else:
            res_type = "quick"
        return {
            "id":                         iss.get("id"),
            "ticket_number":              iss.get("ticket_number"),
            "title":                      iss.get("title"),
            "description":                iss.get("description"),
            "status":                     iss.get("status"),
            "employee_name":              iss.get("employee_name"),
            "company_name":               iss.get("company_name"),
            "resolved_by":                iss.get("resolved_by"),
            "resolved_at":                iss.get("resolved_at"),
            "resolution_notes":           iss.get("resolution_notes"),
            "resolution_action_names":    [action_name_map[i] for i in ids if i in action_name_map],
            "resolution_attachment_urls": [u for u in (iss.get("resolution_attachment_urls") or []) if u],
            "created_at":                 iss.get("created_at"),
            "resolution_days":            _res_days(iss),
            "dev_item_id":                dev_item_id,
            "task_id":                    task_id,
            "user_task_id":               user_task_id,
            "is_duplicate":               is_dup,
            "res_type":                   res_type,
        }

    def _new_group():
        return {
            "total": 0, "open": 0, "resolved": 0,
            "resolutions": [], "open_ages_days": [], "_items": [],
            "via_dev_item": 0, "via_task": 0, "quick_resolved": 0, "duplicates": 0,
        }

    by_system   = defaultdict(_new_group)
    by_category = defaultdict(_new_group)

    for iss in (issues or []):
        sys_key  = (iss.get("site_name") or "").strip() or "Unknown System"
        cat_key  = (iss.get("request_category") or "").strip() or "Uncategorized"
        terminal = iss.get("status") in ("resolved", "closed")

        for grp, key in ((by_system, sys_key), (by_category, cat_key)):
            grp[key]["total"] += 1
            grp[key]["_items"].append({
                "id":             iss.get("id"),
                "ticket_number":  iss.get("ticket_number"),
                "title":          iss.get("title"),
                "description":    iss.get("description"),
                "status":         iss.get("status"),
            })
            if terminal:
                grp[key]["resolved"] += 1
                enriched = _enrich(iss)
                grp[key]["resolutions"].append(enriched)
                rt = enriched["res_type"]
                if rt == "duplicate":
                    grp[key]["duplicates"] += 1
                elif rt == "dev_item":
                    grp[key]["via_dev_item"] += 1
                elif rt == "task":
                    grp[key]["via_task"] += 1
                else:
                    grp[key]["quick_resolved"] += 1
            else:
                grp[key]["open"] += 1
                age = _age_days(iss)
                if age is not None:
                    grp[key]["open_ages_days"].append(age)

    def _avg(lst):
        vals = [v for v in lst if v is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    def _sort(d):
        out = []
        for k, v in d.items():
            items = v.pop("_items")
            exclude = set(_ci_tokenize(k))
            v["keyword_clusters"] = _ci_cluster_by_keywords(items, exclude=exclude)
            out.append({"group": k, **v})
        return sorted(out, key=lambda x: x["total"], reverse=True)

    # Global stats across all issues
    all_open_ages  = [a for g in by_system.values() for a in g["open_ages_days"]]
    all_res_days   = [r["resolution_days"] for g in by_system.values()
                      for r in g["resolutions"] if r.get("resolution_days") is not None]
    global_stats = {
        "total":                sum(g["total"]          for g in by_system.values()),
        "resolved":             sum(g["resolved"]       for g in by_system.values()),
        "open":                 sum(g["open"]           for g in by_system.values()),
        "via_dev_item":         sum(g["via_dev_item"]   for g in by_system.values()),
        "via_task":             sum(g["via_task"]       for g in by_system.values()),
        "quick_resolved":       sum(g["quick_resolved"] for g in by_system.values()),
        "duplicates":           sum(g["duplicates"]     for g in by_system.values()),
        "avg_open_age_days":    _avg(all_open_ages),
        "avg_resolution_days":  _avg(all_res_days),
        "min_resolution_days":  min(all_res_days) if all_res_days else None,
        "max_resolution_days":  max(all_res_days) if all_res_days else None,
    }

    return jsonify({
        "by_system":   _sort(by_system),
        "by_category": _sort(by_category),
        "global_stats": global_stats,
    })


# ── Linked-item preview (dev item / task / user task) ────────────────────────

@admin_bp.get("/api/admin/linked/dev-item/<item_id>")
def admin_get_linked_dev_item(item_id):
    _, _, err = _require_dept_head()
    if err: return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/dev_items", params={"id": f"eq.{item_id}", "select": "*"})
        if not rows: return jsonify({"error": "Not found"}), 404
        return jsonify(rows[0])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.get("/api/admin/linked/task/<task_id>")
def admin_get_linked_task(task_id):
    _, _, err = _require_dept_head()
    if err: return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/tasks", params={"id": f"eq.{task_id}", "select": "*"})
        if not rows: return jsonify({"error": "Not found"}), 404
        return jsonify(rows[0])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.get("/api/admin/linked/user-task/<task_id>")
def admin_get_linked_user_task(task_id):
    _, _, err = _require_dept_head()
    if err: return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/user_tasks", params={"id": f"eq.{task_id}", "select": "*"})
        if not rows: return jsonify({"error": "Not found"}), 404
        return jsonify(rows[0])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.get("/api/admin/linked/epic/<epic_id>")
def admin_get_linked_epic(epic_id):
    _, _, err = _require_dept_head()
    if err: return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/epics", params={"epic_id": f"eq.{epic_id}", "select": "*"})
        if not rows: return jsonify({"error": "Not found"}), 404
        epic = rows[0]
        epic["dev_items"] = supabase_req("GET", "/dev_items", params={
            "epic_id": f"eq.{epic_id}",
            "select":  "id,dev_item_code,title,status,dev_item_type",
            "order":   "created_at.asc",
        }) or []
        return jsonify(epic)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ── Config: Actions ───────────────────────────────────────────────────────────

@admin_bp.get("/api/admin/config/actions")
def config_list_actions():
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/actions", params={"select": "*", "order": "action_id.asc"})
        return jsonify(rows or [])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.post("/api/admin/config/actions")
def config_create_action():
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    data = request.get_json(silent=True) or {}
    name = str(data.get("action_name", "")).strip()
    code = str(data.get("action_code", "")).strip().upper()
    if not name or not code:
        return jsonify({"error": "action_name and action_code are required"}), 400
    payload = {
        "action_name": name,
        "action_code": code,
        "action_desc": str(data.get("action_desc", "")).strip() or None,
        "is_active":   bool(data.get("is_active", True)),
    }
    try:
        rows = supabase_req("POST", "/actions", data=payload,
                            extra_headers={"Prefer": "return=representation"})
        return jsonify(rows[0] if rows else {}), 201
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/api/admin/config/actions/<int:action_id>", methods=["PATCH", "DELETE"])
def config_update_action(action_id):
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    if request.method == "DELETE":
        try:
            supabase_req("DELETE", "/actions", params={"action_id": f"eq.{action_id}"})
            return jsonify({"success": True})
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500
    data  = request.get_json(silent=True) or {}
    patch = {}
    if "action_name" in data:
        v = str(data["action_name"]).strip()
        if v: patch["action_name"] = v
    if "action_code" in data:
        v = str(data["action_code"]).strip().upper()
        if v: patch["action_code"] = v
    if "action_desc" in data:
        patch["action_desc"] = str(data["action_desc"]).strip() or None
    if "is_active" in data:
        patch["is_active"] = bool(data["is_active"])
    if not patch:
        return jsonify({"error": "Nothing to update"}), 400
    try:
        supabase_req("PATCH", "/actions", data=patch, params={"action_id": f"eq.{action_id}"})
        return jsonify({"success": True})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ── Config: Automation ────────────────────────────────────────────────────────

_AUTO_CONFIRM_DAYS_DEFAULT = "30"


@admin_bp.get("/api/admin/config/automation")
def config_get_automation():
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    raw = get_app_setting("auto_confirm_days", _AUTO_CONFIRM_DAYS_DEFAULT)
    try:
        days = int(raw)
    except (TypeError, ValueError):
        days = int(_AUTO_CONFIRM_DAYS_DEFAULT)
    return jsonify({"auto_confirm_days": days})


@admin_bp.post("/api/admin/config/automation")
def config_update_automation():
    admin_username, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    data = request.get_json(silent=True) or {}
    try:
        days = int(data.get("auto_confirm_days"))
    except (TypeError, ValueError):
        return jsonify({"error": "auto_confirm_days must be a whole number"}), 400
    if days < 1:
        return jsonify({"error": "auto_confirm_days must be at least 1"}), 400
    try:
        set_app_setting("auto_confirm_days", str(days), updated_by=admin_username)
        return jsonify({"success": True, "auto_confirm_days": days})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ── Config: Auto-Assign (category / request type / sub-category → person) ─────
#
# Four tables can each carry an `assigned_to_username` FK: request_category
# (broadest), request_type and the category's sub-category source — systems
# for "Software/Application", non_software_items for everything else (both
# narrower overrides). See services/auto_assign.py for the match-priority
# chain applied at ticket-creation time.

_AUTO_ASSIGN_SOFTWARE_CATEGORY = "Software/Application"

_AUTO_ASSIGN_TABLE = {
    "category":          "/request_category",
    "request_type":      "/request_type",
    "non_software_item": "/non_software_items",
    "system":            "/systems",
}
_AUTO_ASSIGN_ID_FIELD = {
    "category":          "category_id",
    "request_type":      "id",
    "non_software_item": "id",
    "system":            "id",
}
_AUTO_ASSIGN_SELECT = {
    "category":          "category_id,category_name,category_group,assigned_to_username",
    "request_type":      "id,request_type,request_category,assigned_to_username",
    "non_software_item": "id,subcategory,category,assigned_to_username",
    "system":            "id,name,assigned_to_username",
}


def _auto_assign_eligible(user_row: dict) -> bool:
    return bool(user_row.get("is_admin") or user_row.get("is_department_head") or user_row.get("is_developer"))


def _auto_assign_label(item_type: str, row: dict) -> str:
    if item_type == "category":
        return row["category_name"]
    if item_type == "request_type":
        return f"{row['request_type']} ({row['request_category']})"
    if item_type == "non_software_item":
        return f"{row['subcategory']} ({row['category']})"
    return row["name"]  # system


def _auto_assign_coerce_id(item_type: str, raw_id):
    return str(raw_id) if item_type == "system" else int(raw_id)


@admin_bp.get("/api/admin/config/auto-assign/eligible-users")
def config_auto_assign_eligible_users():
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/users", params={
            "or":     "(is_admin.eq.true,is_department_head.eq.true,is_developer.eq.true)",
            "select": "username,first_name,last_name,display_name,email,viber_number,"
                      "is_admin,is_department_head,is_developer",
            "order":  "first_name.asc",
        })
        return jsonify(rows or [])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.get("/api/admin/config/auto-assign/tree")
def config_auto_assign_tree():
    """The full category tree for the admin checkbox UI: each category node
    carries its own assignment plus its request types and sub-category items
    (systems for Software/Application, non_software_items otherwise), each
    with their own assignment."""
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    try:
        categories = supabase_req("GET", "/request_category", params={
            "select": _AUTO_ASSIGN_SELECT["category"], "order": "category_name.asc",
        }) or []
        request_types = supabase_req("GET", "/request_type", params={
            "select": _AUTO_ASSIGN_SELECT["request_type"], "order": "request_type.asc",
        }) or []
        non_software_items = supabase_req("GET", "/non_software_items", params={
            "select": _AUTO_ASSIGN_SELECT["non_software_item"], "order": "subcategory.asc",
        }) or []
        systems = supabase_req("GET", "/systems", params={
            "select": _AUTO_ASSIGN_SELECT["system"], "order": "name.asc",
        }) or []
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    rt_by_cat  = defaultdict(list)
    for rt in request_types:
        rt_by_cat[rt["request_category"]].append(rt)
    nsi_by_cat = defaultdict(list)
    for nsi in non_software_items:
        nsi_by_cat[nsi["category"]].append(nsi)

    tree = []
    for cat in categories:
        name = cat["category_name"]
        node = {
            "category_id":          cat["category_id"],
            "category_name":        name,
            "category_group":       cat.get("category_group"),
            "assigned_to_username": cat.get("assigned_to_username"),
            "request_types": [
                {"id": rt["id"], "label": rt["request_type"], "assigned_to_username": rt.get("assigned_to_username")}
                for rt in rt_by_cat.get(name, [])
            ],
        }
        if name == _AUTO_ASSIGN_SOFTWARE_CATEGORY:
            node["subcategory_type"] = "system"
            node["subcategories"] = [
                {"id": s["id"], "label": s["name"], "assigned_to_username": s.get("assigned_to_username")}
                for s in systems
            ]
        else:
            node["subcategory_type"] = "non_software_item"
            node["subcategories"] = [
                {"id": n["id"], "label": n["subcategory"], "assigned_to_username": n.get("assigned_to_username")}
                for n in nsi_by_cat.get(name, [])
            ]
        tree.append(node)
    return jsonify(tree)


@admin_bp.get("/api/admin/config/auto-assign")
def config_list_auto_assign():
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]

    grouped_items: dict[str, list] = defaultdict(list)
    try:
        for item_type, table in _AUTO_ASSIGN_TABLE.items():
            rows = supabase_req("GET", table, params={
                "select":               _AUTO_ASSIGN_SELECT[item_type],
                "assigned_to_username": "not.is.null",
            }) or []
            for r in rows:
                uname = r.get("assigned_to_username")
                if not uname:
                    continue
                grouped_items[uname].append({
                    "item_type": item_type,
                    "item_id":   r[_AUTO_ASSIGN_ID_FIELD[item_type]],
                    "label":     _auto_assign_label(item_type, r),
                })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    if not grouped_items:
        return jsonify([])

    try:
        users = supabase_req("GET", "/users", params={
            "username": "in.(" + ",".join(sorted(grouped_items.keys())) + ")",
            "select":   "username,first_name,last_name,display_name,email,viber_number",
        }) or []
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    user_map = {u["username"]: u for u in users}

    result = []
    for uname, items in grouped_items.items():
        u = user_map.get(uname, {})
        result.append({
            "username":     uname,
            "first_name":   u.get("first_name", ""),
            "last_name":    u.get("last_name", ""),
            "display_name": u.get("display_name") or "",
            "email":        u.get("email", ""),
            "viber_number": u.get("viber_number", ""),
            "items":        items,
        })
    return jsonify(result)


def _parse_auto_assign_items(raw_items):
    """Returns (items_by_type: dict[type, list[id]], error_response_or_None)."""
    items_by_type: dict[str, list] = defaultdict(list)
    for entry in (raw_items or []):
        item_type = (entry or {}).get("type")
        if item_type not in _AUTO_ASSIGN_TABLE:
            return None, ({"error": f"Invalid item type: {item_type}"}, 400)
        try:
            item_id = _auto_assign_coerce_id(item_type, entry.get("id"))
        except (TypeError, ValueError):
            return None, ({"error": f"Invalid id for {item_type}: {entry.get('id')}"}, 400)
        items_by_type[item_type].append(item_id)
    return items_by_type, None


def _validate_auto_assign_items(items_by_type: dict, allow_usernames: set[str]):
    """Returns error_response_or_None. Ensures every {type, id} exists and is
    either unassigned or already owned by one of *allow_usernames*."""
    for item_type, ids in items_by_type.items():
        if not ids:
            continue
        table    = _AUTO_ASSIGN_TABLE[item_type]
        id_field = _AUTO_ASSIGN_ID_FIELD[item_type]
        ids_csv  = ",".join(str(i) for i in ids)
        rows = supabase_req("GET", table, params={
            id_field: f"in.({ids_csv})",
            "select": f"{id_field},assigned_to_username",
        }) or []
        found_ids = {r[id_field] for r in rows}
        missing = [i for i in ids if i not in found_ids]
        if missing:
            return {"error": f"Unknown {item_type} id(s): {missing}"}, 400
        taken = [r for r in rows if r.get("assigned_to_username") and r["assigned_to_username"] not in allow_usernames]
        if taken:
            ids_str = ", ".join(str(r[id_field]) for r in taken)
            return {"error": f"Already assigned to someone else ({item_type}): {ids_str}"}, 409
    return None


def _apply_auto_assign_items(items_by_type: dict, username: str) -> None:
    for item_type, ids in items_by_type.items():
        if not ids:
            continue
        table    = _AUTO_ASSIGN_TABLE[item_type]
        id_field = _AUTO_ASSIGN_ID_FIELD[item_type]
        ids_csv  = ",".join(str(i) for i in ids)
        supabase_req("PATCH", table, data={"assigned_to_username": username},
                     params={id_field: f"in.({ids_csv})"})


def _clear_auto_assign_for_username(username: str) -> None:
    for table in _AUTO_ASSIGN_TABLE.values():
        supabase_req("PATCH", table, data={"assigned_to_username": None},
                     params={"assigned_to_username": f"eq.{username}"})


@admin_bp.post("/api/admin/config/auto-assign")
def config_create_auto_assign():
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    data     = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip().lower()
    items_by_type, perr = _parse_auto_assign_items(data.get("items"))
    if perr:
        return jsonify(perr[0]), perr[1]
    if not username or not any(items_by_type.values()):
        return jsonify({"error": "username and at least one item are required"}), 400

    try:
        user_rows = supabase_req("GET", "/users", params={
            "username": f"eq.{username}",
            "select":   "username,is_admin,is_department_head,is_developer",
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    if not user_rows:
        return jsonify({"error": "User not found"}), 404
    if not _auto_assign_eligible(user_rows[0]):
        return jsonify({"error": "Only admins, department heads, or developers can be assigned"}), 400

    try:
        bad = _validate_auto_assign_items(items_by_type, {username})
        if bad:
            return jsonify(bad[0]), bad[1]
        _apply_auto_assign_items(items_by_type, username)
        return jsonify({"success": True}), 201
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/api/admin/config/auto-assign/<string:username>", methods=["PATCH", "DELETE"])
def config_update_auto_assign(username):
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    username = username.strip().lower()

    if request.method == "DELETE":
        try:
            _clear_auto_assign_for_username(username)
            return jsonify({"success": True})
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

    data = request.get_json(silent=True) or {}
    new_username = str(data.get("username") or username).strip().lower()
    items_by_type, perr = _parse_auto_assign_items(data.get("items"))
    if perr:
        return jsonify(perr[0]), perr[1]
    if not any(items_by_type.values()):
        return jsonify({"error": "At least one item is required"}), 400

    try:
        user_rows = supabase_req("GET", "/users", params={
            "username": f"eq.{new_username}",
            "select":   "username,is_admin,is_department_head,is_developer",
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    if not user_rows:
        return jsonify({"error": "User not found"}), 404
    if not _auto_assign_eligible(user_rows[0]):
        return jsonify({"error": "Only admins, department heads, or developers can be assigned"}), 400

    try:
        bad = _validate_auto_assign_items(items_by_type, {username, new_username})
        if bad:
            return jsonify(bad[0]), bad[1]
        # Unassign everything currently held by the old username, then (re)assign the desired
        # set — this also drops any item that was unchecked from the selection.
        _clear_auto_assign_for_username(username)
        _apply_auto_assign_items(items_by_type, new_username)
        return jsonify({"success": True})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ── Common Fixes ──────────────────────────────────────────────────────────────

def _upload_cf_attachment(fix_id: str, index: int, filename: str, data: bytes, content_type: str) -> str | None:
    safe_name = re.sub(r"[^a-zA-Z0-9.\-_]", "_", filename)
    path      = f"cf/{fix_id}/{index}_{safe_name}"
    url       = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/issue-attachments/{path}"
    try:
        resp = http_requests.put(
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
        current_app.logger.error("CF attachment upload failed: %s", exc)
        return None


@admin_bp.get("/api/admin/common-fixes")
def cf_list():
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/common_fixes", params={
            "select": "fix_id,fix_name,system_id,problem_desc,fix_description,fix_attachments,"
                      "keywords,business_impact,urgency,priority,created_at,updated_at",
            "order":  "created_at.desc",
        })
        # Attach system names
        systems = supabase_req("GET", "/systems", params={"select": "id,name"})
        sys_map = {s["id"]: s["name"] for s in (systems or [])}
        for r in (rows or []):
            r["system_name"] = sys_map.get(r.get("system_id"), "")
        # Attach linked issue counts
        links = supabase_req("GET", "/issue_common_fix_links", params={"select": "fix_id"})
        from collections import Counter
        link_counts = Counter(l["fix_id"] for l in (links or []))
        for r in (rows or []):
            r["linked_issue_count"] = link_counts.get(r["fix_id"], 0)
        return jsonify(rows or [])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


def _parse_cf_keywords(raw: str | None) -> list:
    if not raw:
        return []
    try:
        import json as _json
        parsed = _json.loads(raw)
        if isinstance(parsed, list):
            return [str(k).strip() for k in parsed if str(k).strip()]
    except Exception:
        pass
    return [k.strip() for k in raw.split(",") if k.strip()]


@admin_bp.post("/api/admin/common-fixes")
def cf_create():
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]

    fix_name        = request.form.get("fix_name", "").strip()
    system_id       = request.form.get("system_id", "").strip() or None
    prob_desc       = request.form.get("problem_desc", "").strip() or None
    fix_desc        = request.form.get("fix_description", "").strip() or None
    keywords        = _parse_cf_keywords(request.form.get("keywords"))
    business_impact = request.form.get("business_impact", "").strip() or None
    urgency         = request.form.get("urgency", "").strip() or None
    priority        = request.form.get("priority", "").strip() or None

    if not fix_name:
        return jsonify({"error": "Fix name is required"}), 400

    try:
        rows = supabase_req("POST", "/common_fixes",
                            data={"fix_name": fix_name, "system_id": system_id,
                                  "problem_desc": prob_desc, "fix_description": fix_desc,
                                  "keywords": keywords, "business_impact": business_impact,
                                  "urgency": urgency, "priority": priority,
                                  "fix_attachments": []},
                            extra_headers={"Prefer": "return=representation"})
        fix = rows[0] if rows else {}
        fix_id = fix.get("fix_id")
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    urls = []
    if fix_id:
        for i, f in enumerate(request.files.getlist("attachments")):
            if f and f.filename:
                url = _upload_cf_attachment(fix_id, i, f.filename, f.read(),
                                            f.content_type or "application/octet-stream")
                if url:
                    urls.append(url)
        if urls:
            try:
                supabase_req("PATCH", "/common_fixes",
                             data={"fix_attachments": urls},
                             params={"fix_id": f"eq.{fix_id}"})
                fix["fix_attachments"] = urls
            except Exception:
                pass

    return jsonify(fix), 201


@admin_bp.route("/api/admin/common-fixes/<fix_id>", methods=["PATCH", "DELETE"])
def cf_update_delete(fix_id):
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]

    if request.method == "DELETE":
        try:
            supabase_req("DELETE", "/common_fixes", params={"fix_id": f"eq.{fix_id}"})
            return jsonify({"success": True})
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

    # PATCH — support both JSON and multipart
    if request.content_type and "application/json" in request.content_type:
        data = request.get_json(silent=True) or {}
        patch = {}
        for field in ("fix_name", "system_id", "problem_desc", "fix_description",
                      "business_impact", "urgency", "priority"):
            if field in data:
                patch[field] = data[field] or None if field != "fix_name" else data[field]
        if "keywords" in data:
            kw = data["keywords"]
            patch["keywords"] = [str(k).strip() for k in kw if str(k).strip()] if isinstance(kw, list) else []
    else:
        patch = {}
        if request.form.get("fix_name"):
            patch["fix_name"] = request.form.get("fix_name", "").strip()
        for field in ("system_id", "problem_desc", "fix_description",
                      "business_impact", "urgency", "priority"):
            if field in request.form:
                patch[field] = request.form.get(field, "").strip() or None
        if "keywords" in request.form:
            patch["keywords"] = _parse_cf_keywords(request.form.get("keywords"))

        # Handle new file uploads
        new_files = [f for f in request.files.getlist("attachments") if f and f.filename]
        if new_files:
            try:
                existing = supabase_req("GET", "/common_fixes",
                                        params={"fix_id": f"eq.{fix_id}",
                                                "select": "fix_attachments"})
                current_urls = list(existing[0].get("fix_attachments") or []) if existing else []
            except Exception:
                current_urls = []
            start = len(current_urls)
            for i, f in enumerate(new_files):
                url = _upload_cf_attachment(fix_id, start + i, f.filename, f.read(),
                                            f.content_type or "application/octet-stream")
                if url:
                    current_urls.append(url)
            patch["fix_attachments"] = current_urls

        # Handle removed attachments
        keep_raw = request.form.get("keep_attachments")
        if keep_raw is not None:
            import json as _json
            try:
                keep = _json.loads(keep_raw)
                patch["fix_attachments"] = keep
            except Exception:
                pass

    if not patch:
        return jsonify({"error": "Nothing to update"}), 400
    try:
        supabase_req("PATCH", "/common_fixes", data=patch, params={"fix_id": f"eq.{fix_id}"})
        return jsonify({"success": True})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.get("/api/admin/common-fixes/<fix_id>/issues")
def cf_get_linked_issues(fix_id):
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    try:
        links = supabase_req("GET", "/issue_common_fix_links",
                             params={"fix_id": f"eq.{fix_id}", "select": "issue_id,linked_at"})
        if not links:
            return jsonify([])
        ids = [l["issue_id"] for l in links]
        issues = supabase_req("GET", "/issues", params={
            "id":     "in.(" + ",".join(ids) + ")",
            "select": "id,ticket_number,title,description,status,site_name,created_at",
        })
        return jsonify(issues or [])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.post("/api/admin/common-fixes/<fix_id>/issues")
def cf_link_issue(fix_id):
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    data = request.get_json(silent=True) or {}
    issue_id = str(data.get("issue_id", "")).strip()
    if not issue_id:
        return jsonify({"error": "issue_id required"}), 400
    try:
        rows = supabase_req("POST", "/issue_common_fix_links",
                            data={"fix_id": fix_id, "issue_id": issue_id},
                            extra_headers={"Prefer": "return=representation,resolution=ignore-duplicates"})
        return jsonify(rows[0] if rows else {}), 201
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.delete("/api/admin/common-fixes/<fix_id>/issues/<issue_id>")
def cf_unlink_issue(fix_id, issue_id):
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    try:
        supabase_req("DELETE", "/issue_common_fix_links",
                     params={"fix_id": f"eq.{fix_id}", "issue_id": f"eq.{issue_id}"})
        return jsonify({"success": True})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.get("/api/admin/issues/<issue_id>/common-fixes")
def issue_get_linked_fixes(issue_id):
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    try:
        links = supabase_req("GET", "/issue_common_fix_links",
                             params={"issue_id": f"eq.{issue_id}", "select": "fix_id,linked_at"})
        if not links:
            return jsonify([])
        ids = [l["fix_id"] for l in links]
        fixes = supabase_req("GET", "/common_fixes", params={
            "fix_id": "in.(" + ",".join(ids) + ")",
            "select": "fix_id,fix_name,system_id,problem_desc,fix_description,fix_attachments",
        })
        systems = supabase_req("GET", "/systems", params={"select": "id,name"})
        sys_map = {s["id"]: s["name"] for s in (systems or [])}
        for r in (fixes or []):
            r["system_name"] = sys_map.get(r.get("system_id"), "")
        return jsonify(fixes or [])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.post("/api/admin/issues/<issue_id>/common-fixes/<fix_id>")
def issue_link_fix(issue_id, fix_id):
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("POST", "/issue_common_fix_links",
                            data={"fix_id": fix_id, "issue_id": issue_id},
                            extra_headers={"Prefer": "return=representation,resolution=ignore-duplicates"})
        return jsonify(rows[0] if rows else {}), 201
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.delete("/api/admin/issues/<issue_id>/common-fixes/<fix_id>")
def issue_unlink_fix(issue_id, fix_id):
    _, err = _require_admin()
    if err: return jsonify(err[0]), err[1]
    try:
        supabase_req("DELETE", "/issue_common_fix_links",
                     params={"fix_id": f"eq.{fix_id}", "issue_id": f"eq.{issue_id}"})
        return jsonify({"success": True})
    except Exception as exc:
        return jsonify({"error": str(exc)})
