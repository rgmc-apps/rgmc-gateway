from flask import request
from services.supabase import supabase_req


def _require_admin():
    """Returns (username, None) if valid admin, else (None, (error_dict, status_code))."""
    username = request.headers.get("X-Gateway-Username", "").strip().lower()
    if not username:
        return None, ({"error": "Authentication required"}, 401)
    try:
        rows = supabase_req("GET", "/users", params={
            "username": f"eq.{username}",
            "select":   "username,is_admin,is_management",
        })
    except Exception:
        return None, ({"error": "Authentication failed"}, 500)
    if not rows or not (rows[0].get("is_admin") or rows[0].get("is_management")):
        return None, ({"error": "Admin access required"}, 403)
    return rows[0]["username"], None


def _require_developer():
    """Returns (username, None) if valid developer or admin, else (None, (error_dict, status))."""
    username = request.headers.get("X-Gateway-Username", "").strip().lower()
    if not username:
        return None, ({"error": "Authentication required"}, 401)
    try:
        rows = supabase_req("GET", "/users", params={
            "username": f"eq.{username}",
            "select":   "username,is_developer,is_admin",
        })
    except Exception:
        return None, ({"error": "Authentication failed"}, 500)
    if not rows or not (rows[0].get("is_developer") or rows[0].get("is_admin")):
        return None, ({"error": "Developer access required"}, 403)
    return rows[0]["username"], None


def _require_dept_head():
    """Returns (username, user_row, None) if valid dept head or admin, else (None, None, (error_dict, status))."""
    username = request.headers.get("X-Gateway-Username", "").strip().lower()
    if not username:
        return None, None, ({"error": "Authentication required"}, 401)
    try:
        rows = supabase_req("GET", "/users", params={
            "username": f"eq.{username}",
            "select":   "username,department,is_department_head,is_admin,is_management",
        })
    except Exception:
        return None, None, ({"error": "Authentication failed"}, 500)
    if not rows:
        return None, None, ({"error": "User not found"}, 404)
    u = rows[0]
    if not (u.get("is_department_head") or u.get("is_admin") or u.get("is_management")):
        return None, None, ({"error": "Department head access required"}, 403)
    return u["username"], u, None
