from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, render_template, current_app
from services.supabase import supabase_req
from services.guards import _require_dept_head

user_page_bp = Blueprint("user_page", __name__)

VALID_TASK_STATUSES = ('open', 'ongoing', 'done')

_TASK_STATUS_LABEL = {
    "open":    "Open",
    "ongoing": "Ongoing",
    "done":    "Done",
}


def _require_user():
    username = request.headers.get("X-Gateway-Username", "").strip().lower()
    if not username:
        return None, ({"error": "Authentication required"}, 401)
    try:
        rows = supabase_req("GET", "/users", params={
            "username": f"eq.{username}",
            "select":   "username",
        })
    except Exception:
        return None, ({"error": "Authentication failed"}, 500)
    if not rows:
        return None, ({"error": "User not found"}, 404)
    return rows[0]["username"], None


def _user_info(username):
    try:
        rows = supabase_req("GET", "/users", params={
            "username": f"eq.{username}",
            "select":   "username,department,email",
        })
        return rows[0] if rows else {}
    except Exception:
        return {}


def _dept_id_for(dept_name):
    if not dept_name:
        return None
    try:
        rows = supabase_req("GET", "/departments", params={
            "department_name": f"eq.{dept_name}",
            "select":          "department_id",
            "is_active":       "eq.true",
        })
        return rows[0]["department_id"] if rows else None
    except Exception:
        return None


@user_page_bp.get("/workspace")
def workspace_page():
    return render_template("user.html")


@user_page_bp.get("/api/user/issues/team")
def user_team_issues():
    username, err = _require_user()
    if err:
        return jsonify(err[0]), err[1]
    info      = _user_info(username)
    dept_name = info.get("department", "")
    dept_id   = _dept_id_for(dept_name) if dept_name else None

    team_usernames = []
    if dept_name:
        try:
            members = supabase_req("GET", "/users", params={
                "department": f"eq.{dept_name}",
                "select":     "username",
            })
            team_usernames = [m["username"] for m in (members or [])]
        except Exception:
            pass

    or_parts = []
    if dept_id:
        or_parts.append(f"request_to_department_id.eq.{dept_id}")
    if team_usernames:
        or_parts.append(f"assigned_to.in.({','.join(team_usernames)})")

    if not or_parts:
        return jsonify([])

    try:
        rows = supabase_req("GET", "/issues", params={
            "or":     f"({','.join(or_parts)})",
            "select": "id,ticket_number,title,description,status,priority,urgency,employee_name,company_name,email,created_at,assigned_to,request_category,ticket_type,from_helpdesk",
            "order":  "created_at.desc",
        })
        return jsonify(rows or [])
    except Exception as exc:
        current_app.logger.error("user_team_issues: %s", exc)
        return jsonify({"error": "Failed to fetch team issues"}), 500


@user_page_bp.get("/api/user/issues/mine")
def user_my_issues():
    username, err = _require_user()
    if err:
        return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/issues", params={
            "assigned_to": f"eq.{username}",
            "select":      "id,ticket_number,title,description,status,priority,urgency,employee_name,company_name,email,created_at,assigned_to,request_category,ticket_type,from_helpdesk",
            "order":       "created_at.desc",
        })
        return jsonify(rows or [])
    except Exception as exc:
        current_app.logger.error("user_my_issues: %s", exc)
        return jsonify({"error": "Failed to fetch assigned issues"}), 500


@user_page_bp.get("/api/user/issues/filed")
def user_filed_issues():
    username, err = _require_user()
    if err:
        return jsonify(err[0]), err[1]
    info       = _user_info(username)
    user_email = info.get("email", "")
    if not user_email:
        return jsonify([])
    try:
        rows = supabase_req("GET", "/issues", params={
            "email":  f"eq.{user_email}",
            "select": "id,ticket_number,title,description,status,priority,urgency,employee_name,company_name,email,created_at,assigned_to,request_category,ticket_type,from_helpdesk",
            "order":  "created_at.desc",
        })
        return jsonify(rows or [])
    except Exception as exc:
        current_app.logger.error("user_filed_issues: %s", exc)
        return jsonify({"error": "Failed to fetch filed issues"}), 500


