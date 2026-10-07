from datetime import datetime, timezone

import requests
from config import SUPABASE_URL, SUPABASE_SERVICE_KEY


def _sb_headers() -> dict:
    return {
        "apikey":        SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=representation",
    }


def resolve_action_names(action_ids: list) -> list[str]:
    """Return action_name list for the given action_id list, preserving order. Silent on failure."""
    if not action_ids:
        return []
    try:
        ids_csv = ",".join(str(i) for i in action_ids)
        rows = supabase_req("GET", "/actions", params={
            "action_id": f"in.({ids_csv})",
            "select":    "action_id,action_name",
        })
        name_map = {r["action_id"]: r["action_name"] for r in (rows or [])}
        return [name_map[i] for i in action_ids if i in name_map]
    except Exception:
        return []


def email_taken(email: str, exclude_username: str | None = None) -> bool:
    """True if *email* already belongs to a different user (case-insensitive).
    One email may only ever belong to one user account."""
    email = (email or "").strip()
    if not email:
        return False
    safe = email.replace("*", "").replace("(", "").replace(")", "").replace(",", "")
    if not safe:
        return False
    try:
        rows = supabase_req("GET", "/users", params={
            "email":  f"ilike.{safe}",
            "select": "username",
        }) or []
    except Exception:
        return False
    if exclude_username:
        rows = [r for r in rows if r.get("username") != exclude_username]
    return bool(rows)


def get_app_setting(key: str, default: str | None = None) -> str | None:
    """Return a single app_settings value by key, or *default* if unset/unreachable."""
    try:
        rows = supabase_req("GET", "/app_settings", params={
            "key":    f"eq.{key}",
            "select": "value",
        })
        return rows[0]["value"] if rows else default
    except Exception:
        return default


def set_app_setting(key: str, value: str, updated_by: str | None = None) -> None:
    """Upsert a single app_settings value by key."""
    supabase_req("POST", "/app_settings", data={
        "key":        key,
        "value":      value,
        "updated_by": updated_by,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }, extra_headers={"Prefer": "resolution=merge-duplicates,return=representation"})


def supabase_req(method: str, path: str, *, data=None, params=None, extra_headers=None):
    url = SUPABASE_URL.rstrip("/") + "/rest/v1" + path
    headers = _sb_headers()
    if extra_headers:
        headers.update(extra_headers)
    resp = requests.request(
        method, url, headers=headers, json=data, params=params, timeout=10
    )
    if not resp.ok:
        raise requests.HTTPError(
            f"{resp.status_code} {resp.reason} — {resp.text[:300]}",
            response=resp,
        )
    return resp.json() if resp.text else []
