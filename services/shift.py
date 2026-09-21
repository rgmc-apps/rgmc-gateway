"""Shift-aware ticket aging.

Users can configure a weekly shift (working weekdays + one daily start/end
time). Ticket aging then counts only the hours that fall within the assigned
staff member's shift, instead of raw 24/7 wall-clock time. Shift hours are
interpreted in the company's local timezone (Asia/Manila) since the app has
no per-user timezone setting. Unassigned tickets, or an assignee with no
shift configured, fall back to plain wall-clock elapsed time.
"""
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from services.supabase import supabase_req

SHIFT_TZ       = ZoneInfo("Asia/Manila")
DAY_CODES      = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
VALID_DAY_CODES = set(DAY_CODES)
_TIME_RE       = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)")


def validate_shift_fields(data):
    """Given a dict that may contain shift_days/shift_start/shift_end, return a
    validated patch dict covering only the keys present in `data`.
    Raises ValueError on a malformed value."""
    patch = {}
    if "shift_days" in data:
        days = data.get("shift_days") or []
        if not isinstance(days, list) or any(d not in VALID_DAY_CODES for d in days):
            raise ValueError("shift_days must be a list of mon/tue/wed/thu/fri/sat/sun")
        patch["shift_days"] = days or None
    if "shift_start" in data:
        v = str(data.get("shift_start") or "").strip()
        if v and not _TIME_RE.match(v):
            raise ValueError("shift_start must be HH:MM")
        patch["shift_start"] = v[:5] or None
    if "shift_end" in data:
        v = str(data.get("shift_end") or "").strip()
        if v and not _TIME_RE.match(v):
            raise ValueError("shift_end must be HH:MM")
        patch["shift_end"] = v[:5] or None
    return patch


def _parse_dt(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


def _parse_hhmm(t):
    if not t:
        return None
    m = _TIME_RE.match(str(t))
    if not m:
        return None
    return int(m.group(1)), int(m.group(2))


def shift_hours_between(start, end, shift_days, shift_start, shift_end):
    """Business-hours elapsed between two timezone-aware datetimes, per a
    weekly shift schedule (weekday codes + one daily HH:MM window, interpreted
    in Asia/Manila local time). Falls back to raw elapsed hours when the
    shift isn't configured."""
    if not start or not end or end <= start:
        return 0.0

    start_time = _parse_hhmm(shift_start)
    end_time   = _parse_hhmm(shift_end)
    if not shift_days or not start_time or not end_time:
        return (end - start).total_seconds() / 3600

    days = set(shift_days) & VALID_DAY_CODES
    if not days:
        return (end - start).total_seconds() / 3600

    start_h, start_m = start_time
    end_h, end_m     = end_time

    start_local = start.astimezone(SHIFT_TZ)
    end_local   = end.astimezone(SHIFT_TZ)

    total_seconds = 0.0
    day      = start_local.date()
    last_day = end_local.date()
    while day <= last_day:
        if DAY_CODES[day.weekday()] in days:
            day_start = datetime(day.year, day.month, day.day, start_h, start_m, tzinfo=SHIFT_TZ)
            day_end   = datetime(day.year, day.month, day.day, end_h, end_m, tzinfo=SHIFT_TZ)
            window_start = max(day_start, start_local)
            window_end   = min(day_end, end_local)
            if window_end > window_start:
                total_seconds += (window_end - window_start).total_seconds()
        day += timedelta(days=1)
    return total_seconds / 3600


def shift_age_days(created_at, end_at, user_row):
    """Days elapsed between created_at and end_at (ISO strings), shift-aware
    when user_row has a configured shift, else raw wall-clock days.
    end_at=None means "now"."""
    ct = _parse_dt(created_at)
    et = _parse_dt(end_at) if end_at else datetime.now(timezone.utc)
    if not ct or not et:
        return None
    hours = shift_hours_between(
        ct, et,
        (user_row or {}).get("shift_days"),
        (user_row or {}).get("shift_start"),
        (user_row or {}).get("shift_end"),
    )
    return round(max(0.0, hours) / 24, 1)


def fetch_shift_map():
    """{username: {shift_days, shift_start, shift_end}} for every user."""
    try:
        rows = supabase_req("GET", "/users", params={
            "select": "username,shift_days,shift_start,shift_end",
        }) or []
    except Exception:
        return {}
    return {r["username"]: r for r in rows if r.get("username")}
