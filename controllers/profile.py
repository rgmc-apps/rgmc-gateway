import base64 as _b64
import requests
from flask import Blueprint, request, jsonify, render_template, current_app, redirect

from config import SUPABASE_URL, SUPABASE_SERVICE_KEY, GATEWAY_BASE_URL
from services.supabase import supabase_req
from services import github as github_service
from services.shift import validate_shift_fields

profile_bp = Blueprint("profile", __name__)


@profile_bp.get("/profile")
def profile_page():
    return render_template("profile.html")


@profile_bp.get("/api/profile")
def api_profile_get():
    username = request.headers.get("X-Gateway-Username", "").strip().lower()
    if not username:
        return jsonify({"error": "Not authenticated"}), 401
    try:
        rows = supabase_req("GET", "/users", params={
            "username": f"eq.{username}",
            "select":   "username,first_name,middle_initial,last_name,display_name,avatar_url,company,department,position,email,viber_number,anydesk_id,password_hash,is_developer,github_username,shift_days,shift_start,shift_end",
        })
    except Exception as exc:
        current_app.logger.error("Profile GET failed: %s", exc)
        return jsonify({"error": "Failed to fetch profile"}), 500
    if not rows:
        return jsonify({"error": "User not found"}), 404
    u = rows[0]
    return jsonify({
        "username":        u["username"],
        "first_name":      u.get("first_name") or "",
        "middle_initial":  u.get("middle_initial") or "",
        "last_name":       u.get("last_name") or "",
        "display_name":    u.get("display_name") or "",
        "avatar_url":      u.get("avatar_url") or "",
        "company":         u.get("company") or "",
        "department":      u.get("department") or "",
        "position":        u.get("position") or "",
        "email":           u.get("email") or "",
        "viber_number":    u.get("viber_number") or "",
        "anydesk_id":      u.get("anydesk_id") or "",
        "has_password":    bool(u.get("password_hash")),
        "is_developer":    bool(u.get("is_developer")),
        "github_username": u.get("github_username") or "",
        "shift_days":      u.get("shift_days") or [],
        "shift_start":     (u.get("shift_start") or "")[:5] or None,
        "shift_end":       (u.get("shift_end") or "")[:5] or None,
    })


@profile_bp.patch("/api/profile")
def api_profile_patch():
    username = request.headers.get("X-Gateway-Username", "").strip().lower()
    if not username:
        return jsonify({"error": "Not authenticated"}), 401
    data  = request.get_json(force=True, silent=True) or {}
    patch = {}
    if "display_name" in data:
        dn = str(data["display_name"]).strip()[:80]
        patch["display_name"] = dn or None
    for field in ("first_name", "middle_initial", "last_name", "company", "department", "position", "email", "viber_number", "anydesk_id"):
        if field in data:
            patch[field] = str(data[field]).strip()[:120] or None
    try:
        patch.update(validate_shift_fields(data))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not patch:
        return jsonify({"success": True})
    try:
        supabase_req("PATCH", "/users", data=patch, params={"username": f"eq.{username}"})
    except Exception as exc:
        current_app.logger.error("Profile PATCH failed: %s", exc)
        return jsonify({"error": "Failed to update profile"}), 500
    return jsonify({"success": True})


