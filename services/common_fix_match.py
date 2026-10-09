import re

from flask import current_app

from services.supabase import supabase_req

# Minimum number of a common fix's keywords that must appear in a ticket's
# title/description before it's considered a match.
MATCH_MIN_KEYWORDS = 2


def _plain_text(html: str) -> str:
    return re.sub(r"<[^>]+>", " ", html or "")


def find_matching_common_fix(title: str, description: str) -> tuple[dict | None, int]:
    """Return (fix, match_count) for the common fix whose keywords hit the
    most matches in *title*/*description* (case-insensitive substring
    containment), provided it reaches MATCH_MIN_KEYWORDS. (None, 0) if
    nothing qualifies or the lookup fails."""
    text = f"{title or ''} {_plain_text(description or '')}".lower()
    if not text.strip():
        return None, 0
    try:
        fixes = supabase_req("GET", "/common_fixes", params={
            "select": "fix_id,fix_name,keywords,business_impact,urgency,priority",
        }) or []
    except Exception as exc:
        current_app.logger.warning("find_matching_common_fix: lookup failed: %s", exc)
        return None, 0

    best, best_count = None, 0
    for fix in fixes:
        keywords = {kw.strip().lower() for kw in (fix.get("keywords") or []) if kw and kw.strip()}
        if not keywords:
            continue
        count = sum(1 for kw in keywords if kw in text)
        if count >= MATCH_MIN_KEYWORDS and count > best_count:
            best, best_count = fix, count
    return best, best_count


def apply_common_fix_match(issue_id: str, title: str, description: str) -> dict | None:
    """If a common fix matches *title*/*description*, apply its configured
    business_impact/urgency/priority to the issue, link the fix to it, and
    return {'fix_name', 'match_count'} for caller notification. Returns None
    if nothing matched — never raises, since this is a convenience, not a
    blocker for ticket creation."""
    fix, count = find_matching_common_fix(title, description)
    if not fix:
        return None

    patch = {k: fix[k] for k in ("business_impact", "urgency", "priority") if fix.get(k)}
    try:
        if patch:
            supabase_req("PATCH", "/issues", data=patch, params={"id": f"eq.{issue_id}"})
        supabase_req("POST", "/issue_common_fix_links",
                     data={"fix_id": fix["fix_id"], "issue_id": issue_id},
                     extra_headers={"Prefer": "return=representation,resolution=ignore-duplicates"})
    except Exception as exc:
        current_app.logger.warning("apply_common_fix_match: link/patch failed for %s: %s", issue_id, exc)
        return None

    result = {"fix_name": fix.get("fix_name"), "match_count": count}
    result.update(patch)
    return result
