import uuid

from flask import current_app

from services.supabase import supabase_req
from services.email import send_issue_assigned_email

AUTO_ASSIGNED_BY = "Auto-Assign"


def get_auto_assign_user(category_name: str) -> dict | None:
    """Return the user row configured to receive tickets for *category_name*
    (via request_category.assigned_to_username), or None if the category has
    no mapping or the lookup fails."""
    category_name = (category_name or "").strip()
    if not category_name:
        return None
    try:
        cats = supabase_req("GET", "/request_category", params={
            "category_name": f"eq.{category_name}",
            "select":        "assigned_to_username",
        })
    except Exception as exc:
        current_app.logger.warning("get_auto_assign_user: category lookup failed for '%s': %s", category_name, exc)
        return None
    username = cats[0].get("assigned_to_username") if cats else None
    if not username:
        return None
    try:
        users = supabase_req("GET", "/users", params={
            "username": f"eq.{username}",
            "select":   "username,first_name,last_name,email,viber_number",
        })
    except Exception as exc:
        current_app.logger.warning("get_auto_assign_user: user lookup failed for '%s': %s", username, exc)
        return None
    return users[0] if users else None


def _email_action_token(issue_id: str) -> str | None:
    token = uuid.uuid4().hex
    try:
        supabase_req("PATCH", "/issues", data={"email_action_token": token}, params={"id": f"eq.{issue_id}"})
        return token
    except Exception as exc:
        current_app.logger.warning("auto_assign: email action token failed for %s: %s", issue_id, exc)
        return None


def apply_auto_assignment(created_issue: dict | None) -> dict | None:
    """If the issue's category has an auto-assign mapping and the issue isn't
    already assigned, assign it to that user, send the usual assignment
    email, and return the updated issue dict. Silently returns the issue
    unchanged if there's no mapping, it's already assigned, or anything
    fails — auto-assignment is a convenience, never a blocker for ticket
    creation."""
    if not created_issue or created_issue.get("assigned_to"):
        return created_issue
    issue_id = created_issue.get("id")
    category = created_issue.get("request_category")
    if not issue_id or not category:
        return created_issue

    user = get_auto_assign_user(category)
    if not user:
        return created_issue

    try:
        supabase_req("PATCH", "/issues", data={"assigned_to": user["username"]}, params={"id": f"eq.{issue_id}"})
    except Exception as exc:
        current_app.logger.error("apply_auto_assignment: assign failed for %s: %s", issue_id, exc)
        return created_issue

    updated_issue = {**created_issue, "assigned_to": user["username"]}
    try:
        action_token = _email_action_token(issue_id)
        send_issue_assigned_email(updated_issue, user, AUTO_ASSIGNED_BY, action_token=action_token)
    except Exception as exc:
        current_app.logger.error("apply_auto_assignment: assignment email failed for %s: %s", issue_id, exc)
    return updated_issue
