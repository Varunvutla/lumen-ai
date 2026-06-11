"""Unified LLM client supporting OpenAI, Gemini, and Anthropic.

Exposes a single async ``chat_json`` method that returns a parsed dict.
The provider is auto-selected from environment variables.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Dict, Optional

import httpx

from .config import settings

log = logging.getLogger(__name__)


class LLMError(RuntimeError):
    pass


def _extract_json(text: str) -> Dict[str, Any]:
    """Best-effort extraction of a JSON object from a model response."""
    if not text:
        raise LLMError("Empty LLM response")

    text = text.strip()
    # Strip markdown fences if present.
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Fallback: grab the first {...} block.
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            raise LLMError(f"Could not parse JSON from LLM: {exc}") from exc

    raise LLMError("LLM did not return JSON")


class LLMClient:
    def __init__(self) -> None:
        self.provider = settings.llm_provider
        self.model = settings.llm_model

    @property
    def enabled(self) -> bool:
        return self.provider is not None

    def _available_providers(self) -> list[str]:
        """All providers with a configured key, primary first."""
        order = []
        if settings.groq_api_key:
            order.append("groq")
        if settings.opencode_api_key:
            order.append("opencode")
        if settings.gemini_api_key:
            order.append("gemini")
        if settings.openai_api_key:
            order.append("openai")
        if settings.anthropic_api_key:
            order.append("anthropic")
        # Put the configured primary provider first
        if self.provider in order:
            order.remove(self.provider)
            order.insert(0, self.provider)
        return order

    async def _call_provider(
        self, provider: str, system: str, user: str, temperature: float, max_tokens: int
    ) -> Dict[str, Any]:
        if provider == "openai":
            return await self._openai(system, user, temperature, max_tokens)
        if provider == "groq":
            return await self._groq(system, user, temperature, max_tokens)
        if provider == "opencode":
            return await self._opencode(system, user, temperature, max_tokens)
        if provider == "gemini":
            return await self._gemini(system, user, temperature, max_tokens)
        if provider == "anthropic":
            return await self._anthropic(system, user, temperature, max_tokens)
        raise LLMError(f"Unsupported provider: {provider}")

    async def chat_json(
        self,
        system: str,
        user: str,
        *,
        temperature: float = 0.2,
        max_tokens: int = 1500,
    ) -> Dict[str, Any]:
        if not self.enabled:
            raise LLMError("No LLM provider configured. Set an API key in .env.")

        providers = self._available_providers()
        last_exc: Exception | None = None

        for provider in providers:
            try:
                try:
                    return await self._call_provider(provider, system, user, temperature, max_tokens)
                except httpx.HTTPStatusError as exc:
                    if exc.response.status_code == 429:
                        # Rate limited — try one short Retry-After wait, then move on
                        retry_after = exc.response.headers.get("retry-after")
                        try:
                            wait_s = min(float(retry_after), 15.0) if retry_after else 5.0
                        except ValueError:
                            wait_s = 5.0
                        log.warning("%s rate-limited (429); retrying in %.0fs", provider, wait_s)
                        await asyncio.sleep(wait_s)
                        return await self._call_provider(provider, system, user, temperature, max_tokens)
                    else:
                        raise
            except Exception as exc:
                log.warning("%s failed (%s); falling back to next provider", provider, exc)
                last_exc = exc
                continue

        raise LLMError(
            f"All LLM providers failed. Last error: {last_exc}"
        ) from last_exc

    # ─── OpenAI ────────────────────────────────────────────────
    async def _openai(
        self, system: str, user: str, temperature: float, max_tokens: int
    ) -> Dict[str, Any]:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": settings.openai_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_object"},
        }
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(url, headers=headers, json=payload)
            r.raise_for_status()
            data = r.json()
        content = data["choices"][0]["message"]["content"]
        return _extract_json(content)

    # ─── Groq (OpenAI-compatible) ──────────────────────────────
    async def _groq(
        self, system: str, user: str, temperature: float, max_tokens: int
    ) -> Dict[str, Any]:
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.groq_api_key}",
            "Content-Type": "application/json",
        }
        # Coerce JSON output via prompt; many Groq-hosted models accept
        # response_format too, but the prompt nudge is the reliable path.
        payload: Dict[str, Any] = {
            "model": settings.groq_model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        system
                        + "\n\nRespond ONLY with a single valid JSON object. "
                        "No prose, no markdown, no code fences."
                    ),
                },
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
            "max_completion_tokens": max_tokens,
            "top_p": 1,
            "stream": False,
        }

        async with httpx.AsyncClient(timeout=90) as client:
            r = await client.post(url, headers=headers, json=payload)
            r.raise_for_status()
            data = r.json()
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise LLMError(f"Unexpected Groq response shape: {data}") from exc
        return _extract_json(content)

    # ─── OpenCode Zen (OpenAI-compatible) ──────────────────────
    async def _opencode(
        self, system: str, user: str, temperature: float, max_tokens: int
    ) -> Dict[str, Any]:
        url = "https://opencode.ai/zen/v1/responses"
        headers = {
            "Authorization": f"Bearer {settings.opencode_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": settings.opencode_model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        system
                        + "\n\nRespond ONLY with a single valid JSON object. "
                        "No prose, no markdown, no code fences."
                    ),
                },
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        async with httpx.AsyncClient(timeout=90) as client:
            r = await client.post(url, headers=headers, json=payload)
            r.raise_for_status()
            data = r.json()
        
        content = None
        if "choices" in data:
            content = data["choices"][0]["message"]["content"]
        elif "output" in data:
            if isinstance(data["output"], list) and len(data["output"]) > 0:
                if "message" in data["output"][0]:
                    content = data["output"][0]["message"]["content"]
                elif "content" in data["output"][0]:
                    content = data["output"][0]["content"]
            elif isinstance(data["output"], str):
                content = data["output"]
        
        if content is None:
            raise LLMError(f"Unexpected OpenCode response shape: {data}")
        return _extract_json(content)

    # ─── Gemini ────────────────────────────────────────────────
    async def _gemini(
        self, system: str, user: str, temperature: float, max_tokens: int
    ) -> Dict[str, Any]:
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.gemini_model}:generateContent?key={settings.gemini_api_key}"
        )
        payload = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
                "responseMimeType": "application/json",
            },
        }
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(url, json=payload)
            r.raise_for_status()
            data = r.json()
        try:
            content = data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError) as exc:
            raise LLMError(f"Unexpected Gemini response shape: {data}") from exc
        return _extract_json(content)

    # ─── Anthropic ─────────────────────────────────────────────
    async def _anthropic(
        self, system: str, user: str, temperature: float, max_tokens: int
    ) -> Dict[str, Any]:
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": settings.anthropic_api_key or "",
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        payload = {
            "model": settings.anthropic_model,
            "system": system + "\n\nReturn ONLY a single valid JSON object.",
            "messages": [{"role": "user", "content": user}],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(url, headers=headers, json=payload)
            r.raise_for_status()
            data = r.json()
        try:
            content = data["content"][0]["text"]
        except (KeyError, IndexError) as exc:
            raise LLMError(f"Unexpected Anthropic response shape: {data}") from exc
        return _extract_json(content)


llm = LLMClient()
