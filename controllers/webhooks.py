import re
import hmac
from flask import Blueprint, request, jsonify, current_app

from config import WEBHOOK_SECRET
from services.supabase import supabase_req

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
