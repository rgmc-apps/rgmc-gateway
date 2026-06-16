import requests
from config import SUPABASE_URL, SUPABASE_SERVICE_KEY


def _sb_headers() -> dict:
    return {
        "apikey":        SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=representation",
    }


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
