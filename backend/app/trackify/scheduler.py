"""Background scheduler for Trackify price checks."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler

from .fetcher import fetch_product_preview
from .email_service import send_price_alert
from .service import get_batch, init_db, mark_notified, reset_notification, update_checked_price

log = logging.getLogger(__name__)

BATCH_SIZE = 15
REQUEST_DELAY_SECONDS = 2
SCRAPER_TIMEOUT_SECONDS = 20.0

_scheduler: Optional[BackgroundScheduler] = None


def _scrape_price(url: str) -> Optional[float]:
    preview = asyncio.run(fetch_product_preview(url, timeout=SCRAPER_TIMEOUT_SECONDS))
    return preview.current_price


def check_all_prices() -> None:
    init_db()
    items = get_batch(BATCH_SIZE)
    if not items:
        log.info("Trackify scheduler found no products to check")
        return

    log.info("Trackify checking %d product(s)", len(items))
    for item in items:
        try:
            old_price = item.last_checked_price
            latest_price = _scrape_price(item.product_url) or item.last_checked_price
            if latest_price is None:
                log.warning("Trackify could not extract price for item %s", item.id)
                update_checked_price(item.id, None)
                continue

            update_checked_price(item.id, latest_price)
            if latest_price <= item.target_price and not item.notified:
                sent = send_price_alert(
                    item.user_email,
                    item.product_name,
                    latest_price,
                    item.product_url,
                    item.target_price,
                    old_price,
                )
                if sent:
                    mark_notified(item.id)
            elif item.notified:
                reset_notification(item.id)
        except Exception:
            log.exception("Trackify skipped item %s after price check failure", item.id)
        finally:
            time.sleep(REQUEST_DELAY_SECONDS)


def start_scheduler() -> BackgroundScheduler:
    global _scheduler
    init_db()
    if _scheduler and _scheduler.running:
        return _scheduler

    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(
        check_all_prices,
        "interval",
        hours=1,
        max_instances=1,
        coalesce=True,
        id="trackify_check_all_prices",
        replace_existing=True,
    )
    _scheduler.start()
    log.info("Trackify scheduler started")
    return _scheduler


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        log.info("Trackify scheduler stopped")
    _scheduler = None
