import requests
from flask import Blueprint, render_template, jsonify, request

from config import HEALTH_CHECKS
from services.sites import get_sites
from services.supabase import supabase_req

public_bp = Blueprint("public", __name__)


@public_bp.get("/")
def index():
    return render_template("index.html", sites=get_sites())


@public_bp.get("/report-issue")
def report_issue_page():
    return render_template("report_issue.html")


@public_bp.get("/helpdesk")
def helpdesk_page():
    return render_template("helpdesk.html")


@public_bp.get("/api/helpdesk/categories")
def get_helpdesk_categories():
    rows = supabase_req("GET", "/request_category", params={
        "order":  "category_id.asc",
        "select": "category_id,category_name,category_desc,category_group",
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
