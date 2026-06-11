"""FastAPI routes for Trackify."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from fastapi import Depends
from starlette.concurrency import run_in_threadpool

from ..auth.models import AuthUser
from ..auth.routes import current_user
from .fetcher import fetch_product_preview
from .email_service import send_price_alert
from .models import (
    PriceHistoryResponse,
    TrackItemCreate,
    TrackPreviewRequest,
    TrackPreviewResponse,
    TrackItemResponse,
    TrackListResponse,
    TrackRemoveResponse,
    TrackTargetUpdate,
)
from .service import add_track_item, attach_items_to_user, get_track_item, get_track_item_for_user, list_track_items, mark_notified, remove_track_item, update_target_price

log = logging.getLogger(__name__)

router = APIRouter(prefix="/trackify", tags=["trackify"])


def _send_due_alert(item) -> None:
    if item.last_checked_price is None or item.last_checked_price > item.target_price:
        return
    if item.notified:
        return
    sent = send_price_alert(
        item.user_email,
        item.product_name,
        item.last_checked_price,
        item.product_url,
        item.target_price,
        None,
    )
    if sent:
        mark_notified(item.id)


@router.post("/preview", response_model=TrackPreviewResponse)
async def preview(
    payload: TrackPreviewRequest,
    user: AuthUser = Depends(current_user),
) -> TrackPreviewResponse:
    try:
        result = await fetch_product_preview(str(payload.product_url))
        return TrackPreviewResponse(
            product_name=result.product_name,
            product_url=result.product_url,
            source=result.source,
            current_price=result.current_price,
            image=result.image,
        )
    except Exception as exc:
        log.exception("Trackify preview failed")
        raise HTTPException(
            status_code=422,
            detail="Could not read product details from this link. Check the URL and try again.",
        ) from exc


@router.post("/add", response_model=TrackItemResponse, status_code=status.HTTP_201_CREATED)
async def add(
    payload: TrackItemCreate,
    user: AuthUser = Depends(current_user),
) -> TrackItemResponse:
    try:
        product_name = payload.product_name
        current_price = payload.current_price
        image = payload.image
        if not product_name or current_price is None:
            fetched = await fetch_product_preview(str(payload.product_url))
            product_name = product_name or fetched.product_name
            current_price = current_price if current_price is not None else fetched.current_price
            image = image or fetched.image
            source = fetched.source
        else:
            source = payload.source or "Web"
        if current_price is None:
            raise HTTPException(status_code=422, detail="Current price is unavailable for this product.")
        if payload.target_price > current_price:
            raise HTTPException(status_code=422, detail="Target price must be less than or equal to current price.")
        hydrated = TrackItemCreate(
            product_url=payload.product_url,
            target_price=payload.target_price,
            product_name=product_name,
            user_email=payload.user_email or user.email,
            current_price=current_price,
            image=image,
            source=source,
        )
        item = await run_in_threadpool(
            add_track_item,
            hydrated,
            user.id,
            user.email,
        )
        if item.last_checked_price is not None and item.last_checked_price <= item.target_price:
            await run_in_threadpool(_send_due_alert, item)
            item = await run_in_threadpool(get_track_item, item.id)
        return TrackItemResponse(item=item)
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Trackify add failed")
        raise HTTPException(status_code=500, detail="Could not add Trackify item") from exc


@router.get("/list", response_model=TrackListResponse)
async def list_items(user: AuthUser = Depends(current_user)) -> TrackListResponse:
    try:
        await run_in_threadpool(attach_items_to_user, user.id, user.email)
        items = await run_in_threadpool(list_track_items, user.id, user.email)
        return TrackListResponse(items=items)
    except Exception as exc:
        log.exception("Trackify list failed")
        raise HTTPException(status_code=500, detail="Could not list Trackify items") from exc


@router.get("/price-history/{item_id}", response_model=PriceHistoryResponse)
async def price_history(
    item_id: int,
    user: AuthUser = Depends(current_user),
) -> PriceHistoryResponse:
    item = await run_in_threadpool(get_track_item_for_user, item_id, user.id, user.email)
    if not item:
        raise HTTPException(status_code=404, detail="Trackify item not found")
    points = []
    for point in item.price_history:
        price = point.get("price")
        checked_at = point.get("checked_at")
        if price is None or not checked_at:
            continue
        points.append({"price": float(price), "checked_at": checked_at})
    return PriceHistoryResponse(item_id=item.id, product_name=item.product_name, points=points)


@router.delete("/remove/{item_id}", response_model=TrackRemoveResponse)
async def remove(
    item_id: int,
    user: AuthUser = Depends(current_user),
) -> TrackRemoveResponse:
    removed = await run_in_threadpool(
        remove_track_item,
        item_id,
        user.id,
        user.email,
    )
    if not removed:
        raise HTTPException(status_code=404, detail="Trackify item not found")
    return TrackRemoveResponse(removed=True)


@router.patch("/update/{item_id}", response_model=TrackItemResponse)
async def update_target(
    item_id: int,
    payload: TrackTargetUpdate,
    user: AuthUser = Depends(current_user),
) -> TrackItemResponse:
    current = await run_in_threadpool(get_track_item_for_user, item_id, user.id, user.email)
    if not current:
        raise HTTPException(status_code=404, detail="Trackify item not found")
    if current.last_checked_price is not None and payload.target_price > current.last_checked_price:
        raise HTTPException(status_code=422, detail="Target price must be less than or equal to current price.")
    item = await run_in_threadpool(
        update_target_price,
        item_id,
        payload.target_price,
        user.id,
        user.email,
    )
    if not item:
        raise HTTPException(status_code=404, detail="Trackify item not found")
    if item.last_checked_price is not None and item.last_checked_price <= item.target_price:
        await run_in_threadpool(_send_due_alert, item)
        item = await run_in_threadpool(get_track_item, item.id)
    return TrackItemResponse(item=item)
