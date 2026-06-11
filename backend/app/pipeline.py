"""End-to-end recommendation pipeline."""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Dict, List

from .config import settings
from .llm import LLMError, llm
from .models import (
    Intent,
    Providers,
    RecommendRequest,
    RecommendResponse,
    Recommendation,
)
from .search import SearchError, SearchHit, search_client

log = logging.getLogger(__name__)

# ── Prompts ────────────────────────────────────────────────────────────────────

INTENT_SYSTEM = """You are a shopping assistant for the Indian market. Convert the user's query into a JSON intent.
Only return JSON, no prose.

Schema:
{
  "product_type": string | null,
  "budget_max": number | null,
  "budget_currency": string | null,
  "use_case": string | null,
  "must_have": string[],
  "nice_to_have": string[],
  "avoid": string[],
  "models": string[]   // 5-6 SPECIFIC product model names popular in India.
                       // Use these brands: ASUS, HP, Lenovo, Acer, Dell, Samsung, Apple,
                       // Realme, OnePlus, Redmi, Poco, iQOO, Nothing, boAt, JBL, Sony,
                       // LG, Whirlpool, Godrej, Dyson, Philips, Canon, Nikon.
                       // Examples:
                       //   laptop  → "ASUS VivoBook 15", "HP Victus 15", "Lenovo IdeaPad Slim 3",
                       //              "Acer Aspire 5", "Dell Inspiron 15 3520"
                       //   phone   → "Samsung Galaxy S24 FE", "Redmi Note 13 Pro",
                       //              "Realme Narzo 70", "OnePlus Nord CE4"
                       // Pick models AVAILABLE ON AMAZON.IN OR FLIPKART.COM.
                       // Never use generic strings like "laptop" or "phone" as a model.
}
Rules:
- "models" must always be specific brand+model (5-6 items).
- Prefer mid-range popular models unless user specifies premium.
- Never invent budgets not stated by the user.
- Output strictly valid JSON."""


RANK_SYSTEM = """You are an expert shopping advisor. You receive:
- the user's original query + intent
- a list of candidate web search results (index, title, url, snippet, source)

ONLY pick results that are INDIVIDUAL PRODUCT LISTING PAGES — a page where you
can add a single specific product to cart. Reject everything else.

HARD REJECT (do not pick these under any circumstance):
- Category / listing pages: titles like "Laptops", "Best Buy Laptops", "Shop Laptops"
- Roundup articles: "Top 10 laptops", "Best laptops 2024", "Laptops under 50000"
- Store homepages or department pages
- Review articles that cover multiple products

ONLY ACCEPT:
- A page for ONE specific product: "ASUS VivoBook 15 X1502ZA-EJ741WS"
- Amazon /dp/ pages, Flipkart /p/ pages, brand official product pages
- The snippet should mention specs like RAM, processor, display, price

For each accepted pick return:
- index      : 0-based index
- score      : 0.0–1.0 fit to user needs
- reason     : one sentence, cite a specific spec/feature matching user intent
- price      : price string from snippet if found, else null
- title_clean: ONLY "Brand Model" — e.g. "ASUS VivoBook 15 (Intel i5, 16GB)"
               Strip everything else. Never include site names.

Return JSON:
{
  "summary": "2-3 sentence buying advice",
  "picks": [{"index":int,"score":float,"reason":str,"price":str|null,"title_clean":str}]
}
Order best-first. Limit to top_k."""


# ── Product-page URL detector ──────────────────────────────────────────────────

# Patterns that strongly indicate an individual product page URL
_PRODUCT_URL_RE = re.compile(
    r"(/dp/[A-Z0-9]{6,})"           # Amazon ASIN
    r"|(/p/itm[a-zA-Z0-9]+)"        # Flipkart item
    r"|(/p/[a-zA-Z0-9\-]{8,})"      # Generic /p/<slug>
    r"|(/product/[a-zA-Z0-9\-]+)"   # /product/<slug>
    r"|(/products/[a-zA-Z0-9\-]+)"  # /products/<slug>
    r"|(/item/[a-zA-Z0-9\-]+)"      # /item/<slug>
    r"|(/buy/[a-zA-Z0-9\-]+)"       # /buy/<slug>
    r"|(/[a-zA-Z0-9\-]+-[a-zA-Z0-9]{6,}/[a-zA-Z0-9\-]+$)"  # brand-model-id paths
    r"|(skuId=\d+)"                  # BestBuy SKU
    r"|(productId=\d+)"              # generic productId
    r"|(/[0-9]{6,})"                 # numeric product IDs
    , re.IGNORECASE
)

