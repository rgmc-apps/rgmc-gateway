from services.supabase import supabase_req


def build_epic_comment_feed(epic_id: str) -> list[dict]:
    """Merge epic_comments, dev-item activity logs, and issue resolution notes
    for an epic into a single chronological feed. Shared by the developer-board
    epic comments panel and the public epic landing page."""
    comments = supabase_req("GET", "/epic_comments", params={
        "epic_id": f"eq.{epic_id}",
        "select":  "*",
        "order":   "created_at.asc",
    }) or []
    for c in comments:
        c["kind"] = "comment"
    entries = list(comments)

    dev_items = supabase_req("GET", "/dev_items", params={
        "epic_id": f"eq.{epic_id}",
        "select":  "id,dev_item_code,title",
    }) or []
    item_map = {i["id"]: i for i in dev_items}
    item_ids = list(item_map.keys())

    if item_ids:
        ids_csv = ",".join(item_ids)

        logs = supabase_req("GET", "/dev_activity_logs", params={
            "item_id": f"in.({ids_csv})",
            "select":  "id,item_id,username,message,hours_spent,created_at,attachment_urls",
        }) or []
        for log in logs:
            item = item_map.get(log.get("item_id"), {})
            entries.append({
                "kind":            "dev_log",
                "id":              f"log-{log.get('id')}",
                "username":        log.get("username"),
                "comment":         log.get("message"),
                "created_at":      log.get("created_at"),
                "hours_spent":     log.get("hours_spent"),
                "attachment_urls": log.get("attachment_urls"),
                "dev_item_id":     log.get("item_id"),
                "dev_item_code":   item.get("dev_item_code"),
                "dev_item_title":  item.get("title"),
            })

        issues = supabase_req("GET", "/issues", params={
            "dev_item_id":      f"in.({ids_csv})",
            "resolution_notes": "not.is.null",
            "select":           "id,ticket_number,dev_item_id,resolution_notes,resolved_by,resolved_at,resolution_attachment_urls",
        }) or []
        for iss in issues:
            if not (iss.get("resolution_notes") or "").strip():
                continue
            item = item_map.get(iss.get("dev_item_id"), {})
            entries.append({
                "kind":                "resolution_note",
                "id":                  f"res-{iss['id']}",
                "username":            iss.get("resolved_by"),
                "comment":             iss.get("resolution_notes"),
                "created_at":          iss.get("resolved_at"),
                "attachment_urls":     iss.get("resolution_attachment_urls"),
                "dev_item_id":         iss.get("dev_item_id"),
                "dev_item_code":       item.get("dev_item_code"),
                "dev_item_title":      item.get("title"),
                "issue_id":            iss.get("id"),
                "issue_ticket_number": iss.get("ticket_number"),
            })

    entries.sort(key=lambda e: e.get("created_at") or "")
    return entries
