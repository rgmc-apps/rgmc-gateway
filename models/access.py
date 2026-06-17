import re
import logging
from datetime import datetime, timezone

from services.supabase import supabase_req

logger = logging.getLogger(__name__)


def generate_username(first_name: str, last_name: str, middle_initial: str = "") -> str:
    def clean(s):
        return re.sub(r"[^a-z0-9]", "", s.lower())

    words          = [w for w in first_name.split() if w]
    first_word     = clean(words[0]) if words else ""
    other_initials = "".join(clean(w)[0] for w in words[1:] if clean(w))
    mi             = clean(middle_initial[:1]) if middle_initial else ""
    clean_last     = clean(last_name.replace(" ", ""))

    try:
        rows = supabase_req("GET", "/access_requests", params={
            "select": "username",
            "status": "eq.approved",
        })
        used = {r["username"] for r in rows if r.get("username")}
    except Exception:
        used = set()

    # Try: first N chars of first word + initials of remaining words + last name.
    # N starts at 1 (initials-only) and grows until a unique name is found.
    for n in range(1, len(first_word) + 1):
        candidate = first_word[:n] + other_initials + mi + clean_last
        if candidate and candidate not in used:
            return candidate

    # All letter-extension variants taken → numeric suffix on the longest form
    base = (first_word + other_initials + mi + clean_last) or "user"
    i = 1
    while f"{base}{i}" in used:
        i += 1
    return f"{base}{i}"


def _full_name(record: dict) -> str:
    mi    = record.get("middle_initial", "").strip()
    parts = [record.get("first_name", ""), mi + "." if mi else "", record.get("last_name", "")]
    return " ".join(p for p in parts if p).replace("  ", " ").strip()


def _approve_record(record: dict):
    """Core approval logic. Mutates record['username'] in place. Returns (username, error_msg)."""
    is_additional = bool(record.get("username"))

    if is_additional:
        username = record["username"]
        try:
            primary = supabase_req("GET", "/access_requests", params={
                "username": f"eq.{username}",
                "status":   "eq.approved",
                "select":   "id,systems",
                "order":    "created_at.asc",
                "limit":    "1",
            })
            if primary:
                merged = list({*(primary[0].get("systems") or []), *(record.get("systems") or [])})
                supabase_req("PATCH", "/access_requests",
                             data={"systems": merged},
                             params={"id": f"eq.{primary[0]['id']}"})
        except Exception as exc:
            logger.error("System merge failed: %s", exc)
    else:
        username = generate_username(
            record["first_name"],
            record["last_name"],
            record.get("middle_initial", ""),
        )

    try:
        supabase_req("PATCH", "/access_requests", data={
            "status":       "approved",
            "username":     username,
            "processed_at": datetime.now(timezone.utc).isoformat(),
        }, params={"id": f"eq.{record['id']}"})
    except Exception as exc:
        logger.error("Supabase approve failed: %s", exc)
        return None, "Failed to approve the request"

    record["username"] = username

    if is_additional:
        try:
            user_rows = supabase_req("GET", "/users", params={"username": f"eq.{username}", "select": "systems"})
            if user_rows:
                current = set(user_rows[0].get("systems") or [])
                current.update(record.get("systems") or [])
                supabase_req("PATCH", "/users", data={"systems": list(current)}, params={"username": f"eq.{username}"})
        except Exception as exc:
            logger.error("Users systems sync failed: %s", exc)
    else:
        try:
            supabase_req("POST", "/users", data={
                "username":       username,
                "first_name":     record.get("first_name", ""),
                "last_name":      record.get("last_name", ""),
                "middle_initial": record.get("middle_initial", ""),
                "company":        record.get("company", ""),
                "department":     record.get("department", ""),
                "position":       record.get("position", ""),
                "email":          record.get("email", ""),
                "systems":        record.get("systems", []),
            }, extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
        except Exception as exc:
            logger.error("Users upsert failed: %s", exc)

    return username, None


def _reject_record(record_id: str, remarks: str = None):
    """Core rejection logic. Returns (True, None) or (False, error_msg)."""
    patch_data = {
        "status":       "rejected",
        "processed_at": datetime.now(timezone.utc).isoformat(),
    }
    if remarks:
        patch_data["rejection_remarks"] = remarks
    try:
        supabase_req("PATCH", "/access_requests", data=patch_data, params={"id": f"eq.{record_id}"})
        return True, None
    except Exception as exc:
        logger.error("Supabase reject failed: %s", exc)
        return False, "Failed to reject the request"
