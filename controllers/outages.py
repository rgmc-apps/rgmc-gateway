from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, current_app

from services.supabase import supabase_req
from services.guards import _require_admin

outages_bp = Blueprint("outages", __name__)


@outages_bp.get("/api/admin/outages")
def admin_get_outages():
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]
    try:
        rows = supabase_req("GET", "/outages", params={
            "select": "*",
            "order":  "created_at.desc",
        })
        return jsonify(rows or [])
    except Exception as exc:
        current_app.logger.error("admin_get_outages failed: %s", exc)
        return jsonify({"error": "Failed to fetch outages"}), 500


@outages_bp.route("/api/admin/outages/<outage_id>", methods=["PATCH"])
def admin_patch_outage(outage_id):
    _, err = _require_admin()
    if err:
        return jsonify(err[0]), err[1]
    body    = request.get_json(silent=True) or {}
    allowed = {"status", "notes"}
    patch   = {k: v for k, v in body.items() if k in allowed}
    if not patch:
        return jsonify({"error": "Nothing to update"}), 400
    if patch.get("status") == "resolved":
        patch["resolved_at"] = datetime.now(timezone.utc).isoformat()
    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        supabase_req("PATCH", "/outages", data=patch, params={"id": f"eq.{outage_id}"})
        return jsonify({"success": True})
    except Exception as exc:
        current_app.logger.error("admin_patch_outage failed: %s", exc)
        return jsonify({"error": "Update failed"}), 500


@outages_bp.get("/api/outage-check")
def outage_check():
    """Lightweight poll endpoint — returns active outages for the notification modal."""
    username = request.headers.get("X-Gateway-Username", "").strip().lower()
    if not username:
        return jsonify([])
    try:
        rows = supabase_req("GET", "/outages", params={
            "status": "in.(open,ongoing)",
            "select": "id,site_name,error_code,status,issue_ids,notification_count,triggered_at",
            "order":  "triggered_at.desc",
        })
        return jsonify(rows or [])
    except Exception as exc:
        current_app.logger.error("outage_check failed: %s", exc)
        return jsonify([])