# Title patterns that indicate category / roundup pages (hard reject)
_REJECT_TITLE_RE = re.compile(
    r"^(top\s+\d+|best\s+\w+\s+(to\s+buy|under|in\s+20\d\d)|"
    r"buy\s+\w+\s+online|shop\s+\w+|laptops?$|phones?$|tablets?$|"
    r"\w+\s+category|all\s+\w+|cheap\s+\w+|compare\s+\w+|"
    r"\w+\s+deals?$|\w+\s+sale$|best\s+\w+$)",
    re.IGNORECASE
)

# URL patterns that indicate category / search results pages (hard reject)
_REJECT_URL_RE = re.compile(
    r"(/s\?|/search\?|/search/|\?k=|\?q=|/category/|/categories/|"
    r"/c/[a-z]|/browse/|/all-|/laptops/?$|/computers/?$|/mobiles/?$|"
    r"/phones/?$|/tablets/?$|/televisions/?$|/headphones/?$|"
    r"bestbuy\.com/site/[^/]+/?$|newegg\.com/[a-z-]+/?$|"
    r"bhphotovideo\.com/c/browse|microcenter\.com/category)",
    re.IGNORECASE
)


def _is_product_page(hit: SearchHit) -> bool:
    url = hit.url
    if _REJECT_URL_RE.search(url):
        return False
    if _REJECT_TITLE_RE.match(hit.title.strip()):
        return False
    if _PRODUCT_URL_RE.search(url):
        return True
    # Heuristic: URL path has 3+ segments and the last segment looks like a product slug
    path = url.split("?")[0].rstrip("/")
    parts = [p for p in path.split("/") if p]
    if len(parts) >= 3 and len(parts[-1]) > 8 and "-" in parts[-1]:
        return True
    return False


def _dedupe_hits(hits: List[SearchHit]) -> List[SearchHit]:
    seen: set[str] = set()
    out: List[SearchHit] = []
    for h in hits:
        key = h.url.split("?")[0].rstrip("/")
        if key not in seen:
            seen.add(key)
            out.append(h)
    return out


def _filter_to_products(hits: List[SearchHit]) -> List[SearchHit]:
    products = [h for h in hits if _is_product_page(h)]
    log.info("Product filter: %d/%d hits are product pages", len(products), len(hits))
    # Fall back gracefully — keep non-rejected hits even if URL pattern didn't match
    if not products:
        non_category = [h for h in hits if not _REJECT_URL_RE.search(h.url)
                        and not _REJECT_TITLE_RE.match(h.title.strip())]
        return non_category if non_category else hits
    return products


# ── Intent parsing ─────────────────────────────────────────────────────────────

async def _parse_intent(query: str) -> Intent:
    user_msg = f"User query: {query!r}\nReturn the JSON intent now."
    try:
        data = await llm.chat_json(INTENT_SYSTEM, user_msg, temperature=0.1)
    except LLMError as exc:
        log.warning("Intent parse failed, using fallback: %s", exc)
        return Intent(product_type=None, search_queries=[query])

    intent = Intent(**{k: data.get(k) for k in Intent.model_fields.keys() if k in data})

    # Build one search query per model name — domains are restricted at search time
    models: List[str] = data.get("models") or []
    product_type: str = data.get("product_type") or query

    model_queries: List[str] = []
    for model in models[:6]:
        model_queries.append(f"{model} {product_type} buy")

    intent.search_queries = model_queries if model_queries else [f"buy {query}"]
    return intent


# ── Search ─────────────────────────────────────────────────────────────────────

# Shopping domains to restrict searches to — prioritise Indian e-commerce
_PRODUCT_DOMAINS = ["amazon.in", "flipkart.com", "croma.com", "reliancedigital.in"]


