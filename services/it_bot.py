import logging
import requests
from config import IT_BOT_URL, IT_BOT_API_KEY

logger = logging.getLogger(__name__)


def _headers() -> dict:
    return {
        "Content-Type": "application/json",
        "x-api-key": IT_BOT_API_KEY,
    }


def _ready() -> bool:
    return bool(IT_BOT_URL and IT_BOT_API_KEY)


def notify_ticket_created(ticket: dict) -> None:
    """POST ticket.created event to the IT bot. Fire-and-forget — never raises."""
    if not _ready():
        return
    try:
        requests.post(
            f"{IT_BOT_URL.rstrip('/')}/api/notify/ticket-created",
            headers=_headers(),
            json={"event": "ticket.created", "ticket": ticket},
            timeout=5,
        )
    except Exception as exc:
        logger.warning("IT bot notify_ticket_created failed: %s", exc)


def notify_ticket_updated(ticket: dict, changes: dict) -> None:
    """POST ticket.updated event to the IT bot. Fire-and-forget — never raises."""
    if not _ready() or not changes:
        return
    try:
        requests.post(
            f"{IT_BOT_URL.rstrip('/')}/api/notify/ticket-updated",
            headers=_headers(),
            json={"event": "ticket.updated", "ticket": ticket, "changes": changes},
            timeout=5,
        )
    except Exception as exc:
        logger.warning("IT bot notify_ticket_updated failed: %s", exc)


def notify_issue_promoted_to_dev(ticket: dict, dev_item: dict) -> None:
    """POST issue.promoted_to_dev event to the IT bot. Fire-and-forget — never raises."""
    if not _ready():
        return
    try:
        requests.post(
            f"{IT_BOT_URL.rstrip('/')}/api/notify/ticket-updated",
            headers=_headers(),
            json={
                "event":  "ticket.updated",
                "ticket": ticket,
                "changes": {
                    "dev_item_id": {
                        "from": None,
                        "to":   dev_item.get("id"),
                    },
                    "promoted_to_dev": {
                        "from": None,
                        "to":   dev_item.get("dev_item_code") or dev_item.get("title"),
                    },
                    **({"assigned_to": {"from": None, "to": ticket.get("assigned_to")}}
                       if ticket.get("assigned_to") else {}),
                },
            },
            timeout=5,
        )
    except Exception as exc:
        logger.warning("IT bot notify_issue_promoted_to_dev failed: %s", exc)


def notify_issue_promoted_to_task(ticket: dict, task: dict) -> None:
    """POST issue.promoted_to_task event to the IT bot. Fire-and-forget — never raises."""
    if not _ready():
        return
    try:
        requests.post(
            f"{IT_BOT_URL.rstrip('/')}/api/notify/ticket-updated",
            headers=_headers(),
            json={
                "event":  "ticket.updated",
                "ticket": ticket,
                "changes": {
                    "task_id": {
                        "from": None,
                        "to":   task.get("id"),
                    },
                    "promoted_to_task": {
                        "from": None,
                        "to":   task.get("task_name"),
                    },
                    **({"assigned_to": {"from": None, "to": ticket.get("assigned_to")}}
                       if ticket.get("assigned_to") else {}),
                },
            },
            timeout=5,
        )
    except Exception as exc:
        logger.warning("IT bot notify_issue_promoted_to_task failed: %s", exc)


def notify_issue_promoted_to_epic(ticket: dict, epic: dict) -> None:
    """POST issue.promoted_to_epic event to the IT bot. Fire-and-forget — never raises."""
    if not _ready():
        return
    try:
        requests.post(
            f"{IT_BOT_URL.rstrip('/')}/api/notify/ticket-updated",
            headers=_headers(),
            json={
                "event":  "ticket.updated",
                "ticket": ticket,
                "changes": {
                    "epic_id": {
                        "from": None,
                        "to":   epic.get("epic_id"),
                    },
                    "promoted_to_epic": {
                        "from": None,
                        "to":   epic.get("epic_name"),
                    },
                },
            },
            timeout=5,
        )
    except Exception as exc:
        logger.warning("IT bot notify_issue_promoted_to_epic failed: %s", exc)


def build_changes(before: dict, patch: dict) -> dict:
    """Return a TicketChanges dict comparing before-state to patch fields."""
    changes = {}
    for field, new_val in patch.items():
        old_val = before.get(field)
        if old_val != new_val:
            changes[field] = {
                "from": str(old_val) if old_val is not None else None,
                "to":   str(new_val) if new_val is not None else None,
            }
    return changes
