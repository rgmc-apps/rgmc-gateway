from flask import request, current_app
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
    except Exception as exc:
        current_app.logger.error("_require_admin: supabase_req failed for '%s': %s", username, exc)
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
    except Exception as exc:
        current_app.logger.error("_require_developer: supabase_req failed for '%s': %s", username, exc)
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
    except Exception as exc:
        current_app.logger.error("_require_dept_head: supabase_req failed for '%s': %s", username, exc)
        return None, None, ({"error": "Authentication failed"}, 500)
    if not rows:
        return None, None, ({"error": "User not found"}, 404)
    u = rows[0]
    if not (u.get("is_department_head") or u.get("is_admin") or u.get("is_management")):
        return None, None, ({"error": "Department head access required"}, 403)
    return u["username"], u, None


def _require_issue_access(issue_id):
    """Returns (username, issue_row, None) if the caller may act on this issue —
    admins/management always can, department heads only for issues routed to
    their own department. Else (None, None, (error_dict, status_code))."""
    username = request.headers.get("X-Gateway-Username", "").strip().lower()
    if not username:
        return None, None, ({"error": "Authentication required"}, 401)
    try:
        user_rows = supabase_req("GET", "/users", params={
            "username": f"eq.{username}",
            "select":   "username,department,is_department_head,is_admin,is_management",
        })
    except Exception as exc:
        current_app.logger.error("_require_issue_access: user lookup failed for '%s': %s", username, exc)
        return None, None, ({"error": "Authentication failed"}, 500)
    if not user_rows:
        return None, None, ({"error": "User not found"}, 404)
    user = user_rows[0]
    if not (user.get("is_admin") or user.get("is_management") or user.get("is_department_head")):
        return None, None, ({"error": "Admin access required"}, 403)

    try:
        issue_rows = supabase_req("GET", "/issues", params={"id": f"eq.{issue_id}", "select": "*"})
    except Exception as exc:
        current_app.logger.error("_require_issue_access: issue lookup failed for '%s': %s", issue_id, exc)
        return None, None, ({"error": "Failed to fetch issue"}, 500)
    if not issue_rows:
        return None, None, ({"error": "Issue not found"}, 404)
    issue = issue_rows[0]

    if user.get("is_admin") or user.get("is_management"):
        return username, issue, None

    dept_id = None
    if user.get("department"):
        try:
            dept_rows = supabase_req("GET", "/departments", params={
                "department_name": f"eq.{user['department']}",
                "select":          "department_id",
                "is_active":       "eq.true",
            })
            dept_id = dept_rows[0]["department_id"] if dept_rows else None
        except Exception as exc:
            current_app.logger.warning("_require_issue_access: dept lookup failed: %s", exc)

    if dept_id and issue.get("request_to_department_id") == dept_id:
        return username, issue, None

    return None, None, ({"error": "You can only manage issues routed to your department"}, 403)
