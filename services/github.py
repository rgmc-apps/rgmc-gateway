import base64
import hashlib
import hmac
import logging
import time

import requests

from config import GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, SUPABASE_SERVICE_KEY

logger = logging.getLogger(__name__)

AUTHORIZE_URL   = "https://github.com/login/oauth/authorize"
TOKEN_URL       = "https://github.com/login/oauth/access_token"
API_USER_URL    = "https://api.github.com/user"
API_USERS_URL   = "https://api.github.com/users"

_STATE_MAX_AGE_SECONDS = 600  # 10 minutes to complete the OAuth handshake

# Short in-memory cache for public profile lookups so opening the same
# developer's detail modal repeatedly doesn't burn through the API rate limit.
_profile_cache: dict[str, tuple[float, dict]] = {}
_PROFILE_CACHE_TTL_SECONDS = 600


def is_configured() -> bool:
    return bool(GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET)


def _state_key() -> bytes:
    # Reuses the Supabase service key as the HMAC signing secret — it's
    # already a server-only secret, avoiding the need for a dedicated one
    # just to sign a short-lived, low-stakes OAuth state token.
    return SUPABASE_SERVICE_KEY.encode()


def sign_state(username: str) -> str:
    payload = f"{username}:{int(time.time())}"
    sig     = hmac.new(_state_key(), payload.encode(), hashlib.sha256).hexdigest()
    raw     = f"{payload}:{sig}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def verify_state(state: str) -> str | None:
    """Return the username embedded in a valid, unexpired state token, else None."""
    try:
        raw = base64.urlsafe_b64decode(state.encode()).decode()
        username, ts, sig = raw.rsplit(":", 2)
    except Exception:
        return None

    payload   = f"{username}:{ts}"
    expected  = hmac.new(_state_key(), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    if time.time() - int(ts) > _STATE_MAX_AGE_SECONDS:
        return None
    return username


def build_authorize_url(state: str, redirect_uri: str) -> str:
    params = {
        "client_id":    GITHUB_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "scope":        "read:user",
        "state":        state,
        "allow_signup": "false",
    }
    query = "&".join(f"{k}={requests.utils.quote(str(v))}" for k, v in params.items())
    return f"{AUTHORIZE_URL}?{query}"


def exchange_code_for_token(code: str, redirect_uri: str) -> str:
    """Exchange an OAuth code for an access token. Raises on failure."""
    resp = requests.post(
        TOKEN_URL,
        headers={"Accept": "application/json"},
        data={
            "client_id":     GITHUB_CLIENT_ID,
            "client_secret": GITHUB_CLIENT_SECRET,
            "code":          code,
            "redirect_uri":  redirect_uri,
        },
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    if data.get("error") or not data.get("access_token"):
        raise ValueError(data.get("error_description") or data.get("error") or "No access token returned")
    return data["access_token"]


def fetch_authenticated_login(access_token: str) -> str:
    """Return the GitHub login of the account that owns this access token. Raises on failure."""
    resp = requests.get(
        API_USER_URL,
        headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"},
        timeout=10,
    )
    resp.raise_for_status()
    login = resp.json().get("login")
    if not login:
        raise ValueError("GitHub did not return a login")
    return login


def fetch_public_profile(login: str) -> dict | None:
    """Fetch a GitHub user's public profile, cached briefly. Returns None if not found."""
    cached = _profile_cache.get(login)
    if cached and (time.time() - cached[0]) < _PROFILE_CACHE_TTL_SECONDS:
        return cached[1]

    params = {}
    if is_configured():
        # Attaching OAuth App credentials raises the unauthenticated rate limit
        # from 60/hr to 5,000/hr — cheap insurance for a page admins reopen often.
        params = {"client_id": GITHUB_CLIENT_ID, "client_secret": GITHUB_CLIENT_SECRET}

    try:
        resp = requests.get(f"{API_USERS_URL}/{login}", params=params, timeout=8)
    except Exception as exc:
        logger.warning("GitHub profile fetch failed for %s: %s", login, exc)
        return cached[1] if cached else None

    if resp.status_code == 404:
        return None
    if not resp.ok:
        logger.warning("GitHub profile fetch for %s returned %s", login, resp.status_code)
        return cached[1] if cached else None

    data = resp.json()
    profile = {
        "login":        data.get("login"),
        "name":         data.get("name"),
        "avatar_url":   data.get("avatar_url"),
        "bio":          data.get("bio"),
        "company":      data.get("company"),
        "location":     data.get("location"),
        "blog":         data.get("blog"),
        "html_url":     data.get("html_url"),
        "public_repos": data.get("public_repos"),
        "followers":    data.get("followers"),
        "following":    data.get("following"),
        "created_at":   data.get("created_at"),
    }
    _profile_cache[login] = (time.time(), profile)
    return profile
