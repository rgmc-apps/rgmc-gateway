import re
import hmac
from flask import Blueprint, request, jsonify, current_app

from config import WEBHOOK_SECRET, IT_BOT_API_KEY
from services.supabase import supabase_req
from services.auto_assign import apply_auto_assignment

webhooks_bp = Blueprint("webhooks", __name__)

_CODE_RE   = re.compile(r'\bDI-\d+\b', re.IGNORECASE)
_BOT_USER  = "github-bot"


@webhooks_bp.post("/api/webhooks/github-push")
def github_push():
    secret = request.headers.get("X-Webhook-Secret", "")
    if not WEBHOOK_SECRET or not hmac.compare_digest(secret, WEBHOOK_SECRET):
        return jsonify({"error": "Unauthorized"}), 401

    data           = request.get_json(silent=True) or {}
    commit_message = (data.get("commit_message") or "").strip()
    commit_sha     = (data.get("commit_sha") or "")
    commit_author  = (data.get("commit_author") or "Unknown").strip()
    commit_url     = (data.get("commit_url") or "").strip()
    repo_name      = (data.get("repo_name") or "").strip()
    branch         = (data.get("branch") or "").strip()

    if not commit_message:
        return jsonify({"error": "commit_message is required"}), 400

    codes = list(dict.fromkeys(m.upper() for m in _CODE_RE.findall(commit_message)))

    if not codes:
        return jsonify({"message": "No dev item codes found", "codes": []}), 200

    short_sha = commit_sha[:8] if commit_sha else "unknown"
    header    = f"[GitHub Push] {repo_name} · {branch}\nCommit {short_sha} by {commit_author}"
    if commit_url:
        header += f"\n{commit_url}"
    log_message = f"{header}\n\n{commit_message}"

    results = []
    for code in codes:
        try:
            rows = supabase_req("GET", "/dev_items", params={
                "dev_item_code": f"eq.{code}",
                "select":        "id,title,dev_item_code",
            })
        except Exception as exc:
            current_app.logger.error("webhook: lookup %s failed: %s", code, exc)
            results.append({"code": code, "status": "error", "detail": str(exc)})
            continue

        if not rows:
            results.append({"code": code, "status": "not_found"})
            continue

        item = rows[0]
        try:
            supabase_req("POST", "/dev_activity_logs", data={
                "item_id":  item["id"],
                "username": _BOT_USER,
                "message":  log_message,
            })
            results.append({"code": code, "status": "commented", "title": item["title"]})
        except Exception as exc:
            current_app.logger.error("webhook: post log for %s failed: %s", code, exc)
            results.append({"code": code, "status": "error", "detail": str(exc)})

    return jsonify({"results": results}), 200


def _find_system_by_tag(tag: str) -> dict | None:
    """Case-insensitive match against a system's comma-separated tags column."""
    needle = tag.strip().lower()
    if not needle:
        return None
    try:
        rows = supabase_req("GET", "/systems", params={"select": "id,name,tags"}) or []
    except Exception as exc:
        current_app.logger.error("_find_system_by_tag: systems lookup failed: %s", exc)
        return None
    for row in rows:
        tags = [t.strip().lower() for t in (row.get("tags") or "").split(",") if t.strip()]
        if needle in tags:
            return row
    return None


@webhooks_bp.post("/api/webhooks/bot-feature-request")
def bot_feature_request():
    """Creates an issue (ticket_type-less feature request) from the IT Teams
    bot's `feature <system tag> <request> | <description>` command."""
    secret = request.headers.get("X-API-Key", "")
    if not IT_BOT_API_KEY or not hmac.compare_digest(secret, IT_BOT_API_KEY):
        return jsonify({"error": "Unauthorized"}), 401

    data           = request.get_json(silent=True) or {}
    system_tag     = (data.get("system_tag") or "").strip()
    title          = (data.get("title") or "").strip()
    description    = (data.get("description") or "").strip()
    reporter_name  = (data.get("reporter_name") or "").strip() or "MS Teams User"
    reporter_email = (data.get("reporter_email") or "").strip() or "it-bot@rgmcgroup.com"

    if not system_tag or not description:
        return jsonify({"error": "system_tag and description are required"}), 400

    system = _find_system_by_tag(system_tag)
    if not system:
        return jsonify({"error": f"No system found with tag '{system_tag}'"}), 404

    full_description = f"{description}\n\n— Submitted via Microsoft Teams chat (RGMC IT Bot)."

    issue_row = {
        "site_name":        system["name"],
        "employee_name":    reporter_name,
        "company_name":     "RGMC Group (via Teams)",
        "viber_number":     "N/A",
        "email":            reporter_email,
        "department":       "",
        "title":            title or description[:80],
        "description":      full_description,
        "request_category": "Software/Application",
        "priority":         "P2",
    }

    try:
        rows = supabase_req("POST", "/issues", data=issue_row,
                             extra_headers={"Prefer": "return=representation"})
        created_issue = rows[0] if rows else None
    except Exception as exc:
        current_app.logger.error("bot_feature_request: issue insert failed: %s", exc)
        return jsonify({"error": "Failed to create issue"}), 500

    if created_issue:
        created_issue = apply_auto_assignment(created_issue)
        try:
            from services.it_bot import notify_ticket_created
            notify_ticket_created(created_issue)
        except Exception as exc:
            current_app.logger.warning("bot_feature_request: notify_ticket_created failed: %s", exc)

    return jsonify({
        "success":       True,
        "ticket_number": (created_issue or {}).get("ticket_number"),
        "issue_id":      (created_issue or {}).get("id"),
    }), 201
