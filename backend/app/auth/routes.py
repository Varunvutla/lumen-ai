"""Auth routes."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from .models import (
    AuthResponse,
    AuthUser,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    ProfileUpdateRequest,
    RegisterRequest,
    ResetPasswordRequest,
    VerifyOtpRequest,
)
from .service import (
    authenticate_user,
    create_token,
    create_user,
    get_user_by_email,
    request_password_reset,
    reset_password,
    update_user_name,
    verify_password_reset_otp,
    verify_token,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_from_header(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token


async def current_user(authorization: str | None = Header(default=None)) -> AuthUser:
    token = _token_from_header(authorization)
    user = await run_in_threadpool(verify_token, token or "")
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


async def optional_user(authorization: str | None = Header(default=None)) -> AuthUser | None:
    token = _token_from_header(authorization)
    if not token:
        return None
    return await run_in_threadpool(verify_token, token)


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest) -> AuthResponse:
    exists = await run_in_threadpool(get_user_by_email, payload.email)
    if exists:
        raise HTTPException(status_code=409, detail="An account already exists for this email")
    user = await run_in_threadpool(create_user, payload.email, payload.password, payload.name)
    return AuthResponse(token=create_token(user), user=user)


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest) -> AuthResponse:
    user = await run_in_threadpool(authenticate_user, payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return AuthResponse(token=create_token(user), user=user)


@router.get("/me", response_model=AuthUser)
async def me(user: AuthUser = Depends(current_user)) -> AuthUser:
    return user


@router.patch("/me", response_model=AuthUser)
async def update_profile(
    payload: ProfileUpdateRequest,
    user: AuthUser = Depends(current_user),
) -> AuthUser:
    updated = await run_in_threadpool(update_user_name, user.id, payload.name)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return updated


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(payload: ForgotPasswordRequest) -> MessageResponse:
    sent = await run_in_threadpool(request_password_reset, payload.email)
    if not sent:
        raise HTTPException(status_code=500, detail="Could not send verification code. Check email configuration.")
    return MessageResponse(message="If the account exists, a verification code has been sent.")


@router.post("/verify-otp", response_model=MessageResponse)
async def verify_otp(payload: VerifyOtpRequest) -> MessageResponse:
    ok = await run_in_threadpool(verify_password_reset_otp, payload.email, payload.otp_code)
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")
    return MessageResponse(message="Verification code accepted.")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password_route(payload: ResetPasswordRequest) -> MessageResponse:
    ok = await run_in_threadpool(reset_password, payload.email, payload.otp_code, payload.new_password)
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")
    return MessageResponse(message="Password updated successfully.")


class GoogleAuthRequest(BaseModel):
    credential: str


@router.post("/google", response_model=AuthResponse)
async def google_login(payload: GoogleAuthRequest) -> AuthResponse:
    """Exchange a Google ID token for a LuMen session token."""
    from .google_service import verify_google_token, upsert_google_user
    google_user = await run_in_threadpool(verify_google_token, payload.credential)
    if not google_user:
        raise HTTPException(status_code=401, detail="Invalid Google credential")
    user = await run_in_threadpool(upsert_google_user, google_user)
    if not user:
        raise HTTPException(status_code=500, detail="Could not create or fetch account")
    return AuthResponse(token=create_token(user), user=user)

