from flask import current_app

from services.supabase import supabase_req

_DEV_PERF_STATUSES = ("pending", "ongoing", "coding", "testing", "done")


def build_dev_performance_report() -> list:
    """Aggregates per-developer workload (dev items, tasks, issues) for the admin and developer dashboards."""
    users = supabase_req("GET", "/users", params={
        "is_developer": "eq.true",
        "select":       "username,first_name,last_name,display_name,avatar_url,company,department,position,email,is_admin,is_developer,github_username",
    })

    items = supabase_req("GET", "/dev_items", params={
        "select": "id,title,status,system_id,dev_item_type,start_date,estimated_end_date,actual_end_date,created_by,created_at",
        "order":  "created_at.desc",
    })

    try:
        systems = supabase_req("GET", "/systems", params={"select": "id,name"})
        sys_map = {s["id"]: s["name"] for s in (systems or [])}
    except Exception:
        sys_map = {}

    try:
        tasks = supabase_req("GET", "/tasks", params={
            "select": "id,task_name,task_type,status,start_date,estimated_end_date,actual_end_date,created_by,created_at",
            "order":  "created_at.desc",
        })
    except Exception as exc:
        current_app.logger.error("build_dev_performance_report tasks: %s", exc)
        tasks = []

    try:
        issues = supabase_req("GET", "/issues", params={
            "select": "id,title,ticket_number,status,site_name,assigned_to,request_category,priority,created_at",
            "order":  "created_at.desc",
        })
    except Exception as exc:
        current_app.logger.error("build_dev_performance_report issues: %s", exc)
        issues = []

    items_by_dev = {}
    for item in (items or []):
        key = item.get("created_by") or ""
        items_by_dev.setdefault(key, []).append(item)

    tasks_by_dev = {}
    for task in (tasks or []):
        key = task.get("created_by") or ""
        tasks_by_dev.setdefault(key, []).append(task)

    issues_by_dev = {}
    for issue in (issues or []):
        key = issue.get("assigned_to") or ""
        issues_by_dev.setdefault(key, []).append(issue)

    result = []
    for user in (users or []):
        uname      = user["username"]
        user_items = items_by_dev.get(uname, [])
        counts     = {s: 0 for s in _DEV_PERF_STATUSES}
        for item in user_items:
            s = item.get("status") or ""
            if s in counts:
                counts[s] += 1
        counts["total"] = sum(counts[s] for s in _DEV_PERF_STATUSES)

        sys_ids   = {item["system_id"] for item in user_items if item.get("system_id")}
        sys_names = sorted(sys_map.get(sid, sid) for sid in sys_ids)

        enriched = [{
            "id":                 i["id"],
            "title":              i.get("title") or "",
            "status":             i.get("status") or "",
            "dev_item_type":      i.get("dev_item_type") or "",
            "system_name":        sys_map.get(i["system_id"], "") if i.get("system_id") else "",
            "start_date":         i.get("start_date") or "",
            "estimated_end_date": i.get("estimated_end_date") or "",
            "actual_end_date":    i.get("actual_end_date") or "",
            "created_at":         i.get("created_at") or "",
        } for i in user_items]

        enriched_tasks = [{
            "id":                 t["id"],
            "task_name":          t.get("task_name") or "",
            "task_type":          t.get("task_type") or "",
            "status":             t.get("status") or "",
            "start_date":         t.get("start_date") or "",
            "estimated_end_date": t.get("estimated_end_date") or "",
            "actual_end_date":    t.get("actual_end_date") or "",
            "created_at":         t.get("created_at") or "",
        } for t in tasks_by_dev.get(uname, [])]

        enriched_issues = [{
            "id":               iss["id"],
            "title":            iss.get("title") or "",
            "ticket_number":    iss.get("ticket_number") or "",
            "status":           iss.get("status") or "",
            "site_name":        iss.get("site_name") or "",
            "request_category": iss.get("request_category") or "",
            "priority":         iss.get("priority") or "",
            "created_at":       iss.get("created_at") or "",
        } for iss in issues_by_dev.get(uname, [])]

        result.append({
            "username":     uname,
            "first_name":   user.get("first_name") or "",
            "last_name":    user.get("last_name") or "",
            "display_name": user.get("display_name") or "",
            "avatar_url":   user.get("avatar_url") or "",
            "email":        user.get("email") or "",
            "company":      user.get("company") or "",
            "department":   user.get("department") or "",
            "position":     user.get("position") or "",
            "is_admin":     bool(user.get("is_admin")),
            "is_developer": bool(user.get("is_developer")),
            "github_username": user.get("github_username") or "",
            "counts":       counts,
            "systems":      sys_names,
            "items":        enriched,
            "tasks":        enriched_tasks,
            "issues":       enriched_issues,
        })

    result.sort(key=lambda u: (-u["counts"]["total"], (u["first_name"] + u["last_name"]).lower()))
    return result
