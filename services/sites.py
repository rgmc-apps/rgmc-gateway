import time
import logging

import requests as http_requests

from config import SUPABASE_URL, SUPABASE_SERVICE_KEY, SITES_FALLBACK
from services.supabase import supabase_req

logger = logging.getLogger(__name__)


class SystemNotFoundError(Exception):
    pass


def ping_system_by_id(system_id: str) -> dict:
    """Checks a system's configured URL for reachability. Raises SystemNotFoundError if unknown."""
    rows = supabase_req("GET", "/systems", params={"id": f"eq.{system_id}", "select": "id,name,primary_url,backup_url"})
    if not rows:
        raise SystemNotFoundError(system_id)

    system = rows[0]
    url = system.get("primary_url") or system.get("backup_url")
    if not url:
        return {"id": system_id, "name": system.get("name"), "status": "no_url", "error": "No URL configured"}

    t0 = time.monotonic()
    try:
        resp = http_requests.head(url, timeout=8, allow_redirects=True)
        if resp.status_code == 405:
            resp = http_requests.get(url, timeout=8, allow_redirects=True, stream=True)
        latency_ms = round((time.monotonic() - t0) * 1000)
        status = "ok" if resp.status_code < 500 else "error"
        return {
            "id":          system_id,
            "name":        system.get("name"),
            "url":         url,
            "status":      status,
            "http_status": resp.status_code,
            "latency_ms":  latency_ms,
        }
    except http_requests.Timeout:
        latency_ms = round((time.monotonic() - t0) * 1000)
        return {"id": system_id, "name": system.get("name"), "url": url, "status": "timeout", "latency_ms": latency_ms}
    except Exception as exc:
        latency_ms = round((time.monotonic() - t0) * 1000)
        return {"id": system_id, "name": system.get("name"), "url": url, "status": "down", "latency_ms": latency_ms, "error": str(exc)}

_sites_cache: list | None = None
_sites_cache_ts: float = 0.0
_SITES_CACHE_TTL = 300  # seconds


def get_sites() -> list:
    global _sites_cache, _sites_cache_ts
    now = time.time()
    if _sites_cache is not None and (now - _sites_cache_ts) < _SITES_CACHE_TTL:
        return _sites_cache
    if SUPABASE_URL and SUPABASE_SERVICE_KEY:
        try:
            rows = supabase_req("GET", "/systems", params={
                "select":     "id,name,category,primary_url,primary_label,backup_url,backup_label,is_windows_based,windows_launcher_url,windows_manifest_url,is_task,is_wip",
                "is_visible": "eq.true",
                "order":      "sort_order.asc,name.asc",
            })
            if rows:
                _sites_cache = rows
                _sites_cache_ts = now
                return _sites_cache
        except Exception as exc:
            logger.warning("Failed to load sites from DB, using fallback: %s", exc)
    _sites_cache = SITES_FALLBACK
    _sites_cache_ts = now
    return _sites_cache


def _invalidate_sites_cache():
    global _sites_cache
    _sites_cache = None
