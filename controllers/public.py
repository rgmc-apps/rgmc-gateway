import requests
from datetime import datetime, timezone
from flask import Blueprint, render_template, jsonify, request, redirect

from config import HEALTH_CHECKS
from services.sites import get_sites
from services.supabase import supabase_req

public_bp = Blueprint("public", __name__)


@public_bp.get("/")
def index():
    all_sites     = get_sites()
    rgmc_sites    = [s for s in all_sites if s.get("category") == "RGMC"       and not s.get("is_windows_based") and not s.get("is_task")]
    sbic_sites    = [s for s in all_sites if s.get("category") == "SBIC"       and not s.get("is_windows_based") and not s.get("is_task")]
    nav_sites     = [s for s in all_sites if s.get("category") == "NAV Sites"  and not s.get("is_windows_based") and not s.get("is_task")]
    windows_sites = [s for s in all_sites if s.get("is_windows_based")         and not s.get("is_task")]
    task_sites    = [s for s in all_sites if s.get("is_task")]
    return render_template(
        "index.html",
        sites=all_sites,
        rgmc_sites=rgmc_sites,
        sbic_sites=sbic_sites,
        nav_sites=nav_sites,
        windows_sites=windows_sites,
        task_sites=task_sites,
    )


@public_bp.get("/report-issue")
def report_issue_page():
    return render_template("report_issue.html")


@public_bp.get("/helpdesk")
def helpdesk_page():
    return render_template("helpdesk.html")


@public_bp.get("/api/helpdesk/categories")
def get_helpdesk_categories():
    rows = supabase_req("GET", "/request_category", params={
        "order":          "category_id.asc",
        "select":         "category_id,category_name,category_desc,category_group",
        "category_group": "eq.IT",
    })
    return jsonify(rows or [])


@public_bp.get("/api/helpdesk/subcategories")
def get_helpdesk_subcategories():
    category = request.args.get("category", "").strip()
    if not category:
        return jsonify([])
    if category == "Software/Application":
        rows = supabase_req("GET", "/systems", params={
            "is_visible": "eq.true",
            "order":      "sort_order.asc,name.asc",
            "select":     "id,name",
        })
        items = [{"value": r["id"], "label": r["name"]} for r in (rows or [])]
    else:
        rows = supabase_req("GET", "/non_software_items", params={
            "category":   f"eq.{category}",
            "is_visible": "eq.true",
            "order":      "id.asc",
            "select":     "subcategory",
        })
        items = [{"value": r["subcategory"], "label": r["subcategory"]} for r in (rows or [])]
    return jsonify(items)


@public_bp.get("/api/helpdesk/request-types")
def get_helpdesk_request_types():
    category = request.args.get("category", "").strip()
    if not category:
        return jsonify([])
    rows = supabase_req("GET", "/request_type", params={
        "request_category": f"eq.{category}",
        "is_visible":       "eq.true",
        "order":            "id.asc",
        "select":           "id,request_type",
    })
    return jsonify(rows or [])


@public_bp.get("/api/general-helpdesk/categories")
def get_general_helpdesk_categories():
    group  = request.args.get("group", "").strip()
    params = {
        "order":  "category_id.asc",
        "select": "category_id,category_name,category_desc,category_group",
    }
    if group:
        params["category_group"] = f"in.({group},General)"
    else:
        params["category_group"] = "neq.IT"
    rows = supabase_req("GET", "/request_category", params=params)
    return jsonify(rows or [])


@public_bp.get("/api/general-helpdesk/request-types")
def get_general_helpdesk_request_types():
    category = request.args.get("category", "").strip()
    if not category:
        return jsonify([])
    rows = supabase_req("GET", "/request_type", params={
        "request_category": f"eq.{category}",
        "is_visible":       "eq.true",
        "order":            "id.asc",
        "select":           "id,request_type",
    })
    return jsonify(rows or [])


@public_bp.get("/api/companies")
def get_companies():
    rows = supabase_req("GET", "/companies", params={"order": "name.asc", "select": "company_code,name"})
    return jsonify(rows or [])


@public_bp.get("/api/departments")
def get_departments():
    rows = supabase_req("GET", "/departments", params={
        "is_active": "eq.true",
        "order":     "department_name.asc",
        "select":    "department_id,department_name,department_code",
    })
    return jsonify(rows or [])


@public_bp.get("/api/systems/by-tag")
def system_by_tag():
    tag = request.args.get("tag", "").strip().lower()
    if not tag:
        return jsonify({"error": "tag parameter is required"}), 400

    try:
        rows = supabase_req("GET", "/systems", params={
            "select": "id,name,primary_url,primary_label,backup_url",
            "order":  "sort_order.asc,name.asc",
        })
    except Exception:
        return jsonify({"error": "Failed to fetch systems"}), 500

    matches = []
    for row in (rows or []):
        row_tags = [t.strip().lower() for t in (row.get("tags") or "").split(",") if t.strip()]
        if tag in row_tags:
            matches.append({
                "id":            row["id"],
                "name":          row["name"],
                "primary_url":   row.get("primary_url"),
                "primary_label": row.get("primary_label"),
                "backup_url":    row.get("backup_url"),
            })

    if not matches:
        return jsonify({"error": f"No system found for tag '{tag}'"}), 404

    return jsonify(matches)


@public_bp.get("/api/public/issues/<issue_id>")
def get_public_issue(issue_id):
    rows = supabase_req("GET", "/issues", params={
        "id":     f"eq.{issue_id}",
        "select": (
            "id,ticket_number,title,description,status,priority,"
            "site_name,employee_name,company_name,department,"
            "ticket_type,request_category,request_subcategory,"
            "from_helpdesk,error_code,assigned_to,resolved_by,"
            "created_at,resolved_at,resolution_notes,attachment_urls,"
            "dev_item_id,task_id,user_task_id,"
            "confirmed_fix,confirmed_fix_at"
        ),
    })
    if not rows:
        return jsonify({"error": "Not found"}), 404
    return jsonify(rows[0])


