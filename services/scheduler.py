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
    scheduler.start()
    logger.info("Scheduler started — resolution reminders will run daily at 08:00 UTC")
    return scheduler
