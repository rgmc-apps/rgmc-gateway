import secrets
from datetime import datetime, timezone, timedelta

from flask import Blueprint, request, jsonify, render_template
from markupsafe import Markup, escape as html_escape
from werkzeug.security import generate_password_hash, check_password_hash

from config import SUPABASE_URL, SUPABASE_SERVICE_KEY, GATEWAY_BASE_URL
from services.supabase import supabase_req
from services.email import (
    send_approval_request_email,
    send_access_granted_email,
    send_access_rejected_email,
    send_password_reset_email,
)
from models.access import _approve_record, _reject_record, _full_name

auth_bp = Blueprint("auth", __name__)


def _get_user(username: str):
    """Return the users-table row for *username*, or None."""
    rows = supabase_req("GET", "/users", params={
        "username": f"eq.{username}",
        "select":   (
            "username,first_name,last_name,display_name,avatar_url,"
            "company,department,email,systems,is_admin,is_developer,"
            "is_management,is_department_head,password_hash"
        ),
    })
    return rows[0] if rows else None


@auth_bp.post("/verify-username")
def verify_username():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return jsonify({"success": False, "error": "Authentication system is not configured."}), 503

    username = request.form.get("username", "").strip().lower()
    password = request.form.get("password", "").strip()

    if not username:
        return jsonify({"success": False, "error": "Please enter your username."}), 400

    # 1. Check users table first — preferred path, has is_admin flag
    try:
        u = _get_user(username)
        if u:
            pw_hash = u.get("password_hash")

            # No password set yet — allow login, redirect to setup
            if not pw_hash:
                # Store username in session for the setup page via response flag
                first = u.get("first_name", "")
                last  = u.get("last_name", "")
                return jsonify({
                    "success":              True,
                    "needs_password_setup": True,
                    "username":             u["username"],
                    "first_name":           first,
                    "full_name":            f"{first} {last}".strip(),
                    "display_name":         u.get("display_name") or "",
                    "avatar_url":           u.get("avatar_url") or "",
                    "company":              u.get("company", ""),
                    "department":           u.get("department", ""),
                    "email":                u.get("email", ""),
                    "systems":              u.get("systems", []),
                    "is_admin":             u.get("is_admin", False),
                    "is_developer":         u.get("is_developer", False),
                    "is_management":        u.get("is_management", False),
                    "is_department_head":   u.get("is_department_head", False),
                })

            # Password is set — require it
            if not password:
                return jsonify({"success": False, "error": "Please enter your password."}), 401

            if not check_password_hash(pw_hash, password):
                return jsonify({"success": False, "error": "Incorrect password. Please try again."}), 401

            first = u.get("first_name", "")
            last  = u.get("last_name", "")
            return jsonify({
                "success":            True,
                "username":           u["username"],
                "first_name":         first,
                "full_name":          f"{first} {last}".strip(),
                "display_name":       u.get("display_name") or "",
                "avatar_url":         u.get("avatar_url") or "",
                "company":            u.get("company", ""),
                "department":         u.get("department", ""),
                "email":              u.get("email", ""),
                "systems":            u.get("systems", []),
                "is_admin":           u.get("is_admin", False),
                "is_developer":       u.get("is_developer", False),
                "is_management":      u.get("is_management", False),
                "is_department_head": u.get("is_department_head", False),
            })
    except Exception as exc:
        from flask import current_app
        current_app.logger.error("Supabase users lookup failed: %s", exc)

    # 2. Fallback: check access_requests for users not yet in users table
    # (these users have no password; direct them to setup after they're added to users)
    try:
        rows = supabase_req("GET", "/access_requests", params={
            "username": f"eq.{username}",
            "status":   "eq.approved",
            "select":   "username,first_name,last_name,company,department,email,systems",
            "order":    "created_at.asc",
            "limit":    "1",
        })
    except Exception as exc:
        from flask import current_app
        current_app.logger.error("Supabase verify-username failed: %s", exc)
        return jsonify({"success": False, "error": "Authentication failed. Please try again."}), 500

    if not rows:
        return jsonify({
            "success": False,
            "error": "Username not found or access not yet approved. Please request access.",
        }), 404

    record = rows[0]
    first  = record.get("first_name", "")
    last   = record.get("last_name", "")
    return jsonify({
        "success":              True,
        "needs_password_setup": True,
        "username":             record["username"],
        "first_name":           first,
        "full_name":            f"{first} {last}".strip(),
        "display_name":         "",
        "avatar_url":           "",
        "company":              record.get("company", ""),
        "department":           record.get("department", ""),
        "email":                record.get("email", ""),
        "systems":              record.get("systems", []),
        "is_admin":             False,
        "is_developer":         False,
        "is_management":        False,
        "is_department_head":   False,
    })


