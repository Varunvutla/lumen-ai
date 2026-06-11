"""AI Shopping Copilot — multi-turn conversational shopping assistant.

POST /api/chat
  Body: { messages, context }
  Returns: { reply, suggested_searches, action }
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from .auth.models import AuthUser
from .auth.routes import optional_user
from .config import settings
from .llm import LLMError, llm
from .search import SearchHit, search_client

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/copilot", tags=["copilot"])

# ── Schemas ────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ProductContext(BaseModel):
    title: str
    url: str
    price: Optional[str] = None
    reason: Optional[str] = None
    source: Optional[str] = None


class SearchContext(BaseModel):
    query: str
    products: List[ProductContext] = Field(default_factory=list)
    summary: Optional[str] = None


class CompareItemContext(BaseModel):
    title: str
    url: str
    price: Optional[str] = None
    source: Optional[str] = None


class TrackedItemContext(BaseModel):
    id: int
    product_name: str
    product_url: str
    current_price: Optional[float] = None
    target_price: float
    source: Optional[str] = None


class CopilotRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., min_length=1, max_length=40)
    context: Optional[SearchContext] = None
    compare_items: Optional[List[CompareItemContext]] = Field(default_factory=list)
    tracked_items: Optional[List[TrackedItemContext]] = Field(default_factory=list)


class CopilotResponse(BaseModel):
    reply: str
    action: str = "reply"          # "reply" | "searched"
    search_query: Optional[str] = None
    new_products: Optional[List[ProductContext]] = None


# ── System prompt ──────────────────────────────────────────────────────────────

def _build_system(
    context: Optional[SearchContext],
    compare_items: Optional[List[CompareItemContext]] = None,
    tracked_items: Optional[List[TrackedItemContext]] = None,
) -> str:
    base = """You are LuMen Copilot — a smart, friendly AI shopping assistant embedded in the LuMen shopping app.
You have access to live web search results and can help users:
- Understand and compare products from their current search
- Answer specific product questions (specs, compatibility, alternatives)
- Refine their requirements and find better options
- Give honest buying advice with no affiliate bias

Personality: Concise, direct, and genuinely helpful. Use bullet points for lists.
Never invent prices or specs — only state what you know from the context or search results.
If you're unsure, say so and offer to search for more info.
Keep replies SHORT (3-5 sentences max unless user asks for detail).
"""

    if compare_items:
        items_str = "\n".join(
            f"  - {it.title} ({it.price or 'Price N/A'}) from {it.source or 'Web'} [URL: {it.url}]"
            for it in compare_items
        )
        base += f"\n\n## Comparison Drawer Context\nThe user currently has these items pinned in their comparison drawer:\n{items_str}"

    if tracked_items:
        items_str = "\n".join(
            f"  - {it.product_name} (Current: {it.current_price or 'N/A'}, Target: {it.target_price}) from {it.source or 'Web'} [URL: {it.product_url}]"
            for it in tracked_items
        )
        base += f"\n\n## Trackify Price Tracking Context\nThe user is currently tracking the prices of these items:\n{items_str}"

    if context and context.products:
        product_list = "\n".join(
            f"  {i+1}. {p.title}"
            + (f" — {p.price}" if p.price else "")
            + (f" [{p.source}]" if p.source else "")
            + (f"\n     Reason: {p.reason}" if p.reason else "")
            for i, p in enumerate(context.products[:8])
        )
        base += f"""

## Current Search Context
User just searched for: "{context.query}"
{f'Summary: {context.summary}' if context.summary else ''}

Products shown to the user:
{product_list}

