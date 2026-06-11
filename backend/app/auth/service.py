"""MongoDB-backed auth helpers."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any, Dict, Optional

import bcrypt

from ..db import ensure_indexes, next_id, otps_col, users_col
from ..trackify.email_service import send_password_reset_otp
from .models import AuthUser

TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14
OTP_TTL_SECONDS = 60 * 5
OTP_MAX_ATTEMPTS = 5


def _secret() -> str:
    return os.getenv("AUTH_SECRET") or os.getenv("GROQ_API_KEY") or os.getenv("OPENCODE_API_KEY") or "lumen-local-dev-secret"


def init_auth_db() -> None:
    ensure_indexes()


def _hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 150000)
    return f"{salt}${base64.b64encode(digest).decode()}"


def _hash_password_bcrypt(password: str) -> str:
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    return f"bcrypt${hashed}"


def _verify_password(password: str, stored: str | None) -> bool:
    if not stored or "$" not in stored:
        return False
    if stored.startswith("bcrypt$"):
        hashed = stored.removeprefix("bcrypt$").encode()
        try:
            return bcrypt.checkpw(password.encode(), hashed)
        except ValueError:
            return False
    salt, _ = stored.split("$", 1)
    return hmac.compare_digest(_hash_password(password, salt), stored)


def _hash_otp(otp_code: str) -> str:
    return bcrypt.hashpw(otp_code.encode(), bcrypt.gensalt()).decode()


def _verify_otp_hash(otp_code: str, otp_hash: str) -> bool:
    try:
        return bcrypt.checkpw(otp_code.encode(), otp_hash.encode())
    except ValueError:
        return False


def _doc_to_user(doc: Dict[str, Any]) -> AuthUser:
    return AuthUser(
        id=int(doc["id"]),
        email=doc["email"],
        name=doc["name"],
        avatar_url=doc.get("avatar_url"),
        provider=doc.get("provider", "local"),
    )


def get_user_by_id(user_id: int) -> Optional[AuthUser]:
    init_auth_db()
    doc = users_col().find_one({"id": int(user_id)})
    return _doc_to_user(doc) if doc else None


def get_user_by_email(email: str) -> Optional[AuthUser]:
    init_auth_db()
    doc = users_col().find_one({"email": email.lower()})
    return _doc_to_user(doc) if doc else None


def create_user(email: str, password: str, name: str) -> AuthUser:
    init_auth_db()
    now = int(time.time())
    doc = {
        "id": next_id("users"),
        "email": email.lower(),
        "name": name.strip(),
        "password_hash": _hash_password(password),
        "avatar_url": None,
        "provider": "local",
        "created_at": now,
        "updated_at": now,
    }
    users_col().insert_one(doc)
    return _doc_to_user(doc)


def upsert_google_user(email: str, name: str, avatar_url: str | None = None) -> AuthUser:
    """Create or update a user authenticated via Google."""
    init_auth_db()
    now = int(time.time())
    existing = users_col().find_one({"email": email.lower()})
    if existing:
        users_col().update_one(
            {"email": email.lower()},
            {"$set": {"name": name.strip() or existing["name"],
                      "avatar_url": avatar_url or existing.get("avatar_url"),
                      "updated_at": now}},
        )
        doc = users_col().find_one({"email": email.lower()})
        return _doc_to_user(doc)
    doc = {
        "id": next_id("users"),
        "email": email.lower(),
        "name": name.strip(),
        "password_hash": None,
        "avatar_url": avatar_url,
        "provider": "google",
        "created_at": now,
        "updated_at": now,
    }
    users_col().insert_one(doc)
    return _doc_to_user(doc)


def authenticate_user(email: str, password: str) -> Optional[AuthUser]:
    init_auth_db()
    doc = users_col().find_one({"email": email.lower()})
    if not doc or not _verify_password(password, doc.get("password_hash")):
        return None
    return _doc_to_user(doc)


def update_user_name(user_id: int, name: str) -> Optional[AuthUser]:
    init_auth_db()
    users_col().update_one(
        {"id": int(user_id)},
        {"$set": {"name": name.strip(), "updated_at": int(time.time())}},
    )
    doc = users_col().find_one({"id": int(user_id)})
    return _doc_to_user(doc) if doc else None


def request_password_reset(email: str) -> bool:
    init_auth_db()
    normalized = email.lower()
    user = get_user_by_email(normalized)
    if not user:
        return True
    otp_code = f"{secrets.randbelow(10000):04d}"
    now = int(time.time())
    otps_col().update_one(
        {"email": normalized},
        {"$set": {
            "otp_hash": _hash_otp(otp_code),
            "expires_at": now + OTP_TTL_SECONDS,
            "attempts": 0,
            "verified": False,
            "created_at": now,
        }},
        upsert=True,
    )
    return send_password_reset_otp(normalized, otp_code)


def verify_password_reset_otp(email: str, otp_code: str) -> bool:
    init_auth_db()
    normalized = email.lower()
    now = int(time.time())
    doc = otps_col().find_one({"email": normalized})
    if not doc or doc["expires_at"] < now or doc["attempts"] >= OTP_MAX_ATTEMPTS:
        return False
    if not _verify_otp_hash(otp_code, doc["otp_hash"]):
        otps_col().update_one({"email": normalized}, {"$inc": {"attempts": 1}})
        return False
    otps_col().update_one({"email": normalized}, {"$set": {"verified": True}})
    return True


def reset_password(email: str, otp_code: str, new_password: str) -> bool:
    init_auth_db()
    normalized = email.lower()
    now = int(time.time())
    doc = otps_col().find_one({"email": normalized})
    if not doc or doc["expires_at"] < now or doc["attempts"] >= OTP_MAX_ATTEMPTS:
        return False
    if not doc.get("verified") and not _verify_otp_hash(otp_code, doc["otp_hash"]):
        otps_col().update_one({"email": normalized}, {"$inc": {"attempts": 1}})
        return False
    result = users_col().update_one(
        {"email": normalized},
        {"$set": {"password_hash": _hash_password_bcrypt(new_password),
                  "updated_at": now}},
    )
    otps_col().delete_one({"email": normalized})
    return result.matched_count > 0


def create_token(user: AuthUser) -> str:
    payload = {
        "sub": user.id,
        "email": user.email,
        "exp": int(time.time()) + TOKEN_TTL_SECONDS,
    }
    raw = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    sig = hmac.new(_secret().encode(), raw.encode(), hashlib.sha256).hexdigest()
    return f"{raw}.{sig}"


def verify_token(token: str) -> Optional[AuthUser]:
    if "." not in token:
        return None
    raw, sig = token.rsplit(".", 1)
    expected = hmac.new(_secret().encode(), raw.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        padded = raw + "=" * (-len(raw) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
    except Exception:
        return None
    if int(payload.get("exp") or 0) < int(time.time()):
        return None
    return get_user_by_id(int(payload.get("sub")))