async def _run_searches(queries: List[str], region: str | None) -> List[SearchHit]:
    queries = [q.strip() for q in queries if q and q.strip()]
    if not queries:
        return []

    # Each query is constrained to shopping domains so we get product pages, not roundups
    tasks = [
        search_client.search(q, max_results=5, include_domains=_PRODUCT_DOMAINS)
        for q in queries[:4]
    ]
    results: List[List[SearchHit]] = []
    for r in await asyncio.gather(*tasks, return_exceptions=True):
        if isinstance(r, Exception):
            log.warning("Search query failed: %s", r)
            continue
        results.append(r)

    flat: List[SearchHit] = [h for batch in results for h in batch]
    deduped = _dedupe_hits(flat)
    filtered = _filter_to_products(deduped)

    # If domain-restricted search returned nothing, fall back to broader domains
    if not filtered:
        log.warning("Domain-restricted search returned 0 results, trying broader domains")
        broader = ["amazon.in", "flipkart.com", "amazon.com", "samsung.com", "apple.com"]
        fallback_tasks = [
            search_client.search(q, max_results=6, include_domains=broader)
            for q in queries[:3]
        ]
        fallback_results: List[List[SearchHit]] = []
        for r in await asyncio.gather(*fallback_tasks, return_exceptions=True):
            if not isinstance(r, Exception):
                fallback_results.append(r)
        flat2 = [h for batch in fallback_results for h in batch]
        filtered = _filter_to_products(_dedupe_hits(flat2))

    return filtered


# ── Ranking ────────────────────────────────────────────────────────────────────

async def _rank(query: str, intent: Intent, hits: List[SearchHit], top_k: int) -> Dict:
    if not hits:
        return {"summary": "No live results found for this query.", "picks": []}

    candidate_payload = [
        {
            "index": i,
            "title": h.title,
            "url": h.url,
            "source": h.source,
            "snippet": h.snippet[:400],
        }
        for i, h in enumerate(hits[:24])
    ]
    user_msg = (
        f"User query: {query}\n"
        f"Intent: {intent.model_dump_json()}\n"
        f"Top-K requested: {top_k}\n"
        f"Candidates:\n{json.dumps(candidate_payload, ensure_ascii=False)}\n"
        "Pick only individual product pages. Rank and write summary."
    )
    return await llm.chat_json(RANK_SYSTEM, user_msg, temperature=0.3, max_tokens=2000)


# ── Price cap ──────────────────────────────────────────────────────────────────

def _apply_price_cap(recs: List[Recommendation], max_price: float | None) -> List[Recommendation]:
    if not max_price:
        return recs
    kept: List[Recommendation] = []
    for r in recs:
        if not r.price:
            kept.append(r)
            continue
        digits = "".join(ch for ch in r.price if ch.isdigit() or ch == ".")
        try:
            value = float(digits) if digits else None
        except ValueError:
            value = None
        if value is None or value <= max_price:
            kept.append(r)
    return kept


# ── Main entry ─────────────────────────────────────────────────────────────────

async def recommend(req: RecommendRequest) -> RecommendResponse:
    if not llm.enabled:
        raise RuntimeError("LLM provider not configured.")
    if not search_client.enabled:
        raise RuntimeError("Search provider not configured.")

    intent = await _parse_intent(req.query)

    queries = intent.search_queries[:] or [req.query]
    if req.max_price and intent.budget_max is None:
        queries = [f"{q} under ₹{int(req.max_price)}" for q in queries]

    try:
        hits = await _run_searches(queries, req.region)
    except SearchError as exc:
        raise RuntimeError(str(exc)) from exc

    ranking = await _rank(req.query, intent, hits, req.top_k)

    picks = ranking.get("picks") or []
    summary = (ranking.get("summary") or "").strip() or "Here are the top live results for your query."

    recs: List[Recommendation] = []
    for pick in picks[: req.top_k]:
        try:
            idx = int(pick.get("index"))
        except (TypeError, ValueError):
            continue
        if idx < 0 or idx >= len(hits):
            continue
        h = hits[idx]
        recs.append(
            Recommendation(
                title=(pick.get("title_clean") or h.title)[:160],
                url=h.url,
                source=h.source,
                snippet=h.snippet[:280],
                price=pick.get("price"),
                image=h.image,
                score=float(pick.get("score") or 0.0),
                reason=(pick.get("reason") or "").strip(),
            )
        )

    recs = _apply_price_cap(recs, req.max_price)

    return RecommendResponse(
        query=req.query,
        intent=intent,
        summary=summary,
        results=recs,
        providers=Providers(
            llm=settings.llm_provider,
            llm_model=settings.llm_model,
            search=settings.search_provider,
        ),
    )
