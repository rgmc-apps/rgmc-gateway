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
            "select":   "username,is_admin",
        })
    except Exception:
        return None, ({"error": "Authentication failed"}, 500)
    if not rows or not rows[0].get("is_admin"):
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
