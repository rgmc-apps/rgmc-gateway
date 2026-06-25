import re
import uuid

import requests
from flask import Blueprint, current_app, jsonify, request

from config import SUPABASE_SERVICE_KEY, SUPABASE_URL
from services.supabase import supabase_req

resolution_bp = Blueprint("resolution", __name__)

BUCKET = "resolution-attachments"
MAX_FILE_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}


@resolution_bp.get("/api/actions")
def api_get_actions():
    try:
        rows = supabase_req("GET", "/actions", params={
            "is_active": "eq.true",
            "order":     "action_id.asc",
            "select":    "action_id,action_name,action_code,action_desc",
        })
        return jsonify(rows or [])
    except Exception as exc:
        current_app.logger.error("api_get_actions failed: %s", exc)
        return jsonify([])


@resolution_bp.post("/api/upload/resolution")
def api_upload_resolution():
    username = request.headers.get("X-Gateway-Username", "").strip().lower()
    if not username:
        return jsonify({"error": "Not authenticated"}), 401

    entity_type = request.form.get("entity_type", "").strip()
    entity_id   = request.form.get("entity_id", "").strip()

    if not entity_id or entity_type not in ("issue", "dev_item", "task"):
        return jsonify({"error": "Invalid entity_type or missing entity_id"}), 400

    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"error": "No file provided"}), 400

    content_type = f.content_type or "application/octet-stream"
    if content_type not in ALLOWED_TYPES:
        return jsonify({"error": "Only image files are allowed"}), 400

    data = f.read()
    if len(data) > MAX_FILE_BYTES:
        return jsonify({"error": "File too large (max 5 MB)"}), 400

    safe_name = re.sub(r"[^a-zA-Z0-9.\-_]", "_", f.filename)
    uid  = str(uuid.uuid4())[:8]
    path = f"{entity_id}/{uid}_{safe_name}"
    url  = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/{BUCKET}/{path}"

    try:
        resp = requests.put(
            url,
            headers={
                "apikey":        SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type":  content_type,
            },
            data=data,
            timeout=30,
        )
        resp.raise_for_status()
    except Exception as exc:
        current_app.logger.error("Resolution attachment upload failed: %s", exc)
        return jsonify({"error": "Upload failed"}), 500

    public_url = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/public/{BUCKET}/{path}"
    return jsonify({"url": public_url})