@public_bp.get("/api/public/issues/<issue_id>/confirm-fix")
def public_confirm_fix(issue_id):
    from config import GATEWAY_BASE_URL
    base     = (GATEWAY_BASE_URL or "").rstrip("/")
    back_url = f"{base}/admin/issues/{issue_id}"

    rows = supabase_req("GET", "/issues", params={
        "id":     f"eq.{issue_id}",
        "select": "id,status,confirmed_fix",
    })
    if not rows:
        return redirect(back_url)

    issue = rows[0]
    if issue.get("status") not in ("resolved", "closed"):
        return redirect(back_url)
    if issue.get("confirmed_fix"):
        return redirect(f"{back_url}?confirmed=1")

    supabase_req("PATCH", "/issues", data={
        "confirmed_fix":    True,
        "confirmed_fix_at": datetime.now(timezone.utc).isoformat(),
    }, params={"id": f"eq.{issue_id}"})

    return redirect(f"{back_url}?confirmed=1")


@public_bp.post("/api/public/issues/<issue_id>/still-having-issues")
def public_still_having_issues(issue_id):
    body          = request.get_json(silent=True) or {}
    issue_desc    = (body.get("issue_description") or "").strip()
    confirm_steps = (body.get("confirm_steps") or "").strip()

    if not issue_desc or not confirm_steps:
        return jsonify({"error": "Both fields are required"}), 400

    rows = supabase_req("GET", "/issues", params={
        "id":     f"eq.{issue_id}",
        "select": "id,status,description",
    })
    if not rows:
        return jsonify({"error": "Issue not found"}), 404

    issue = rows[0]
    if issue.get("status") not in ("resolved", "closed"):
        return jsonify({"error": "Issue is not resolved"}), 400

    append_block = (
        "\n\n---\n"
        "[Reporter: Still Having Issues]\n"
        f"Issue description: {issue_desc}\n"
        f"Steps taken to confirm: {confirm_steps}"
    )
    new_description = (issue.get("description") or "") + append_block

    supabase_req("PATCH", "/issues", data={
        "status":        "open",
        "confirmed_fix": False,
        "description":   new_description,
    }, params={"id": f"eq.{issue_id}"})

    return jsonify({"success": True})


@public_bp.get("/api/public/dev-items/<item_id>")
def get_public_dev_item(item_id):
    rows = supabase_req("GET", "/dev_items", params={
        "id":     f"eq.{item_id}",
        "select": "id,title,status,dev_item_type,estimated_end_date,created_at",
    })
    if not rows:
        return jsonify({"error": "Not found"}), 404
    return jsonify(rows[0])


@public_bp.get("/api/public/tasks/<task_id>")
def get_public_task(task_id):
    rows = supabase_req("GET", "/tasks", params={
        "id":     f"eq.{task_id}",
        "select": "id,task_name,task_type,status,estimated_end_date,actual_end_date,created_at",
    })
    if not rows:
        return jsonify({"error": "Not found"}), 404
    return jsonify(rows[0])


@public_bp.get("/api/public/user-tasks/<task_id>")
def get_public_user_task(task_id):
    rows = supabase_req("GET", "/user_tasks", params={
        "id":     f"eq.{task_id}",
        "select": "id,title,status,created_at",
    })
    if not rows:
        return jsonify({"error": "Not found"}), 404
    return jsonify(rows[0])


@public_bp.get("/api/health")
def health_check():
    results = []
    for check in HEALTH_CHECKS:
        api_result = {"id": check["id"], "name": check["name"], "endpoints": []}
        for ep in check["endpoints"]:
            url = check["base_url"] + ep["path"]
            try:
                resp = requests.get(url, timeout=10)
                if ep.get("parse_connections"):
                    try:
                        connections = resp.json()
                        all_ok = all(c.get("connected", False) for c in connections) if connections else False
                        api_result["endpoints"].append({
                            "path":        ep["path"],
                            "label":       ep["label"],
                            "status":      "ok" if all_ok else "error",
                            "connections": connections,
                        })
                    except Exception:
                        api_result["endpoints"].append({
                            "path":   ep["path"],
                            "label":  ep["label"],
                            "status": "error",
                            "error":  "Invalid JSON response",
                        })
                elif ep.get("parse_bc_status"):
                    try:
                        data = resp.json()
                        api_result["endpoints"].append({
                            "path":        ep["path"],
                            "label":       ep["label"],
                            "status":      "ok" if data.get("status") == "ok" else "error",
                            "http_status": resp.status_code,
                            "response":    data,
                        })
                    except Exception:
                        api_result["endpoints"].append({
                            "path":   ep["path"],
                            "label":  ep["label"],
                            "status": "error",
                            "error":  "Invalid JSON response",
                        })
                else:
                    try:
                        data = resp.json()
                    except Exception:
                        data = resp.text
                    api_result["endpoints"].append({
                        "path":        ep["path"],
                        "label":       ep["label"],
                        "status":      "ok" if resp.status_code < 400 else "error",
                        "http_status": resp.status_code,
                        "response":    data,
                    })
            except requests.Timeout:
                api_result["endpoints"].append({
                    "path":   ep["path"],
                    "label":  ep["label"],
                    "status": "timeout",
                    "error":  "Request timed out",
                })
            except Exception as exc:
                api_result["endpoints"].append({
                    "path":   ep["path"],
                    "label":  ep["label"],
                    "status": "error",
                    "error":  str(exc),
                })
        results.append(api_result)
    return jsonify(results)
