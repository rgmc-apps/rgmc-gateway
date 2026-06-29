import time
import logging

from config import SUPABASE_URL, SUPABASE_SERVICE_KEY, SITES_FALLBACK
from services.supabase import supabase_req

logger = logging.getLogger(__name__)

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
                "select":     "id,name,category,primary_url,primary_label,backup_url,backup_label,is_windows_based,windows_launcher_url,windows_manifest_url,is_task",
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