You can reference these products by number (e.g. "Option 1", "the first one").
If the user asks something that requires searching for new products, output a JSON action block like:
<search>the search query here</search>
"""
    else:
        base += "\nNo products are currently shown. Help the user describe what they need."

    return base


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _maybe_search(reply: str) -> tuple[str, Optional[str], Optional[List[ProductContext]]]:
    """If the LLM embedded a <search>...</search> tag, execute the search."""
    import re
    match = re.search(r"<search>(.*?)</search>", reply, re.IGNORECASE | re.DOTALL)
    if not match or not search_client.enabled:
        return reply, None, None

    query = match.group(1).strip()
    # Strip the tag from the reply
    clean_reply = re.sub(r"<search>.*?</search>", "", reply, flags=re.IGNORECASE | re.DOTALL).strip()

    try:
        hits: List[SearchHit] = await search_client.search(query, max_results=4)
        products = [
            ProductContext(
                title=h.title,
                url=h.url,
                price=None,
                source=h.source,
            )
            for h in hits[:4]
        ]
        return clean_reply, query, products
    except Exception as exc:
        log.warning("Copilot search failed: %s", exc)
        return clean_reply, query, None


# ── Endpoint ───────────────────────────────────────────────────────────────────

@router.post("", response_model=CopilotResponse)
async def copilot_chat(
    req: CopilotRequest,
    user: Optional[AuthUser] = Depends(optional_user),
) -> CopilotResponse:
    """Multi-turn AI shopping assistant. Works for guests too."""

    system_prompt = _build_system(req.context, req.compare_items, req.tracked_items)

    # Build the messages payload for the LLM
    history = [
        {"role": m.role, "content": m.content}
        for m in req.messages
    ]

    # Use raw HTTP to support multi-turn messages (llm.chat_json only supports 2-turn)
    reply_text = await _multi_turn_chat(system_prompt, history)

    # Check if LLM wants to trigger a search
    reply_clean, search_query, new_products = await _maybe_search(reply_text)

    action = "searched" if search_query else "reply"

    return CopilotResponse(
        reply=reply_clean or reply_text,
        action=action,
        search_query=search_query,
        new_products=new_products,
    )


async def _multi_turn_chat(system: str, messages: List[Dict[str, str]]) -> str:
    """Call the active LLM provider with full conversation history, falling back on failure."""
    if not llm.enabled:
        raise LLMError("No LLM provider configured.")

    providers = llm._available_providers()
    last_exc: Exception | None = None

    for provider in providers:
        try:
            try:
                return await _call_multi_turn_provider(provider, system, messages)
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 429:
                    # Rate limited — try one short Retry-After wait, then move on
                    retry_after = exc.response.headers.get("retry-after")
                    try:
                        wait_s = min(float(retry_after), 15.0) if retry_after else 5.0
                    except ValueError:
                        wait_s = 5.0
                    log.warning("%s rate-limited (429) in copilot; retrying in %.0fs", provider, wait_s)
                    await asyncio.sleep(wait_s)
                    return await _call_multi_turn_provider(provider, system, messages)
                else:
                    raise
        except Exception as exc:
            log.warning("%s failed (%s) in copilot; falling back to next provider", provider, exc)
            last_exc = exc
            continue

    raise LLMError(f"All LLM providers failed in copilot. Last error: {last_exc}") from last_exc


async def _call_multi_turn_provider(provider: str, system: str, messages: List[Dict[str, str]]) -> str:
    if provider == "groq":
        return await _groq_chat(system, messages)
    if provider == "opencode":
        return await _opencode_chat(system, messages)
    if provider == "openai":
        return await _openai_chat(system, messages)
    if provider == "gemini":
        return await _gemini_chat_flat(system, messages)
    if provider == "anthropic":
        return await _anthropic_chat(system, messages)
    raise LLMError(f"Unsupported provider: {provider}")


async def _opencode_chat(system: str, messages: List[Dict]) -> str:
    url = "https://opencode.ai/zen/v1/responses"
    headers = {
        "Authorization": f"Bearer {settings.opencode_api_key}",
        "Content-Type": "application/json",
    }
    payload: Dict[str, Any] = {
        "model": settings.opencode_model or "big-pickle",
        "messages": [{"role": "system", "content": system}] + messages,
        "temperature": 0.5,
        "max_tokens": 800,
        "stream": False,
    }
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(url, headers=headers, json=payload)
        r.raise_for_status()
        data = r.json()
    
    if "choices" in data:
        return data["choices"][0]["message"]["content"]
    elif "output" in data:
        if isinstance(data["output"], list) and len(data["output"]) > 0:
            if "message" in data["output"][0]:
                return data["output"][0]["message"]["content"]
            elif "content" in data["output"][0]:
                return data["output"][0]["content"]
        elif isinstance(data["output"], str):
            return data["output"]
    raise LLMError(f"Unexpected OpenCode response shape: {data}")


async def _groq_chat(system: str, messages: List[Dict]) -> str:
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.groq_api_key}",
        "Content-Type": "application/json",
    }
    payload: Dict[str, Any] = {
        "model": settings.groq_model or "llama3-8b-8192",
        "messages": [{"role": "system", "content": system}] + messages,
        "temperature": 0.5,
        "max_completion_tokens": 800,
        "stream": False,
    }
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(url, headers=headers, json=payload)
        r.raise_for_status()
        data = r.json()
    return data["choices"][0]["message"]["content"]


async def _openai_chat(system: str, messages: List[Dict]) -> str:
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.openai_model or "gpt-4o-mini",
        "messages": [{"role": "system", "content": system}] + messages,
        "temperature": 0.5,
        "max_tokens": 800,
    }
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(url, headers=headers, json=payload)
        r.raise_for_status()
        data = r.json()
    return data["choices"][0]["message"]["content"]


async def _anthropic_chat(system: str, messages: List[Dict]) -> str:
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": settings.anthropic_api_key or "",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.anthropic_model or "claude-3-5-haiku-latest",
        "system": system,
        "messages": messages,
        "temperature": 0.5,
        "max_tokens": 800,
    }
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(url, headers=headers, json=payload)
        r.raise_for_status()
        data = r.json()
    return data["content"][0]["text"]


async def _gemini_chat_flat(system: str, messages: List[Dict]) -> str:
    """Flatten history into a single prompt for Gemini."""
    history_text = "\n".join(
        f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}"
        for m in messages
    )
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model or 'gemini-2.0-flash'}:generateContent"
        f"?key={settings.gemini_api_key}"
    )
    payload = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": history_text}]}],
        "generationConfig": {"temperature": 0.5, "maxOutputTokens": 800},
    }
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(url, json=payload)
        r.raise_for_status()
        data = r.json()
    return data["candidates"][0]["content"]["parts"][0]["text"]
