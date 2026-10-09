import uuid

from flask import current_app

from services.supabase import supabase_req
from services.email import send_issue_assigned_email

AUTO_ASSIGNED_BY = "Auto-Assign"

# The one category whose "sub-category" picker on the IT helpdesk form shows
# systems rather than non_software_items — see controllers/public.py's
# get_helpdesk_subcategories(), which this mirrors.
_SOFTWARE_CATEGORY = "Software/Application"


def _lookup_assigned_username(table: str, filters: dict) -> str | None:
    try:
        rows = supabase_req("GET", table, params={**filters, "select": "assigned_to_username"})
    except Exception as exc:
        current_app.logger.warning("_lookup_assigned_username(%s): failed: %s", table, exc)
        return None
    return rows[0].get("assigned_to_username") if rows else None


def _fetch_user(username: str) -> dict | None:
    try:
        users = supabase_req("GET", "/users", params={
            "username": f"eq.{username}",
            "select":   "username,first_name,last_name,email,viber_number",
        })
    except Exception as exc:
        current_app.logger.warning("_fetch_user: lookup failed for '%s': %s", username, exc)
        return None
    return users[0] if users else None


def get_auto_assign_user(category_name: str, subcategory: str | None = None,
                          request_type_name: str | None = None) -> dict | None:
    """Return the user configured to receive a ticket with this category /
    sub-category / request type, checking the most specific mapping first:

      1. Sub-category — the matching `systems` row (when category is
         "Software/Application") or `non_software_items` row.
      2. Request type — the matching `request_type` row.
      3. Category — the `request_category` row (existing, broadest fallback).

    Returns None if nothing in the chain has a mapping, or the category
    itself is blank."""
    category_name = (category_name or "").strip()
    subcategory   = (subcategory or "").strip()
    request_type_name = (request_type_name or "").strip()
    if not category_name:
        return None

    username = None

    if subcategory:
        if category_name == _SOFTWARE_CATEGORY:
            username = _lookup_assigned_username("/systems", {"id": f"eq.{subcategory}"})
        else:
            username = _lookup_assigned_username("/non_software_items", {
                "category": f"eq.{category_name}", "subcategory": f"eq.{subcategory}",
            })

    if not username and request_type_name:
        username = _lookup_assigned_username("/request_type", {
            "request_category": f"eq.{category_name}", "request_type": f"eq.{request_type_name}",
        })

    if not username:
        username = _lookup_assigned_username("/request_category", {"category_name": f"eq.{category_name}"})

    if not username:
        return None
    return _fetch_user(username)


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

    user = get_auto_assign_user(
        category,
        created_issue.get("request_subcategory"),
        created_issue.get("request_type_name"),
    )
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
