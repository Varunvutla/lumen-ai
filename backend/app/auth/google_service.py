"""Google OAuth token verification and user upsert."""
from __future__ import annotations

import logging
import os
from typing import Optional

log = logging.getLogger(__name__)

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")


def verify_google_token(credential: str) -> Optional[dict]:
    """Verify the Google ID token and return user info dict, or None on failure."""
    if not GOOGLE_CLIENT_ID:
        log.warning("GOOGLE_CLIENT_ID is not set; Google sign-in is disabled")
        return None

    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests

        idinfo = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
        return {
            "email": idinfo.get("email", ""),
            "name": idinfo.get("name", idinfo.get("email", "").split("@")[0]),
            "avatar_url": idinfo.get("picture"),
            "google_sub": idinfo.get("sub", ""),
        }
    except Exception as exc:
        log.warning("Google token verification failed: %s", exc)
        return None


def upsert_google_user(google_info: dict):
    """Create or fetch a user record for a Google-authenticated user."""
    from .service import upsert_google_user as service_upsert

    email = google_info.get("email", "").lower()
    name = google_info.get("name") or email.split("@")[0]
    avatar_url = google_info.get("avatar_url")

    if not email:
        return None

    return service_upsert(email, name, avatar_url)