@auth_bp.post("/api/auth/setup-password")
def setup_password():
    """Set an initial password for a user who has none."""
    data     = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip().lower()
    password = (data.get("password") or "").strip()
    confirm  = (data.get("confirm_password") or "").strip()

    if not username or not password:
        return jsonify({"success": False, "error": "Username and password are required."}), 400
    if len(password) < 8:
        return jsonify({"success": False, "error": "Password must be at least 8 characters."}), 400
    if password != confirm:
        return jsonify({"success": False, "error": "Passwords do not match."}), 400

    try:
        u = _get_user(username)
    except Exception as exc:
        return jsonify({"success": False, "error": "Server error. Please try again."}), 500

    if not u:
        return jsonify({"success": False, "error": "User not found."}), 404
    if u.get("password_hash"):
        return jsonify({"success": False, "error": "A password is already set. Use 'Forgot password' to reset it."}), 409

    pw_hash = generate_password_hash(password)
    try:
        supabase_req("PATCH", "/users", data={"password_hash": pw_hash},
                     params={"username": f"eq.{username}"})
    except Exception as exc:
        return jsonify({"success": False, "error": "Failed to save password. Please try again."}), 500

    return jsonify({"success": True})


@auth_bp.post("/api/auth/forgot-password")
def forgot_password():
    """Generate a reset token and email it to the user."""
    data     = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip().lower()

    # Always return 200 to avoid user enumeration
    if not username:
        return jsonify({"success": True})

    try:
        u = _get_user(username)
    except Exception:
        return jsonify({"success": True})

    if not u or not u.get("email"):
        return jsonify({"success": True})

    token   = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

    try:
        supabase_req("PATCH", "/users", data={
            "password_reset_token":   token,
            "password_reset_expires": expires,
        }, params={"username": f"eq.{username}"})
    except Exception:
        return jsonify({"success": True})

    base_url  = (GATEWAY_BASE_URL or request.host_url).rstrip("/")
    reset_url = f"{base_url}/reset-password?token={token}"
    send_password_reset_email(u, reset_url)

    return jsonify({"success": True})