@profile_bp.post("/api/profile/avatar")
def api_profile_avatar_upload():
    username = request.headers.get("X-Gateway-Username", "").strip().lower()
    if not username:
        return jsonify({"error": "Not authenticated"}), 401

    body     = request.get_json(force=True, silent=True) or {}
    data_url = body.get("avatar", "")
    if not data_url or not str(data_url).startswith("data:image/"):
        return jsonify({"error": "Invalid image data"}), 400

    try:
        header, b64 = data_url.split(",", 1)
        image_bytes = _b64.b64decode(b64)
    except Exception:
        return jsonify({"error": "Failed to decode image"}), 400

    content_type = "image/jpeg"
    if "image/png"  in header: content_type = "image/png"
    if "image/webp" in header: content_type = "image/webp"
    ext      = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}.get(content_type, "jpg")
    filename = f"{username}.{ext}"

    try:
        resp = requests.put(
            f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/avatars/{filename}",
            headers={
                "apikey":        SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type":  content_type,
                "x-upsert":      "true",
            },
            data=image_bytes,
            timeout=20,
        )
        resp.raise_for_status()
    except Exception as exc:
        current_app.logger.error("Avatar storage upload failed: %s", exc)
        return jsonify({"error": "Failed to upload avatar"}), 500

    public_url = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/public/avatars/{filename}"
    try:
        supabase_req("PATCH", "/users", data={"avatar_url": public_url},
                     params={"username": f"eq.{username}"})
    except Exception as exc:
        current_app.logger.error("Avatar URL save failed: %s", exc)
        return jsonify({"error": "Failed to save avatar URL"}), 500

    return jsonify({"success": True, "avatar_url": public_url})


@profile_bp.delete("/api/profile/avatar")
def api_profile_avatar_delete():
    username = request.headers.get("X-Gateway-Username", "").strip().lower()
    if not username:
        return jsonify({"error": "Not authenticated"}), 401

    for ext in ("jpg", "jpeg", "png", "webp"):
        try:
            requests.delete(
                f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/avatars/{username}.{ext}",
                headers={
                    "apikey":        SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                },
                timeout=10,
            )
        except Exception:
            pass

    try:
        supabase_req("PATCH", "/users", data={"avatar_url": None},
                     params={"username": f"eq.{username}"})
    except Exception as exc:
        current_app.logger.error("Avatar clear failed: %s", exc)
        return jsonify({"error": "Failed to remove avatar"}), 500

    return jsonify({"success": True, "avatar_url": ""})


def _github_redirect_uri() -> str:
    return f"{GATEWAY_BASE_URL.rstrip('/')}/api/profile/github/callback"


@profile_bp.get("/api/profile/github/connect")
def api_profile_github_connect():
    username = request.args.get("u", "").strip().lower()
    if not username:
        return jsonify({"error": "Missing username"}), 400
    if not github_service.is_configured():
        return jsonify({"error": "GitHub linking is not configured on this server"}), 503
    if not GATEWAY_BASE_URL:
        return jsonify({"error": "GATEWAY_BASE_URL is not configured on this server"}), 503

    state = github_service.sign_state(username)
    url   = github_service.build_authorize_url(state, _github_redirect_uri())
    return redirect(url)


@profile_bp.get("/api/profile/github/callback")
def api_profile_github_callback():
    error = request.args.get("error")
    if error:
        return redirect(f"/profile?github=error&msg={requests.utils.quote(error)}")

    code  = request.args.get("code", "")
    state = request.args.get("state", "")
    username = github_service.verify_state(state) if state else None
    if not code or not username:
        return redirect("/profile?github=error&msg=Invalid+or+expired+request")

    try:
        token = github_service.exchange_code_for_token(code, _github_redirect_uri())
        login = github_service.fetch_authenticated_login(token)
    except Exception as exc:
        current_app.logger.error("GitHub OAuth exchange failed: %s", exc)
        return redirect("/profile?github=error&msg=GitHub+authorization+failed")

    try:
        supabase_req("PATCH", "/users", data={"github_username": login},
                     params={"username": f"eq.{username}"})
    except Exception as exc:
        current_app.logger.error("GitHub username save failed: %s", exc)
        return redirect("/profile?github=error&msg=Failed+to+save+GitHub+account")

    return redirect(f"/profile?github=linked&login={requests.utils.quote(login)}")


@profile_bp.delete("/api/profile/github")
def api_profile_github_unlink():
    username = request.headers.get("X-Gateway-Username", "").strip().lower()
    if not username:
        return jsonify({"error": "Not authenticated"}), 401
    try:
        supabase_req("PATCH", "/users", data={"github_username": None},
                     params={"username": f"eq.{username}"})
    except Exception as exc:
        current_app.logger.error("GitHub unlink failed: %s", exc)
        return jsonify({"error": "Failed to unlink GitHub account"}), 500
    return jsonify({"success": True})
