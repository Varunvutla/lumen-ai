"""Best-effort product metadata extraction for Trackify."""
from __future__ import annotations

import html
import json
import logging
import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urljoin, urlparse

import httpx

from ..scraper import firecrawl_scrape
from .service import extract_price

log = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36"
)


@dataclass
class ProductPreview:
    product_name: str
    product_url: str
    source: str
    current_price: Optional[float] = None
    image: Optional[str] = None


def _source(url: str) -> str:
    host = urlparse(url).hostname or "web"
    host = host[4:] if host.startswith("www.") else host
    return host.split(".")[0].title() if host else "Web"


def _clean_text(value: str | None) -> str:
    if not value:
        return ""
    value = re.sub(r"<[^>]+>", " ", value)
    value = html.unescape(value)
    return re.sub(r"\s+", " ", value).strip()


def _meta(html_text: str, *names: str) -> str:
    for name in names:
        patterns = (
            rf'<meta[^>]+(?:property|name)=["\']{re.escape(name)}["\'][^>]+content=["\']([^"\']+)["\']',
            rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']{re.escape(name)}["\']',
        )
        for pattern in patterns:
            match = re.search(pattern, html_text, flags=re.IGNORECASE)
            if match:
                return _clean_text(match.group(1))
    return ""


def _title(html_text: str) -> str:
    title = _meta(html_text, "og:title", "twitter:title")
    if title:
        return title[:240]
    match = re.search(r"<title[^>]*>(.*?)</title>", html_text, flags=re.IGNORECASE | re.DOTALL)
    return _clean_text(match.group(1) if match else "")[:240]


def _image(html_text: str, base_url: str) -> Optional[str]:
    image = _meta(html_text, "og:image", "twitter:image", "twitter:image:src")
    if image:
        return urljoin(base_url, image)
    match = re.search(
        r'<img[^>]+(?:id|class)=["\'][^"\']*(?:product|main|hero|image)[^"\']*["\'][^>]+src=["\']([^"\']+)["\']',
        html_text,
        flags=re.IGNORECASE,
    )
    if match:
        return urljoin(base_url, html.unescape(match.group(1)))
    return None


def _jsonld_price(html_text: str) -> Optional[float]:
    blocks = re.findall(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html_text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    for block in blocks:
        try:
            data = json.loads(html.unescape(block.strip()))
        except Exception:
            continue
        queue = data if isinstance(data, list) else [data]
        while queue:
            node = queue.pop(0)
            if isinstance(node, list):
                queue.extend(node)
                continue
            if not isinstance(node, dict):
                continue
            offers = node.get("offers")
            if isinstance(offers, dict):
                raw = offers.get("price") or offers.get("lowPrice") or offers.get("highPrice")
                try:
                    return float(str(raw).replace(",", ""))
                except (TypeError, ValueError):
                    pass
            queue.extend(v for v in node.values() if isinstance(v, (dict, list)))
    return None


def _html_price(html_text: str) -> Optional[float]:
    selectors = (
        r'id=["\']priceblock_[^"\']+["\'][^>]*>\s*([^<]+)',
        r'class=["\']a-price-whole["\'][^>]*>\s*([^<]+)',
        r'class=["\']a-offscreen["\'][^>]*>\s*([^<]+)',
        r'class=["\'][^"\']*(?:_30jeq3|Nx9bqj|price|amount|selling-price|discountedPrice|final-price|product-price)[^"\']*["\'][^>]*>\s*([^<]+)',
        r'(?:itemprop|property)=["\']price["\'][^>]*(?:content|value)=["\']([^"\']+)["\']',
        r'(?:₹|Rs\.?|INR|\$|USD)\s*[0-9][0-9,]*(?:\.\d{1,2})?',
    )
    snippets: list[str] = []
    for pattern in selectors:
        snippets.extend(
            match.group(1) if match.groups() else match.group(0)
            for match in re.finditer(pattern, html_text, flags=re.IGNORECASE)
        )
    return extract_price(" ".join(snippets) or html_text[:25000])


async def fetch_product_preview(url: str, *, timeout: float = 20.0) -> ProductPreview:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=headers) as client:
                response = await client.get(url)
                response.raise_for_status()
            html_text = response.text
            final_url = str(response.url)
            name = _title(html_text) or final_url
            price = _jsonld_price(html_text) or _html_price(html_text)
            image = _image(html_text, final_url)
            return ProductPreview(name, final_url, _source(final_url), price, image)
        except Exception as exc:
            last_error = exc
            log.warning("Direct product fetch attempt %s failed for %s", attempt + 1, url, exc_info=True)

    try:
        markdown = await firecrawl_scrape(url, timeout=timeout)
    except Exception as exc:
        last_error = exc
        markdown = None

    if markdown:
        lines = [line.strip("#* -") for line in markdown.splitlines() if line.strip()]
        name = next((line for line in lines if len(line) > 8), url)
        return ProductPreview(name[:240], url, _source(url), extract_price(markdown), None)

    raise RuntimeError(f"Could not fetch product details from this link: {last_error}")
