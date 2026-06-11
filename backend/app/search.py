"""Web search client. Supports Tavily (preferred) and SerpAPI."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional
from urllib.parse import urlparse

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from .config import settings


class SearchError(RuntimeError):
    pass


@dataclass
class SearchHit:
    title: str
    url: str
    snippet: str
    image: Optional[str] = None
    source: str = ""

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "url": self.url,
            "snippet": self.snippet,
            "image": self.image,
            "source": self.source,
        }


def _domain(url: str) -> str:
    try:
        host = urlparse(url).hostname or ""
        return host.lstrip("www.") if host.startswith("www.") else host
    except Exception:
        return ""


def _clean_image_url(url: str | None) -> str:
    if not url:
        return ""
    cleaned = str(url).strip()
    for marker in ("/https://", "/http://"):
        marker_index = cleaned.find(marker)
        if marker_index > 0:
            cleaned = cleaned[marker_index + 1 :]
            break
    first_query = cleaned.find("?")
    if first_query != -1:
        cleaned = cleaned[: first_query + 1] + cleaned[first_query + 1 :].replace("?", "&")
    return cleaned


class SearchClient:
    def __init__(self) -> None:
        self.provider = settings.search_provider

    @property
    def enabled(self) -> bool:
        return self.provider is not None

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        reraise=True,
    )
    async def search(
        self,
        query: str,
        *,
        max_results: int = 8,
        include_domains: Optional[List[str]] = None,
    ) -> List[SearchHit]:
        if not self.enabled:
            raise SearchError("No search provider configured. Set TAVILY_API_KEY or SERPAPI_API_KEY.")
        if self.provider == "tavily":
            return await self._tavily(query, max_results, include_domains=include_domains)
        if self.provider == "serpapi":
            return await self._serpapi(query, max_results)
        raise SearchError(f"Unsupported search provider: {self.provider}")

    # ─── Tavily ────────────────────────────────────────────────
    async def _tavily(
        self, query: str, max_results: int, include_domains: Optional[List[str]] = None
    ) -> List[SearchHit]:
        url = "https://api.tavily.com/search"
        payload = {
            "api_key": settings.tavily_api_key,
            "query": query,
            "search_depth": "advanced",
            "include_images": True,
            "include_answer": False,
            "max_results": max_results,
        }
        if include_domains:
            payload["include_domains"] = include_domains
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(url, json=payload)
            r.raise_for_status()
            data = r.json()

        images: list[str] = []
        seen_images: set[str] = set()
        for img in (data.get("images") or []):
            if isinstance(img, str):
                u = _clean_image_url(img)
            elif isinstance(img, dict):
                u = _clean_image_url(img.get("url"))
            else:
                u = ""
            if u and u not in seen_images:
                seen_images.add(u)
                images.append(u)

        hits: List[SearchHit] = []
        for result_index, item in enumerate(data.get("results", [])):
            url_ = item.get("url") or ""
            if not url_:
                continue

            # Prefer the per-result image Tavily sometimes includes directly
            image: Optional[str] = _clean_image_url(item.get("image")) or None

            # If no per-result image, first try a domain match, then fall back
            # to Tavily's image pool by result position so the UI still gets a
            # real visual instead of an empty/letter placeholder.
            if not image:
                result_domain = _domain(url_)
                for img_url in images:
                    if result_domain and result_domain in img_url:
                        image = img_url
                        break
            if not image and images:
                image = images[result_index % len(images)]

            hits.append(
                SearchHit(
                    title=item.get("title", "").strip() or url_,
                    url=url_,
                    snippet=(item.get("content") or "").strip(),
                    image=image,
                    source=_domain(url_),
                )
            )
        return hits


    # ─── SerpAPI ───────────────────────────────────────────────
    async def _serpapi(self, query: str, max_results: int) -> List[SearchHit]:
        url = "https://serpapi.com/search.json"
        params = {
            "engine": "google_shopping",
            "q": query,
            "api_key": settings.serpapi_api_key,
            "num": max_results,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
            data = r.json()

        hits: List[SearchHit] = []
        for item in (data.get("shopping_results") or [])[:max_results]:
            url_ = item.get("product_link") or item.get("link") or ""
            if not url_:
                continue
            hits.append(
                SearchHit(
                    title=item.get("title", "").strip() or url_,
                    url=url_,
                    snippet=(
                        f"{item.get('source', '')} "
                        f"{item.get('price', '')} "
                        f"{item.get('rating', '')}"
                    ).strip(),
                    image=item.get("thumbnail"),
                    source=item.get("source") or _domain(url_),
                )
            )

        # Fallback to organic results if shopping returned nothing.
        if not hits:
            for item in (data.get("organic_results") or [])[:max_results]:
                url_ = item.get("link") or ""
                if not url_:
                    continue
                hits.append(
                    SearchHit(
                        title=item.get("title", "").strip() or url_,
                        url=url_,
                        snippet=(item.get("snippet") or "").strip(),
                        image=(item.get("thumbnail") or None),
                        source=_domain(url_),
                    )
                )
        return hits


search_client = SearchClient()
