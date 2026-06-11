"""MongoDB-backed storage and price extraction helpers for Trackify."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from pymongo import ReturnDocument

from ..db import ensure_indexes, next_id, track_items_col
from .models import TrackItem, TrackItemCreate


def init_db() -> None:
    ensure_indexes()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _doc_to_item(doc: Dict[str, Any]) -> TrackItem:
    return TrackItem(
        id=int(doc["id"]),
        user_id=doc.get("user_id"),
        product_name=doc["product_name"],
        product_url=doc["product_url"],
        source=doc.get("source") or "Web",
        image=doc.get("image"),
        last_checked_price=doc.get("last_checked_price"),
        target_price=float(doc["target_price"]),
        user_email=doc.get("user_email") or "",
        notified=bool(doc.get("notified", False)),
        notification_count=int(doc.get("notification_count", 0)),
        created_at=doc["created_at"],
        last_checked_at=doc.get("last_checked_at"),
        last_notified_at=doc.get("last_notified_at"),
        price_history=doc.get("price_history") or [],
    )


def add_track_item(payload: TrackItemCreate, user_id: int | None = None, user_email: str | None = None) -> TrackItem:
    init_db()
    owner_email = (payload.user_email or user_email or "").strip().lower()
    history: list[dict] = []
    if payload.current_price:
        history.append({"price": payload.current_price, "checked_at": _now_iso()})

    col = track_items_col()
    existing = col.find_one({"user_id": user_id, "product_url": str(payload.product_url)})
    if existing:
        col.update_one(
            {"id": existing["id"]},
            {"$set": {
                "product_name": (payload.product_name or str(payload.product_url)).strip(),
                "source": payload.source or existing.get("source") or "Web",
                "image": payload.image or existing.get("image"),
                "last_checked_price": payload.current_price,
                "target_price": float(payload.target_price),
                "user_email": owner_email,
                "notified": False,
                "last_checked_at": _now_iso() if payload.current_price else existing.get("last_checked_at"),
                "price_history": history or existing.get("price_history") or [],
            }},
        )
        return _doc_to_item(col.find_one({"id": existing["id"]}))

    doc = {
        "id": next_id("track_items"),
        "user_id": user_id,
        "product_name": (payload.product_name or str(payload.product_url)).strip(),
        "product_url": str(payload.product_url),
        "source": payload.source or "Web",
        "image": payload.image,
        "last_checked_price": payload.current_price,
        "target_price": float(payload.target_price),
        "user_email": owner_email,
        "notified": False,
        "notification_count": 0,
        "created_at": _now_iso(),
        "last_checked_at": _now_iso() if payload.current_price else None,
        "last_notified_at": None,
        "price_history": history,
    }
    col.insert_one(doc)
    return _doc_to_item(doc)


def list_track_items(user_id: int | None = None, user_email: str | None = None) -> list[TrackItem]:
    init_db()
    col = track_items_col()
    if user_id is not None:
        cursor = col.find(
            {"$or": [{"user_id": user_id}, {"user_email": (user_email or "").lower()}]}
        ).sort("created_at", -1)
    else:
        cursor = col.find().sort("created_at", -1)
    return [_doc_to_item(d) for d in cursor]


def get_track_item(item_id: int) -> Optional[TrackItem]:
    init_db()
    doc = track_items_col().find_one({"id": int(item_id)})
    return _doc_to_item(doc) if doc else None


def get_track_item_for_user(item_id: int, user_id: int, user_email: str) -> Optional[TrackItem]:
    init_db()
    doc = track_items_col().find_one({
        "id": int(item_id),
        "$or": [{"user_id": user_id}, {"user_email": user_email.lower()}],
    })
    return _doc_to_item(doc) if doc else None


def remove_track_item(item_id: int, user_id: int | None = None, user_email: str | None = None) -> bool:
    init_db()
    if user_id is not None:
        result = track_items_col().delete_one({
            "id": int(item_id),
            "$or": [{"user_id": user_id}, {"user_email": (user_email or "").lower()}],
        })
    else:
        result = track_items_col().delete_one({"id": int(item_id)})
    return result.deleted_count > 0


def get_batch(limit: int = 15) -> list[TrackItem]:
    init_db()
    safe_limit = max(1, min(limit, 20))
    # Items never checked first, then oldest-checked first
    docs = list(
        track_items_col().aggregate([
            {"$addFields": {"_never_checked": {"$cond": [{"$ifNull": ["$last_checked_at", False]}, 1, 0]}}},
            {"$sort": {"_never_checked": 1, "last_checked_at": 1, "created_at": 1}},
            {"$limit": safe_limit},
        ])
    )
    return [_doc_to_item(d) for d in docs]


def update_checked_price(item_id: int, price: Optional[float]) -> None:
    init_db()
    col = track_items_col()
    doc = col.find_one({"id": int(item_id)}, {"price_history": 1})
    history = (doc or {}).get("price_history") or []
    if price is not None:
        history.append({"price": price, "checked_at": _now_iso()})
        history = history[-50:]
    col.update_one(
        {"id": int(item_id)},
        {"$set": {
            "last_checked_price": price,
            "last_checked_at": _now_iso(),
            "price_history": history,
        }},
    )


def mark_notified(item_id: int) -> None:
    init_db()
    track_items_col().update_one(
        {"id": int(item_id)},
        {"$set": {"notified": True, "last_notified_at": _now_iso()},
         "$inc": {"notification_count": 1}},
    )


def attach_items_to_user(user_id: int, user_email: str) -> None:
    init_db()
    track_items_col().update_many(
        {"user_email": user_email.lower(), "user_id": None},
        {"$set": {"user_id": user_id}},
    )


def reset_notification(item_id: int) -> None:
    init_db()
    track_items_col().update_one(
        {"id": int(item_id)},
        {"$set": {"notified": False}},
    )


def update_target_price(
    item_id: int,
    target_price: float,
    user_id: int | None = None,
    user_email: str | None = None,
) -> Optional[TrackItem]:
    init_db()
    col = track_items_col()
    query: Dict[str, Any] = {"id": int(item_id)}
    if user_id is not None:
        query["$or"] = [{"user_id": user_id}, {"user_email": (user_email or "").lower()}]
    doc = col.find_one_and_update(
        query,
        {"$set": {"target_price": float(target_price), "notified": False}},
        return_document=ReturnDocument.AFTER,
    )
    return _doc_to_item(doc) if doc else None


PRICE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?:₹|Rs\.?|INR)\s*([0-9][0-9,]*(?:\.\d{1,2})?)", re.IGNORECASE),
    re.compile(r"(?:\$|USD)\s*([0-9][0-9,]*(?:\.\d{1,2})?)", re.IGNORECASE),
    re.compile(r"([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:₹|INR|USD)", re.IGNORECASE),
)


def extract_price(text: str | None) -> Optional[float]:
    if not text:
        return None

    candidates: list[float] = []
    for pattern in PRICE_PATTERNS:
        for match in pattern.finditer(text[:12000]):
            raw = match.group(1).replace(",", "")
            try:
                value = float(raw)
            except ValueError:
                continue
            if value > 0:
                candidates.append(value)

    if not candidates:
        return None

    return min(candidates)
