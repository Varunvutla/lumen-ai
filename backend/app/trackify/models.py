"""Schemas for Trackify API payloads."""
from __future__ import annotations

from datetime import datetime
import re
from typing import Optional

from pydantic import BaseModel, Field, HttpUrl, field_validator

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class TrackItemCreate(BaseModel):
    product_url: HttpUrl
    target_price: float = Field(..., gt=0)
    product_name: Optional[str] = Field(None, min_length=2, max_length=240)
    user_email: Optional[str] = Field(None, min_length=5, max_length=320)
    current_price: Optional[float] = Field(None, gt=0)
    image: Optional[str] = None
    source: Optional[str] = None

    @field_validator("user_email")
    @classmethod
    def validate_user_email(cls, value: str | None) -> str | None:
        if value is None:
            return value
        email = value.strip()
        if not EMAIL_RE.match(email):
            raise ValueError("Enter a valid email address")
        return email


class TrackPreviewRequest(BaseModel):
    product_url: HttpUrl


class TrackPreviewResponse(BaseModel):
    product_name: str
    product_url: str
    source: str
    current_price: Optional[float] = None
    image: Optional[str] = None


class TrackTargetUpdate(BaseModel):
    target_price: float = Field(..., gt=0)


class TrackItem(BaseModel):
    id: int
    user_id: Optional[int] = None
    product_name: str
    product_url: str
    source: str = "Web"
    image: Optional[str] = None
    last_checked_price: Optional[float] = None
    target_price: float
    user_email: str
    notified: bool = False
    notification_count: int = 0
    created_at: datetime
    last_checked_at: Optional[datetime] = None
    last_notified_at: Optional[datetime] = None
    price_history: list[dict] = Field(default_factory=list)


class TrackItemResponse(BaseModel):
    item: TrackItem


class TrackListResponse(BaseModel):
    items: list[TrackItem]


class TrackRemoveResponse(BaseModel):
    removed: bool


class PriceHistoryPoint(BaseModel):
    price: float
    checked_at: datetime


class PriceHistoryResponse(BaseModel):
    item_id: int
    product_name: str
    points: list[PriceHistoryPoint]
