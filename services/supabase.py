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


def supabase_req(method: str, path: str, *, data=None, params=None, extra_headers=None):
    url = SUPABASE_URL.rstrip("/") + "/rest/v1" + path
    headers = _sb_headers()
    if extra_headers:
        headers.update(extra_headers)
    resp = requests.request(
        method, url, headers=headers, json=data, params=params, timeout=10
    )
    resp.raise_for_status()
    return resp.json() if resp.text else []
