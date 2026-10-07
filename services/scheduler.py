"""Background scheduler — runs periodic maintenance jobs.

Uses APScheduler with a BackgroundScheduler so it works inside any WSGI server.
The resolution-reminder job runs once daily and sends weekly follow-up emails to
reporters whose issues are resolved but not yet confirmed.
"""

import logging
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

_REMINDER_INTERVAL = timedelta(days=7)


def _run_resolution_reminders(app):
    """Check for unconfirmed resolved issues and send weekly reminder emails."""
    from services.supabase import supabase_req
    from services.email import send_resolution_reminder_email

    with app.app_context():
        try:
            issues = supabase_req("GET", "/issues", params={
                "status": "in.(resolved,closed)",
                "email":  "not.is.null",
                "select": (
                    "id,email,employee_name,site_name,ticket_number,title,description,"
                    "resolved_at,resolution_notes,resolved_by,"
                    "confirmed_fix,resolution_reminder_count,resolution_reminder_sent_at"
                ),
            })
        except Exception as exc:
            logger.error("resolution_reminders: failed to fetch issues: %s", exc)
            return

        now = datetime.now(timezone.utc)
        sent = 0

        for issue in (issues or []):
            if issue.get("confirmed_fix"):
                continue
            if not issue.get("email"):
                continue

            count       = issue.get("resolution_reminder_count") or 0
            resolved_at = issue.get("resolved_at")
            last_sent   = issue.get("resolution_reminder_sent_at")

            if not resolved_at:
                continue

            try:
                resolved_dt = datetime.fromisoformat(resolved_at.replace("Z", "+00:00"))
            except Exception:
                continue

            # Determine whether it's time to send the next reminder
            if count == 0:
                if now - resolved_dt < _REMINDER_INTERVAL:
                    continue
            else:
                if not last_sent:
                    continue
                try:
                    last_sent_dt = datetime.fromisoformat(last_sent.replace("Z", "+00:00"))
                except Exception:
                    continue
                if now - last_sent_dt < _REMINDER_INTERVAL:
                    continue

            next_count = count + 1
            try:
                ok = send_resolution_reminder_email(issue, next_count)
            except Exception as exc:
                logger.warning("resolution_reminders: email failed for %s: %s", issue.get("id"), exc)
                continue

            if ok:
                try:
                    supabase_req("PATCH", "/issues", data={
                        "resolution_reminder_count":   next_count,
                        "resolution_reminder_sent_at": now.isoformat(),
                    }, params={"id": f"eq.{issue['id']}"})
                    sent += 1
                except Exception as exc:
                    logger.warning("resolution_reminders: DB update failed for %s: %s", issue.get("id"), exc)

        if sent:
            logger.info("resolution_reminders: sent %d reminder(s)", sent)


def _max_ts(*values):
    """Return the latest (max) of several ISO-8601 timestamp strings, ignoring None."""
    best = None
    for v in values:
        if not v:
            continue
        try:
            dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
        except Exception:
            continue
        if best is None or dt > best:
            best = dt
    return best


def _latest_by_key(rows, key_field, ts_field):
    """Group rows by key_field and return {key: latest ts_field as datetime}."""
    out = {}
    for row in (rows or []):
        key = row.get(key_field)
        ts  = row.get(ts_field)
        if key is None or not ts:
            continue
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:
            continue
        if key not in out or dt > out[key]:
            out[key] = dt
    return out


def _in_filter(ids):
    uniq = sorted({str(i) for i in ids if i})
    return ",".join(uniq)


