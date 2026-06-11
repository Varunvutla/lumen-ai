"""Auth request and response schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from ..trackify.models import EMAIL_RE


class AuthUser(BaseModel):
    id: int
    email: str
    name: str
    avatar_url: str | None = None
    provider: str = "local"


class AuthResponse(BaseModel):
    token: str
    user: AuthUser


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=320)
    password: str = Field(..., min_length=8, max_length=128)
    name: str = Field(..., min_length=2, max_length=120)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        email = value.strip().lower()
        if not EMAIL_RE.match(email):
            raise ValueError("Enter a valid email address")
        return email


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=320)
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class ProfileUpdateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=320)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        email = value.strip().lower()
        if not EMAIL_RE.match(email):
            raise ValueError("Enter a valid email address")
        return email


class VerifyOtpRequest(ForgotPasswordRequest):
    otp_code: str = Field(..., min_length=4, max_length=4)


class ResetPasswordRequest(ForgotPasswordRequest):
    otp_code: str = Field(..., min_length=4, max_length=4)
    new_password: str = Field(..., min_length=8, max_length=128)


class MessageResponse(BaseModel):
    message: str
