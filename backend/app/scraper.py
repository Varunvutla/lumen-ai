"""Optional Firecrawl-based enrichment for top candidates."""
from __future__ import annotations

import asyncio
from typing import Optional

import httpx

from .config import settings


async def firecrawl_scrape(url: str, *, timeout: float = 25.0) -> Optional[str]:
    """Return cleaned markdown for a URL, or None if Firecrawl is not configured."""
    if not settings.firecrawl_api_key:
        return None
    api = "https://api.firecrawl.dev/v1/scrape"
    headers = {
        "Authorization": f"Bearer {settings.firecrawl_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "url": url,
        "formats": ["markdown"],
        "onlyMainContent": True,
    }
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(api, headers=headers, json=payload)
            r.raise_for_status()
            data = r.json()
        return (data.get("data") or {}).get("markdown")
    except Exception:
        # Enrichment is best-effort.
        return None


async def firecrawl_scrape_many(urls: list[str], *, char_cap: int = 4000) -> list[Optional[str]]:
    """Concurrently scrape several URLs, capping each result for context size."""
    if not settings.firecrawl_api_key or not urls:
        return [None] * len(urls)
    results = await asyncio.gather(*(firecrawl_scrape(u) for u in urls), return_exceptions=True)
    out: list[Optional[str]] = []
    for r in results:
        if isinstance(r, Exception) or not r:
            out.append(None)
        else:
            out.append(r[:char_cap])
    return out