def _run_auto_confirm_issues(app):
    """Auto-confirm resolved/closed issues that have gone quiet.

    An issue is auto-confirmed (confirmed_fix = true, same end state as a reporter
    clicking "Confirm Fix") once its last activity — a comment, or a status move on
    a linked dev item / task / user task / epic — is older than the configured
    `auto_confirm_days` setting, PROVIDED it isn't linked to any dev item, task,
    user task, or epic that is still active (not yet in a terminal/done state).
    An issue with no activity at all falls back to its resolved_at date.
    """
    from services.supabase import supabase_req, get_app_setting

    with app.app_context():
        try:
            days_raw = get_app_setting("auto_confirm_days", "30")
            days = int(days_raw)
        except (TypeError, ValueError):
            days = 30
        if days < 1:
            days = 30
        threshold = timedelta(days=days)

        try:
            issues = supabase_req("GET", "/issues", params={
                "status": "in.(resolved,closed)",
                "select": "id,status,confirmed_fix,dev_item_id,task_id,user_task_id,epic_id,resolved_at",
            })
        except Exception as exc:
            logger.error("auto_confirm_issues: failed to fetch issues: %s", exc)
            return

        candidates = [
            i for i in (issues or [])
            if not i.get("confirmed_fix") and i.get("resolved_at")
        ]
        if not candidates:
            return

        dev_item_ids  = [i["dev_item_id"]  for i in candidates if i.get("dev_item_id")]
        task_ids      = [i["task_id"]      for i in candidates if i.get("task_id")]
        user_task_ids = [i["user_task_id"] for i in candidates if i.get("user_task_id")]
        epic_ids      = [i["epic_id"]      for i in candidates if i.get("epic_id")]

        def _safe_get(path, params):
            try:
                return supabase_req("GET", path, params=params) or []
            except Exception as exc:
                logger.warning("auto_confirm_issues: fetch %s failed: %s", path, exc)
                return []

        # ── Batch-fetch linked entities (status + their own updated_at) ──
        dev_items_by_id = {}
        if dev_item_ids:
            rows = _safe_get("/dev_items", {
                "id": f"in.({_in_filter(dev_item_ids)})", "select": "id,status,updated_at",
            })
            dev_items_by_id = {r["id"]: r for r in rows}

        tasks_by_id = {}
        if task_ids:
            rows = _safe_get("/tasks", {
                "id": f"in.({_in_filter(task_ids)})", "select": "id,status,updated_at",
            })
            tasks_by_id = {r["id"]: r for r in rows}

        user_tasks_by_id = {}
        if user_task_ids:
            rows = _safe_get("/user_tasks", {
                "id": f"in.({_in_filter(user_task_ids)})", "select": "id,status,department_name,updated_at",
            })
            user_tasks_by_id = {r["id"]: r for r in rows}

        epics_by_id = {}
        if epic_ids:
            rows = _safe_get("/epics", {
                "epic_id": f"in.({_in_filter(epic_ids)})", "select": "epic_id,epic_status,date_modified",
            })
            epics_by_id = {r["epic_id"]: r for r in rows}

        # task_statuses is a small reference table — fetch it whole once.
        status_rows = _safe_get("/task_statuses", {"select": "scope,department_name,slug,is_terminal"})
        admin_terminal = {}
        dept_terminal  = {}
        for r in status_rows:
            if r.get("scope") == "admin":
                admin_terminal[r.get("slug")] = bool(r.get("is_terminal"))
            elif r.get("scope") == "department":
                dept_terminal[(r.get("department_name"), r.get("slug"))] = bool(r.get("is_terminal"))

        # ── Batch-fetch activity logs/comments, grouped by their FK ──
        issue_ids = [i["id"] for i in candidates]
        comment_max = _latest_by_key(
            _safe_get("/issue_comments", {"issue_id": f"in.({_in_filter(issue_ids)})", "select": "issue_id,created_at"}),
            "issue_id", "created_at",
        )
        dev_log_max = _latest_by_key(
            _safe_get("/dev_item_logs", {"item_id": f"in.({_in_filter(dev_item_ids)})", "select": "item_id,created_at"}) if dev_item_ids else [],
            "item_id", "created_at",
        )
        dev_activity_max = _latest_by_key(
            _safe_get("/dev_activity_logs", {"item_id": f"in.({_in_filter(dev_item_ids)})", "select": "item_id,created_at"}) if dev_item_ids else [],
            "item_id", "created_at",
        )
        admin_task_ids_for_log = task_ids + user_task_ids  # task_activity_logs is shared across both kinds
        task_activity_max = _latest_by_key(
            _safe_get("/task_activity_logs", {"task_id": f"in.({_in_filter(admin_task_ids_for_log)})", "select": "task_id,created_at"}) if admin_task_ids_for_log else [],
            "task_id", "created_at",
        )
        task_item_log_max = _latest_by_key(
            _safe_get("/task_item_logs", {"task_id": f"in.({_in_filter(user_task_ids)})", "select": "task_id,created_at"}) if user_task_ids else [],
            "task_id", "created_at",
        )
        epic_comment_max = _latest_by_key(
            _safe_get("/epic_comments", {"epic_id": f"in.({_in_filter(epic_ids)})", "select": "epic_id,created_at"}) if epic_ids else [],
            "epic_id", "created_at",
        )

        now = datetime.now(timezone.utc)
        confirmed = 0

        for issue in candidates:
            issue_id      = issue["id"]
            dev_item_id   = issue.get("dev_item_id")
            task_id       = issue.get("task_id")
            user_task_id  = issue.get("user_task_id")
            epic_id       = issue.get("epic_id")

            # Skip if linked to anything still active. A link whose target row is
            # missing (deleted) is treated as not-blocking; a link whose status
            # metadata can't be resolved is treated conservatively as blocking.
            blocked = False
            if dev_item_id:
                row = dev_items_by_id.get(dev_item_id)
                if row and row.get("status") != "done":
                    blocked = True
            if not blocked and task_id:
                row = tasks_by_id.get(task_id)
                if row:
                    is_terminal = admin_terminal.get(row.get("status"))
                    if not is_terminal:
                        blocked = True
            if not blocked and user_task_id:
                row = user_tasks_by_id.get(user_task_id)
                if row:
                    is_terminal = dept_terminal.get((row.get("department_name"), row.get("status")))
                    if not is_terminal:
                        blocked = True
            if not blocked and epic_id:
                row = epics_by_id.get(epic_id)
                if row and row.get("epic_status") not in ("done", "cancelled"):
                    blocked = True
            if blocked:
                continue

            last_activity = _max_ts(
                issue.get("resolved_at"),
                comment_max.get(issue_id).isoformat() if comment_max.get(issue_id) else None,
            )
            if dev_item_id:
                dev_row = dev_items_by_id.get(dev_item_id)
                last_activity = _max_ts(
                    last_activity.isoformat() if last_activity else None,
                    (dev_row or {}).get("updated_at"),
                    dev_log_max.get(dev_item_id).isoformat() if dev_log_max.get(dev_item_id) else None,
                    dev_activity_max.get(dev_item_id).isoformat() if dev_activity_max.get(dev_item_id) else None,
                )
            if task_id:
                task_row = tasks_by_id.get(task_id)
                last_activity = _max_ts(
                    last_activity.isoformat() if last_activity else None,
                    (task_row or {}).get("updated_at"),
                    task_activity_max.get(task_id).isoformat() if task_activity_max.get(task_id) else None,
                )
            if user_task_id:
                ut_row = user_tasks_by_id.get(user_task_id)
                last_activity = _max_ts(
                    last_activity.isoformat() if last_activity else None,
                    (ut_row or {}).get("updated_at"),
                    task_activity_max.get(user_task_id).isoformat() if task_activity_max.get(user_task_id) else None,
                    task_item_log_max.get(user_task_id).isoformat() if task_item_log_max.get(user_task_id) else None,
                )
            if epic_id:
                epic_row = epics_by_id.get(epic_id)
                last_activity = _max_ts(
                    last_activity.isoformat() if last_activity else None,
                    (epic_row or {}).get("date_modified"),
                    epic_comment_max.get(epic_id).isoformat() if epic_comment_max.get(epic_id) else None,
                )

            if last_activity is None or now - last_activity < threshold:
                continue

            try:
                supabase_req("PATCH", "/issues", data={
                    "confirmed_fix":    True,
                    "confirmed_fix_at": now.isoformat(),
                }, params={"id": f"eq.{issue_id}"})
                supabase_req("POST", "/issue_comments", data={
                    "issue_id": issue_id,
                    "username": "System",
                    "comment":  f"Auto-confirmed after {days} day(s) of inactivity.",
                })
                confirmed += 1
            except Exception as exc:
                logger.warning("auto_confirm_issues: failed to confirm %s: %s", issue_id, exc)

        if confirmed:
            logger.info("auto_confirm_issues: auto-confirmed %d issue(s)", confirmed)


def start_scheduler(app):
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
    except ImportError:
        logger.warning("APScheduler not installed — resolution reminders disabled. Run: pip install apscheduler")
        return

    scheduler = BackgroundScheduler(timezone="UTC")
    # Run daily at 08:00 UTC
    scheduler.add_job(
        func=_run_resolution_reminders,
        args=[app],
        trigger="cron",
        hour=8,
        minute=0,
        id="resolution_reminders",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    # Run daily at 08:15 UTC — after the reminder job so a reminder for an issue
    # can't fire in the same run it also gets auto-confirmed in.
    scheduler.add_job(
        func=_run_auto_confirm_issues,
        args=[app],
        trigger="cron",
        hour=8,
        minute=15,
        id="auto_confirm_issues",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    scheduler.start()
    logger.info("Scheduler started — resolution reminders will run daily at 08:00 UTC, auto-confirm at 08:15 UTC")
    return scheduler
