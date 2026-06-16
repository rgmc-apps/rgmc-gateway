import requests
from flask import Blueprint, render_template, jsonify

from config import HEALTH_CHECKS
from services.sites import get_sites

public_bp = Blueprint("public", __name__)


@public_bp.get("/")
def index():
    return render_template("index.html", sites=get_sites())


@public_bp.get("/report-issue")
def report_issue_page():
    return render_template("report_issue.html")


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