@user_page_bp.get("/api/user/team")
def user_team_members():
    username, err = _require_user()
    if err:
        return jsonify(err[0]), err[1]
    info      = _user_info(username)
    dept_name = info.get("department", "")
    if not dept_name:
        return jsonify([])
    try:
        rows = supabase_req("GET", "/users", params={
            "department": f"eq.{dept_name}",
            "select":     "username,first_name,last_name,display_name,avatar_url,position,email,company",
            "order":      "first_name.asc",
        })
        return jsonify(rows or [])
    except Exception as exc:
        current_app.logger.error("user_team_members: %s", exc)
        return jsonify({"error": "Failed to fetch team members"}), 500


@user_page_bp.get("/api/user/tasks")
def user_list_tasks():
    username, err = _require_user()
    if err:
        return jsonify(err[0]), err[1]
    scope     = request.args.get("scope", "team")
    info      = _user_info(username)
    dept_name = info.get("department", "")
    dept_id   = _dept_id_for(dept_name) if dept_name else None

    params = {"select": "*", "order": "created_at.desc"}
    if scope == "mine":
        params["created_by"] = f"eq.{username}"
    elif dept_id:
        params["department_id"] = f"eq.{dept_id}"
    else:
        params["created_by"] = f"eq.{username}"

    try:
        rows = supabase_req("GET", "/user_tasks", params=params)
        return jsonify(rows or [])
    except Exception as exc:
        current_app.logger.error("user_list_tasks: %s", exc)
        return jsonify({"error": "Failed to fetch tasks"}), 500


@user_page_bp.post("/api/user/tasks")
def user_create_task():
    username, err = _require_user()
    if err:
        return jsonify(err[0]), err[1]
    body  = request.get_json(silent=True) or {}
    title = (body.get("title") or "").strip()
    if not title:
        return jsonify({"error": "Title is required"}), 400
    info      = _user_info(username)
    dept_name = info.get("department", "")
    dept_id   = _dept_id_for(dept_name)
    data = {
        "title":           title,
        "description":     (body.get("description") or "").strip() or None,
        "status":          "open",
        "created_by":      username,
        "department_id":   dept_id,
        "department_name": dept_name or None,
        "due_date":        body.get("due_date") or None,
    }
    try:
        rows    = supabase_req("POST", "/user_tasks", data=data,
                               extra_headers={"Prefer": "return=representation"})
        created = rows[0] if rows else data
        if created.get("id"):
            try:
                supabase_req("POST", "/task_item_logs", data={
                    "task_id":     created["id"],
                    "username":    username,
                    "from_status": None,
                    "to_status":   "open",
                })
            except Exception as exc:
                current_app.logger.warning("user_create_task: task log failed: %s", exc)
        return jsonify(created), 201
    except Exception as exc:
        current_app.logger.error("user_create_task: %s", exc)
        return jsonify({"error": "Failed to create task"}), 500


@user_page_bp.patch("/api/user/tasks/<task_id>")
def user_update_task(task_id):
    username, err = _require_user()
    if err:
        return jsonify(err[0]), err[1]
    body    = request.get_json(silent=True) or {}
    allowed = {"title", "description", "status", "due_date", "assigned_to"}
    patch   = {k: v for k, v in body.items() if k in allowed}
    if "status" in patch and patch["status"] not in VALID_TASK_STATUSES:
        return jsonify({"error": "Invalid status"}), 400
    if not patch:
        return jsonify({"error": "Nothing to update"}), 400

    old_status = None
    if "status" in patch:
        try:
            existing = supabase_req("GET", "/user_tasks", params={"id": f"eq.{task_id}", "select": "status"})
            if existing:
                old_status = existing[0].get("status")
        except Exception:
            pass

    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        supabase_req("PATCH", "/user_tasks", data=patch, params={"id": f"eq.{task_id}"})
        rows = supabase_req("GET", "/user_tasks", params={"id": f"eq.{task_id}", "select": "*"})
        updated_task = rows[0] if rows else None
    except Exception as exc:
        current_app.logger.error("user_update_task: %s", exc)
        return jsonify({"error": "Failed to update task"}), 500

    new_status = patch.get("status")
    if new_status and old_status != new_status:
        try:
            supabase_req("POST", "/task_item_logs", data={
                "task_id":     task_id,
                "username":    username,
                "from_status": old_status,
                "to_status":   new_status,
            })
        except Exception as exc:
            current_app.logger.warning("user_update_task: task log failed: %s", exc)
        try:
            from_lbl = _TASK_STATUS_LABEL.get(old_status, old_status) if old_status else "—"
            to_lbl   = _TASK_STATUS_LABEL.get(new_status, new_status)
            supabase_req("POST", "/task_activity_logs", data={
                "task_id":  task_id,
                "username": username,
                "message":  f"{username} moved this from {from_lbl} to {to_lbl}",
            })
        except Exception as exc:
            current_app.logger.warning("user_update_task: activity log failed: %s", exc)

    # Cascade status and assignee changes to the linked issue
    new_status          = patch.get("status")
    assigned_to_changed = "assigned_to" in patch
    if (new_status or assigned_to_changed) and updated_task:
        try:
            issue_rows = supabase_req("GET", "/issues", params={
                "user_task_id": f"eq.{task_id}",
                "select":       "id,status",
            })
            if issue_rows:
                issue       = issue_rows[0]
                issue_patch = {}
                if new_status == "done" and issue.get("status") not in ("resolved", "closed"):
                    issue_patch["status"] = "resolved"
                elif new_status in ("open", "ongoing") and issue.get("status") not in ("in_progress", "resolved", "closed"):
                    issue_patch["status"] = "in_progress"
                if assigned_to_changed:
                    issue_patch["assigned_to"] = patch["assigned_to"]
                if issue_patch:
                    supabase_req("PATCH", "/issues",
                                 data=issue_patch,
                                 params={"id": f"eq.{issue['id']}"})
        except Exception as exc:
            current_app.logger.warning("user_update_task: issue sync failed: %s", exc)

    return jsonify(updated_task or {"success": True})


