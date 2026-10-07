import re
import logging

from config import GATEWAY_BASE_URL
from services.supabase import supabase_req
from services.it_bot import notify_mention

logger = logging.getLogger(__name__)

# Mirrors the frontend's mention-trigger regex in static/comment-editor.js —
# an "@" preceded by start-of-text, whitespace, or "(", followed by username chars.
_MENTION_RE = re.compile(r"(?:^|[\s(])@([a-zA-Z0-9_.\-]+)")

_EXCERPT_MAX = 300


def _display_name(user: dict, fallback: str) -> str:
    return (
        user.get("display_name")
        or f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
        or fallback
    )


def notify_comment_mentions(
    comment_text: str,
    author_username: str,
    entity_type: str,
    entity_id: str,
    entity_label: str,
    url: str | None = None,
) -> None:
    """Scan a freshly-posted comment for @username mentions and DM each valid,
    distinct mentioned user via the IT bot. Fire-and-forget — never raises."""
    mentioned = {m.group(1).lower() for m in _MENTION_RE.finditer(comment_text or "")}
    mentioned.discard((author_username or "").lower())
    if not mentioned:
        return

    try:
        rows = supabase_req("GET", "/users", params={
            "username": f"in.({','.join(mentioned)})",
            "select":   "username,display_name,first_name,last_name",
        }) or []
    except Exception as exc:
        logger.warning("notify_comment_mentions: user lookup failed: %s", exc)
        return

    valid_users = {r["username"]: r for r in rows if r.get("username")}
    if not valid_users:
        return

    author_display = author_username
    try:
        author_rows = supabase_req("GET", "/users", params={
            "username": f"eq.{author_username}",
            "select":   "display_name,first_name,last_name",
        })
        if author_rows:
            author_display = _display_name(author_rows[0], author_username)
    except Exception:
        pass

    excerpt = (comment_text or "").strip()
    if len(excerpt) > _EXCERPT_MAX:
        excerpt = excerpt[:_EXCERPT_MAX] + "…"

    for username in valid_users:
        notify_mention(
            mentioned_username=username,
            by_username=author_username,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_label=entity_label,
            comment_excerpt=excerpt,
            url=url,
            by_display_name=author_display,
        )


def issue_url(issue_id: str) -> str:
    base = (GATEWAY_BASE_URL or "").rstrip("/")
    return f"{base}/admin/issues/{issue_id}"


def developer_board_url() -> str:
    return (GATEWAY_BASE_URL or "").rstrip("/") + "/developer"


def workspace_url() -> str:
    return (GATEWAY_BASE_URL or "").rstrip("/") + "/workspace"