@auth_bp.post("/api/auth/reset-password")
def reset_password():
    """Apply a new password using a valid reset token."""
    data    = request.get_json(silent=True) or {}
    token   = (data.get("token") or "").strip()
    password = (data.get("password") or "").strip()
    confirm  = (data.get("confirm_password") or "").strip()

    if not token or not password:
        return jsonify({"success": False, "error": "Token and password are required."}), 400
    if len(password) < 8:
        return jsonify({"success": False, "error": "Password must be at least 8 characters."}), 400
    if password != confirm:
        return jsonify({"success": False, "error": "Passwords do not match."}), 400

    try:
        rows = supabase_req("GET", "/users", params={
            "password_reset_token": f"eq.{token}",
            "select": "username,password_reset_expires",
        })
    except Exception:
        return jsonify({"success": False, "error": "Server error. Please try again."}), 500

    if not rows:
        return jsonify({"success": False, "error": "Invalid or expired reset link."}), 400

    u       = rows[0]
    expires = u.get("password_reset_expires")
    if expires:
        exp_dt = datetime.fromisoformat(expires.replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > exp_dt:
            return jsonify({"success": False, "error": "This reset link has expired. Please request a new one."}), 400

    pw_hash = generate_password_hash(password)
    try:
        supabase_req("PATCH", "/users", data={
            "password_hash":          pw_hash,
            "password_reset_token":   None,
            "password_reset_expires": None,
        }, params={"username": f"eq.{u['username']}"})
    except Exception:
        return jsonify({"success": False, "error": "Failed to update password."}), 500

    return jsonify({"success": True})


@auth_bp.post("/api/auth/change-password")
def change_password():
    """Change password from the profile page (authenticated)."""
    username = request.headers.get("X-Gateway-Username", "").strip().lower()
    if not username:
        return jsonify({"success": False, "error": "Not authenticated."}), 401

    data         = request.get_json(silent=True) or {}
    current_pw   = (data.get("current_password") or "").strip()
    new_pw       = (data.get("new_password") or "").strip()
    confirm_pw   = (data.get("confirm_password") or "").strip()

    if not new_pw:
        return jsonify({"success": False, "error": "New password is required."}), 400
    if len(new_pw) < 8:
        return jsonify({"success": False, "error": "Password must be at least 8 characters."}), 400
    if new_pw != confirm_pw:
        return jsonify({"success": False, "error": "Passwords do not match."}), 400

    try:
        u = _get_user(username)
    except Exception:
        return jsonify({"success": False, "error": "Server error."}), 500

    if not u:
        return jsonify({"success": False, "error": "User not found."}), 404

    existing_hash = u.get("password_hash")

    # If a password is already set, current_password must match
    if existing_hash:
        if not current_pw:
            return jsonify({"success": False, "error": "Please enter your current password."}), 400
        if not check_password_hash(existing_hash, current_pw):
            return jsonify({"success": False, "error": "Current password is incorrect."}), 401

    pw_hash = generate_password_hash(new_pw)
    try:
        supabase_req("PATCH", "/users", data={"password_hash": pw_hash},
                     params={"username": f"eq.{username}"})
    except Exception:
        return jsonify({"success": False, "error": "Failed to update password."}), 500

    return jsonify({"success": True})


# ── HTML page routes ──────────────────────────────────────────────────────────

@auth_bp.get("/setup-password")
def setup_password_page():
    return render_template("setup_password.html")


@auth_bp.get("/forgot-password")
def forgot_password_page():
    return render_template("forgot_password.html")


@auth_bp.get("/reset-password")
def reset_password_page():
    return render_template("reset_password.html")


# ── Existing access-request routes (unchanged) ─────────────────────────────

@auth_bp.post("/access-request")
def access_request():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return jsonify({"success": False, "error": "Access request system is not configured."}), 503

    data = {
        "first_name":     request.form.get("first_name", "").strip(),
        "last_name":      request.form.get("last_name", "").strip(),
        "middle_initial": request.form.get("middle_initial", "").strip(),
        "company":        request.form.get("company", "").strip(),
        "department":     request.form.get("department", "").strip(),
        "position":       request.form.get("position", "").strip(),
        "email":          request.form.get("email", "").strip(),
        "systems":        request.form.getlist("systems"),
    }

    required = ["first_name", "last_name", "company", "department", "position", "email"]
    missing  = [f.replace("_", " ").title() for f in required if not data[f]]
    if missing:
        return jsonify({"success": False, "error": f"Required fields missing: {', '.join(missing)}"}), 400
    if not data["systems"]:
        return jsonify({"success": False, "error": "Please select at least one system."}), 400

    try:
        rows   = supabase_req("POST", "/access_requests", data=data)
        record = rows[0] if rows else {}
    except Exception as exc:
        from flask import current_app
        current_app.logger.error("Supabase insert failed: %s", exc)
        return jsonify({"success": False, "error": "Failed to save your request. Please try again."}), 500

    base_url = (GATEWAY_BASE_URL or request.host_url).rstrip("/")
    send_approval_request_email(record, base_url)

    return jsonify({
        "success": True,
        "message": "Your access request has been submitted. You will receive an email notification once it has been reviewed.",
    })


@auth_bp.post("/access-request/additional")
def access_request_additional():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return jsonify({"success": False, "error": "Access request system is not configured."}), 503

    username    = request.form.get("username", "").strip().lower()
    new_systems = request.form.getlist("systems")

    if not username:
        return jsonify({"success": False, "error": "Session expired. Please sign in again."}), 400
    if not new_systems:
        return jsonify({"success": False, "error": "Please select at least one system."}), 400

    try:
        rows = supabase_req("GET", "/access_requests", params={
            "username": f"eq.{username}",
            "status":   "eq.approved",
            "select":   "*",
            "order":    "created_at.asc",
            "limit":    "1",
        })
    except Exception as exc:
        from flask import current_app
        current_app.logger.error("Supabase lookup failed: %s", exc)
        return jsonify({"success": False, "error": "Failed to retrieve your account. Please try again."}), 500

    if not rows:
        # User may have been created directly (no access_request row) — fall back to users table
        try:
            user_rows = supabase_req("GET", "/users", params={
                "username": f"eq.{username}",
                "select":   "first_name,last_name,middle_initial,company,department,position,email",
                "limit":    "1",
            })
        except Exception as exc:
            from flask import current_app
            current_app.logger.error("Supabase users lookup failed: %s", exc)
            return jsonify({"success": False, "error": "Failed to retrieve your account. Please try again."}), 500

        if not user_rows:
            return jsonify({"success": False, "error": "Account not found. Please sign in again."}), 404

        rows = user_rows

    existing = rows[0]
    new_data = {
        "first_name":     existing["first_name"],
        "last_name":      existing["last_name"],
        "middle_initial": existing.get("middle_initial", ""),
        "company":        existing["company"],
        "department":     existing["department"],
        "position":       existing["position"],
        "email":          existing["email"],
        "systems":        new_systems,
        "username":       username,
    }

    try:
        ins    = supabase_req("POST", "/access_requests", data=new_data)
        record = ins[0] if ins else {}
    except Exception as exc:
        from flask import current_app
        current_app.logger.error("Supabase insert failed: %s", exc)
        return jsonify({"success": False, "error": "Failed to save request. Please try again."}), 500

    base_url = (GATEWAY_BASE_URL or request.host_url).rstrip("/")
    send_approval_request_email(record, base_url, is_additional=True)

    return jsonify({
        "success": True,
        "message": "Your additional access request has been submitted. You will be notified once it has been approved.",
    })


@auth_bp.get("/access/approve/<token>")
def access_approve(token):
    if not SUPABASE_URL:
        return render_template("access_result.html", success=False,
                               title="Not Configured",
                               message=Markup("The access management system is not configured.")), 503
    try:
        rows = supabase_req("GET", "/access_requests",
                            params={"approval_token": f"eq.{token}", "select": "*"})
    except Exception as exc:
        from flask import current_app
        current_app.logger.error("Supabase lookup failed: %s", exc)
        return render_template("access_result.html", success=False, title="Error",
                               message=Markup("Failed to retrieve the access request. Please try again.")), 500

    if not rows:
        return render_template("access_result.html", success=False, title="Not Found",
                               message=Markup("This access request link is invalid or has already been processed.")), 404

    record = rows[0]
    if record["status"] != "pending":
        processed = "approved" if record["status"] == "approved" else "rejected"
        return render_template("access_result.html", success=False, title="Already Processed",
                               message=Markup(f"This request has already been <strong>{processed}</strong>.")), 409

    is_additional  = bool(record.get("username"))
    username, err  = _approve_record(record)
    if err:
        return render_template("access_result.html", success=False, title="Error",
                               message=Markup("Failed to approve the request. Please try again.")), 500

    send_access_granted_email(record, is_additional=is_additional)

    full_name = _full_name(record)
    if is_additional:
        new_systems = html_escape(", ".join(record.get("systems") or []))
        msg = Markup(
            f"Additional access for <strong>{html_escape(full_name)}</strong> has been approved.<br><br>"
            f"Systems added: <strong>{new_systems}</strong><br>"
            f"A notification email has been sent to <strong>{html_escape(record['email'])}</strong>."
        )
    else:
        msg = Markup(
            f"Access for <strong>{html_escape(full_name)}</strong> has been approved.<br><br>"
            f"Username <strong>{html_escape(username)}</strong> has been assigned.<br>"
            f"A confirmation email has been sent to <strong>{html_escape(record['email'])}</strong>."
        )
    return render_template("access_result.html", success=True, title="Access Approved", message=msg)


@auth_bp.get("/access/reject/<token>")
def access_reject(token):
    if not SUPABASE_URL:
        return render_template("access_result.html", success=False,
                               title="Not Configured",
                               message=Markup("The access management system is not configured.")), 503
    try:
        rows = supabase_req("GET", "/access_requests",
                            params={"approval_token": f"eq.{token}", "select": "*"})
    except Exception as exc:
        from flask import current_app
        current_app.logger.error("Supabase lookup failed: %s", exc)
        return render_template("access_result.html", success=False, title="Error",
                               message=Markup("Failed to retrieve the access request. Please try again.")), 500

    if not rows:
        return render_template("access_result.html", success=False, title="Not Found",
                               message=Markup("This access request link is invalid or has already been processed.")), 404

    record = rows[0]
    if record["status"] != "pending":
        processed = "approved" if record["status"] == "approved" else "rejected"
        return render_template("access_result.html", success=False, title="Already Processed",
                               message=Markup(f"This request has already been <strong>{processed}</strong>.")), 409

    ok, reject_err = _reject_record(record["id"])
    if reject_err:
        return render_template("access_result.html", success=False, title="Error",
                               message=Markup("Failed to reject the request. Please try again.")), 500

    send_access_rejected_email(record)
    full_name = _full_name(record)
    return render_template("access_result.html", success=False, title="Request Rejected",
                           message=Markup(
                               f"The access request for <strong>{html_escape(full_name)}</strong> has been "
                               f"<strong style='color:#dc2626;'>rejected</strong>."
                           ))