@user_page_bp.patch("/api/user/issues/team/<issue_id>")
def user_update_team_issue(issue_id):
    username, user_row, err = _require_dept_head()
    if err:
        return jsonify(err[0]), err[1]

    dept_name = user_row.get("department", "")
    dept_id   = _dept_id_for(dept_name) if dept_name else None

    body    = request.get_json(silent=True) or {}
    allowed = {"assigned_to", "status"}
    patch   = {k: v for k, v in body.items() if k in allowed}
    if not patch:
        return jsonify({"error": "Nothing to update"}), 400

    # Resolve team scope for validation
    team_usernames = []
    if dept_name:
        try:
            members = supabase_req("GET", "/users", params={
                "department": f"eq.{dept_name}",
                "select":     "username",
            })
            team_usernames = [m["username"] for m in (members or [])]
        except Exception:
            pass

    # Verify the issue is in this dept head's scope
    try:
        iss_rows = supabase_req("GET", "/issues", params={
            "id":     f"eq.{issue_id}",
            "select": "id,request_to_department_id,assigned_to,user_task_id",
        })
        if not iss_rows:
            return jsonify({"error": "Issue not found"}), 404
        issue = iss_rows[0]
    except Exception as exc:
        current_app.logger.error("user_update_team_issue fetch: %s", exc)
        return jsonify({"error": "Failed to fetch issue"}), 500

    in_scope = (
        (dept_id and issue.get("request_to_department_id") == dept_id) or
        issue.get("assigned_to") in team_usernames or
        user_row.get("is_admin") or user_row.get("is_management")
    )
    if not in_scope:
        return jsonify({"error": "Issue is not in your team's scope"}), 403

    try:
        supabase_req("PATCH", "/issues", data=patch, params={"id": f"eq.{issue_id}"})
    except Exception as exc:
        current_app.logger.error("user_update_team_issue patch: %s", exc)
        return jsonify({"error": "Update failed"}), 500

    # Cascade assigned_to to linked user_task
    if "assigned_to" in patch and issue.get("user_task_id"):
        try:
            supabase_req("PATCH", "/user_tasks",
                         data={"assigned_to": patch["assigned_to"]},
                         params={"id": f"eq.{issue['user_task_id']}"})
        except Exception as exc:
            current_app.logger.warning("user_update_team_issue: user_task sync failed: %s", exc)

    return jsonify({"success": True})


@user_page_bp.delete("/api/user/tasks/<task_id>")
def user_delete_task(task_id):
    username, err = _require_user()
    if err:
        return jsonify(err[0]), err[1]
    try:
        supabase_req("DELETE", "/user_tasks", params={"id": f"eq.{task_id}"})
        return jsonify({"success": True})
    except Exception as exc:
        current_app.logger.error("user_delete_task: %s", exc)
        return jsonify({"error": "Failed to delete task"}), 500
