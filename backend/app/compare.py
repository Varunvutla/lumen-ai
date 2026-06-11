"""LLM-driven head-to-head product comparison.

Given the user's original query and a shortlist of pinned items, we:
  1. Optionally scrape each item's URL with Firecrawl for grounded specs.
  2. Ask the LLM to extract a unified spec matrix, pros/cons, awards, and
     a verdict tailored to the user's intent.
  3. Validate and shape the response into a stable schema.
"""
from __future__ import annotations

import json
import logging
from typing import List

from .config import settings
from .llm import LLMError, llm
from .models import (
    CompareItem,
    CompareRequest,
    CompareResponse,
    ItemAnalysis,
    Providers,
    SpecCell,
    SpecRow,
    Verdict,
)
from .scraper import firecrawl_scrape_many

log = logging.getLogger(__name__)


COMPARE_SYSTEM = """You are a careful, opinionated shopping analyst.

You will be given:
- The user's original natural-language request.
- 2 to 6 pinned products with title, source domain, snippet, optional price,
  optional reason, and (sometimes) cleaned product-page text.

Your job is to produce a fair, side-by-side comparison and a clear verdict
for THIS user's specific intent. Be concrete and specific. Never invent
numbers — if a spec is unknown, write the exact string "—".

Choose 6 to 9 attributes that genuinely matter for THIS product category and
THIS user's intent (e.g. for headphones: ANC quality, battery life, weight,
codec support, warranty, price). Skip attributes that don't apply.

For each attribute set "higher_is_better":
  true   for things like battery life, warranty, rating
  false  for things like price, weight (lower wins)
  null   when not applicable (e.g. brand)

For each attribute, identify the WINNING column (or columns if tied) and
mark "is_winner": true on those cells. If the attribute is unknown for a
column, leave its cell value as "—" and is_winner false.

For each product, write 2-3 short, concrete pros and 2-3 honest cons, each
under 14 words, that are tied to evidence from the inputs.

Optionally award one product per category: "Best Overall", "Best Value",
"Best for <use-case derived from query>". Awards are optional and at most
one per product. Do not give the same award to multiple products.

Finally, pick a single overall winner_index (0-based) and write a 2-3
sentence verdict explaining the choice in plain English, referencing the
user's actual constraints (budget, use case, must-haves).

Return ONLY a JSON object with this exact shape:

{
  "matrix": [
    {
      "attribute": string,
      "higher_is_better": boolean | null,
      "cells": [
        { "value": string, "note": string | null, "is_winner": boolean }
        // one cell per product, in input order
      ]
    }
  ],
  "analyses": [
    {
      "title": string,
      "url": string,
      "pros": [string, ...],
      "cons": [string, ...],
      "award": string | null
    }
    // one per product, in input order, copy title and url verbatim
  ],
  "verdict": {
    "winner_index": int,
    "headline": string,
    "explanation": string
  }
}

Rules:
- Cells array MUST have exactly the same length as the input products array.
- analyses array MUST have exactly the same length and order.
- Use plain ASCII for comparison values where possible; keep currency
  symbols and units verbatim (e.g. "$249.99", "30 h", "250 g").
- No markdown, no prose outside the JSON."""


def _build_user_msg(req: CompareRequest, scraped: List[str | None]) -> str:
    payload = []
    for i, it in enumerate(req.items):
        block = {
            "index": i,
            "title": it.title,
            "url": it.url,
            "source": it.source,
            "price": it.price,
            "snippet": it.snippet,
            "reason": it.reason,
        }
        if scraped[i]:
            block["page_text"] = scraped[i]
        payload.append(block)

    return (
        f"User's original request: {req.query!r}\n"
        f"Number of products to compare: {len(req.items)}\n"
        f"Products (in order):\n{json.dumps(payload, ensure_ascii=False)}\n"
        "Produce the JSON now."
    )


def _shape_response(raw: dict, req: CompareRequest, grounded: bool) -> CompareResponse:
    n = len(req.items)

    # Matrix
    matrix: List[SpecRow] = []
    for row in raw.get("matrix") or []:
        attr = (row.get("attribute") or "").strip()
        if not attr:
            continue
        cells_in = row.get("cells") or []
        # Pad / truncate to match n
        cells: List[SpecCell] = []
        for i in range(n):
            c = cells_in[i] if i < len(cells_in) else {}
            value = (c.get("value") or "—").strip() or "—"
            cells.append(
                SpecCell(
                    value=value[:120],
                    note=(c.get("note") or None),
                    is_winner=bool(c.get("is_winner")),
                )
            )
        matrix.append(
            SpecRow(
                attribute=attr[:60],
                cells=cells,
                higher_is_better=row.get("higher_is_better"),
            )
        )

    # Analyses
    analyses_in = raw.get("analyses") or []
    analyses: List[ItemAnalysis] = []
    for i, it in enumerate(req.items):
        a = analyses_in[i] if i < len(analyses_in) else {}
        pros = [p.strip() for p in (a.get("pros") or []) if p and p.strip()][:4]
        cons = [c.strip() for c in (a.get("cons") or []) if c and c.strip()][:4]
        award = (a.get("award") or "").strip() or None
        analyses.append(
            ItemAnalysis(
                title=it.title,
                url=it.url,
                pros=pros,
                cons=cons,
                award=award,
            )
        )

    # De-dupe awards (keep first occurrence).
    seen_awards: set[str] = set()
    for a in analyses:
        if a.award:
            key = a.award.lower()
            if key in seen_awards:
                a.award = None
            else:
                seen_awards.add(key)

    # Verdict
    v_raw = raw.get("verdict") or {}
    try:
        winner = int(v_raw.get("winner_index", 0))
    except (TypeError, ValueError):
        winner = 0
    if winner < 0 or winner >= n:
        winner = 0
    verdict = Verdict(
        winner_index=winner,
        headline=(v_raw.get("headline") or "Top pick").strip()[:160],
        explanation=(v_raw.get("explanation") or "").strip()[:600],
    )

    return CompareResponse(
        query=req.query,
        matrix=matrix,
        analyses=analyses,
        verdict=verdict,
        grounded=grounded,
        providers=Providers(
            llm=settings.llm_provider,
            llm_model=settings.llm_model,
            search=settings.search_provider,
        ),
    )


async def compare(req: CompareRequest) -> CompareResponse:
    if not llm.enabled:
        raise RuntimeError("LLM provider not configured.")

    grounded = False
    scraped: List[str | None] = [None] * len(req.items)
    if req.deep and settings.firecrawl_api_key:
        log.info("Comparing with Firecrawl deep grounding (%d urls)", len(req.items))
        scraped = await firecrawl_scrape_many([it.url for it in req.items])
        grounded = any(scraped)

    user_msg = _build_user_msg(req, scraped)
    try:
        raw = await llm.chat_json(
            COMPARE_SYSTEM, user_msg, temperature=0.25, max_tokens=3500
        )
    except LLMError as exc:
        raise RuntimeError(f"LLM comparison failed: {exc}") from exc

    return _shape_response(raw, req, grounded=grounded)
