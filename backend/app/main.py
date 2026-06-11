"""FastAPI entrypoint."""
from __future__ import annotations

import logging
from urllib.parse import unquote

import httpx
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .config import settings
from .llm import llm
from .models import (
    CompareRequest,
    CompareResponse,
    HealthResponse,
    RecommendRequest,
    RecommendResponse,
)
from .compare import compare as run_compare
from .pipeline import recommend
from .search import search_client
from .auth.models import AuthUser
from .auth.routes import router as auth_router
from .auth.routes import current_user, optional_user
from .copilot import router as copilot_router
from .trackify.routes import router as trackify_router
from .trackify.scheduler import shutdown_scheduler, start_scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("lumen")

app = FastAPI(
    title="LuMen - Smart Shopping Reader",
    description="Natural-language product recommendations, comparison, and price tracking grounded in live web search.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(copilot_router)
app.include_router(trackify_router)


@app.on_event("startup")
async def startup_event() -> None:
    start_scheduler()


@app.on_event("shutdown")
async def shutdown_event() -> None:
    shutdown_scheduler()


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        llm_provider=settings.llm_provider,
        llm_model=settings.llm_model,
        search_provider=settings.search_provider,
        firecrawl_enabled=bool(settings.firecrawl_api_key),
    )


# ── Image Proxy ───────────────────────────────────────────────────────────────
# Fetches product images server-side so the browser never hits Amazon/Flipkart
# CDNs directly (which block hotlinking from localhost / foreign referers).
def _clean_proxy_image_url(url: str) -> str:
    cleaned = unquote(url).strip()
    for marker in ("/https://", "/http://"):
        marker_index = cleaned.find(marker)
        if marker_index > 0:
            cleaned = cleaned[marker_index + 1 :]
            break
    first_query = cleaned.find("?")
    if first_query != -1:
        cleaned = cleaned[: first_query + 1] + cleaned[first_query + 1 :].replace("?", "&")
    return cleaned


@app.get("/api/proxy-image")
async def proxy_image(url: str) -> Response:
    """Proxy a remote product image to avoid CORS / hotlink restrictions."""
    if not url:
        raise HTTPException(status_code=400, detail="url param is required")
    url = _clean_proxy_image_url(url)

    # Determine referer from the URL so each CDN gets its own valid referer
    if "amazon" in url:
        referer = "https://www.amazon.in/"
    elif "flipkart" in url:
        referer = "https://www.flipkart.com/"
    else:
        referer = "https://www.google.com/"

    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            r = await client.get(
                url,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/124.0.0.0 Safari/537.36"
                    ),
                    "Referer": referer,
                    "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
                },
            )
            r.raise_for_status()
            content_type = r.headers.get("content-type", "image/jpeg")
            return Response(content=r.content, media_type=content_type)
    except httpx.HTTPStatusError as exc:
        log.warning("proxy-image upstream error %s for %s", exc.response.status_code, url)
        raise HTTPException(status_code=502, detail="Upstream image error") from exc
    except Exception as exc:
        log.warning("proxy-image failed for %s: %s", url, exc)
        raise HTTPException(status_code=502, detail="Could not fetch image") from exc
# ─────────────────────────────────────────────────────────────────────────────


@app.post("/api/recommend", response_model=RecommendResponse)
async def recommend_endpoint(
    req: RecommendRequest,
    user: AuthUser | None = Depends(optional_user),
) -> RecommendResponse:
    """Open to guests for their first free search; auth enforced on the frontend for subsequent ones."""
    if not llm.enabled:
        raise HTTPException(
            status_code=503,
            detail="No LLM provider configured. Set GROQ_API_KEY, OPENCODE_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, or ANTHROPIC_API_KEY.",
        )
    if not search_client.enabled:
        raise HTTPException(
            status_code=503,
            detail="No search provider configured. Set TAVILY_API_KEY or SERPAPI_API_KEY.",
        )
    try:
        return await recommend(req)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        log.exception("Recommendation failed")
        raise HTTPException(status_code=500, detail=f"Internal error: {exc}") from exc


@app.post("/api/compare", response_model=CompareResponse)
async def compare_endpoint(
    req: CompareRequest,
    user: AuthUser = Depends(current_user),
) -> CompareResponse:
    if not llm.enabled:
        raise HTTPException(
            status_code=503,
            detail="No LLM provider configured. Set GROQ_API_KEY, OPENCODE_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, or ANTHROPIC_API_KEY.",
        )
    try:
        return await run_compare(req)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        log.exception("Comparison failed")
        raise HTTPException(status_code=500, detail=f"Internal error: {exc}") from exc