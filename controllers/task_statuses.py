import re
from flask import Blueprint, request, jsonify
from services.supabase import supabase_req
from services.guards import _require_admin, _require_dept_head

task_statuses_bp = Blueprint("task_statuses", __name__)

_DEFAULT_STATUSES = [
    {"label": "Open",    "slug": "open",    "color": "#6b7280", "sort_order": 0, "is_initial": True,  "is_terminal": False, "is_system": True},
    {"label": "Ongoing", "slug": "ongoing", "color": "#f59e0b", "sort_order": 1, "is_initial": False, "is_terminal": False, "is_system": True},
    {"label": "Done",    "slug": "done",    "color": "#22c55e", "sort_order": 2, "is_initial": False, "is_terminal": True,  "is_system": True},
]


def _slugify(text):
    return re.sub(r"[^a-z0-9]+", "_", text.lower().strip()).strip("_") or "status"


def _next_sort_order(scope, department_name=None):
    params = {"scope": f"eq.{scope}", "select": "sort_order", "order": "sort_order.desc", "limit": "1"}
    if department_name:
        params["department_name"] = f"eq.{department_name}"
    else:
        params["department_name"] = "is.null"
    rows = supabase_req("GET", "/task_statuses", params=params)
    return (rows[0]["sort_order"] + 1) if rows else 3


def _seed_dept_statuses(department_name):
    seeded = []
    for s in _DEFAULT_STATUSES:
        payload = {**s, "scope": "department", "department_name": department_name}
        rows = supabase_req("POST", "/task_statuses", data=payload,
                            extra_headers={"Prefer": "return=representation"})
        if rows:
            seeded.extend(rows)
    return seeded


# ── Admin endpoints ──────────────────────────────────────────────────────────

def _seed_admin_statuses():
    seeded = []
    for s in _DEFAULT_STATUSES:
        payload = {**s, "scope": "admin", "department_name": None}
        rows = supabase_req("POST", "/task_statuses", data=payload,
                            extra_headers={"Prefer": "return=representation"})
        if rows:
            seeded.extend(rows)
    return seeded


@task_statuses_bp.get("/api/admin/task-statuses")
def admin_list_task_statuses():
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]
    dept = (request.args.get("department_name") or "").strip()
    if dept:
        rows = supabase_req("GET", "/task_statuses", params={
            "scope":           "eq.department",
            "department_name": f"eq.{dept}",
            "order":           "sort_order.asc",
            "select":          "*",
        })
        if not rows:
            rows = _seed_dept_statuses(dept)
    else:
        rows = supabase_req("GET", "/task_statuses", params={
            "scope":           "eq.admin",
            "department_name": "is.null",
            "order":           "sort_order.asc",
            "select":          "*",
        })
        if not rows:
            rows = _seed_admin_statuses()
    return jsonify(rows or [])


@task_statuses_bp.post("/api/admin/task-statuses")
def admin_create_task_status():
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]
    data  = request.get_json(silent=True) or {}
    label = str(data.get("label", "")).strip()
    if not label:
        return jsonify({"error": "label is required"}), 400
    dept  = (data.get("department_name") or "").strip() or None
    scope = "department" if dept else "admin"
    slug  = _slugify(label)
    slug_params = {"scope": f"eq.{scope}", "slug": f"eq.{slug}", "select": "id"}
    if dept:
        slug_params["department_name"] = f"eq.{dept}"
    else:
        slug_params["department_name"] = "is.null"
    existing = supabase_req("GET", "/task_statuses", params=slug_params)
    if existing:
        slug = f"{slug}_{len(existing) + 1}"
    payload = {
        "scope":           scope,
        "department_name": dept,
        "label":           label,
        "slug":            slug,
        "color":           str(data.get("color", "#6b7280")),
        "sort_order":      _next_sort_order(scope, dept),
        "is_terminal":     bool(data.get("is_terminal", False)),
        "is_initial":      False,
        "is_system":       False,
    }
    rows = supabase_req("POST", "/task_statuses", data=payload,
                        extra_headers={"Prefer": "return=representation"})
    return jsonify(rows[0] if rows else payload), 201


@task_statuses_bp.patch("/api/admin/task-statuses/<status_id>")
def admin_update_task_status(status_id):
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]
    data  = request.get_json(silent=True) or {}
    patch = {}
    if "label"      in data: patch["label"]      = str(data["label"]).strip()
    if "color"      in data: patch["color"]       = str(data["color"])
    if "sort_order" in data: patch["sort_order"]  = int(data["sort_order"])
    if "is_terminal" in data: patch["is_terminal"] = bool(data["is_terminal"])
    if not patch:
        return jsonify({"error": "Nothing to update"}), 400
    supabase_req("PATCH", "/task_statuses", data=patch,
                 params={"id": f"eq.{status_id}"})
    return jsonify({"success": True})


@task_statuses_bp.delete("/api/admin/task-statuses/<status_id>")
def admin_delete_task_status(status_id):
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]
    rows = supabase_req("GET", "/task_statuses", params={
        "id": f"eq.{status_id}", "select": "is_system",
    })
    if not rows:
        return jsonify({"error": "Not found"}), 404
    if rows[0].get("is_system"):
        return jsonify({"error": "Cannot delete a system status"}), 400
    supabase_req("DELETE", "/task_statuses", params={"id": f"eq.{status_id}"})
    return jsonify({"success": True})


# ── Department-head endpoints ────────────────────────────────────────────────

@task_statuses_bp.get("/api/user/task-statuses")
def user_list_task_statuses():
    _, user_row, err = _require_dept_head()
    if err:
        return jsonify(err[0]), err[1]
    dept = (user_row.get("department") or "").strip()
    if not dept:
        return jsonify([])
    rows = supabase_req("GET", "/task_statuses", params={
        "scope":           "eq.department",
        "department_name": f"eq.{dept}",
        "order":           "sort_order.asc",
        "select":          "*",
    })
    if not rows:
        rows = _seed_dept_statuses(dept)
    return jsonify(rows or [])


@task_statuses_bp.post("/api/user/task-statuses")
def user_create_task_status():
    _, user_row, err = _require_dept_head()
    if err:
        return jsonify(err[0]), err[1]
    dept = (user_row.get("department") or "").strip()
    if not dept:
        return jsonify({"error": "No department assigned"}), 400
    data  = request.get_json(silent=True) or {}
    label = str(data.get("label", "")).strip()
    if not label:
        return jsonify({"error": "label is required"}), 400
    slug = _slugify(label)
    existing = supabase_req("GET", "/task_statuses", params={
        "scope": "eq.department", "department_name": f"eq.{dept}",
        "slug": f"eq.{slug}", "select": "id",
    })
    if existing:
        slug = f"{slug}_{len(existing) + 1}"
    payload = {
        "scope":           "department",
        "department_name": dept,
        "label":           label,
        "slug":            slug,
        "color":           str(data.get("color", "#6b7280")),
        "sort_order":      _next_sort_order("department", dept),
        "is_terminal":     bool(data.get("is_terminal", False)),
        "is_initial":      False,
        "is_system":       False,
    }
    rows = supabase_req("POST", "/task_statuses", data=payload,
                        extra_headers={"Prefer": "return=representation"})
    return jsonify(rows[0] if rows else payload), 201


@task_statuses_bp.patch("/api/user/task-statuses/<status_id>")
def user_update_task_status(status_id):
    _, user_row, err = _require_dept_head()
    if err:
        return jsonify(err[0]), err[1]
    dept = (user_row.get("department") or "").strip()
    data  = request.get_json(silent=True) or {}
    patch = {}
    if "label"       in data: patch["label"]       = str(data["label"]).strip()
    if "color"       in data: patch["color"]        = str(data["color"])
    if "sort_order"  in data: patch["sort_order"]   = int(data["sort_order"])
    if "is_terminal" in data: patch["is_terminal"]  = bool(data["is_terminal"])
    if not patch:
        return jsonify({"error": "Nothing to update"}), 400
    supabase_req("PATCH", "/task_statuses", data=patch, params={
        "id":              f"eq.{status_id}",
        "scope":           "eq.department",
        "department_name": f"eq.{dept}",
    })
    return jsonify({"success": True})


@task_statuses_bp.delete("/api/user/task-statuses/<status_id>")
def user_delete_task_status(status_id):
    _, user_row, err = _require_dept_head()
    if err:
        return jsonify(err[0]), err[1]
    dept = (user_row.get("department") or "").strip()
    rows = supabase_req("GET", "/task_statuses", params={
        "id": f"eq.{status_id}", "select": "is_system",
    })
    if not rows:
        return jsonify({"error": "Not found"}), 404
    if rows[0].get("is_system"):
        return jsonify({"error": "Cannot delete a system status"}), 400
    supabase_req("DELETE", "/task_statuses", params={
        "id":              f"eq.{status_id}",
        "scope":           "eq.department",
        "department_name": f"eq.{dept}",
    })
    return jsonify({"success": True})
