"""Environment-driven configuration.

Picks the first available LLM and search provider so the app works
with whatever keys the user has supplied.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

from dotenv import load_dotenv

load_dotenv()


def _env(key: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(key, default)
    if value is None:
        return None
    value = value.strip()
    return value or None


@dataclass(frozen=True)
class Settings:
    # LLM
    groq_api_key: Optional[str]
    groq_model: str
    opencode_api_key: Optional[str]
    opencode_model: str
    openai_api_key: Optional[str]
    openai_model: str
    gemini_api_key: Optional[str]
    gemini_model: str
    anthropic_api_key: Optional[str]
    anthropic_model: str

    # Search
    tavily_api_key: Optional[str]
    serpapi_api_key: Optional[str]

    # Optional enrichment
    firecrawl_api_key: Optional[str]

    # App
    allowed_origins: list[str]

    @property
    def llm_provider(self) -> Optional[str]:
        # Order = preference when multiple keys are present.
        if self.groq_api_key:
            return "groq"
        if self.opencode_api_key:
            return "opencode"
        if self.openai_api_key:
            return "openai"
        if self.gemini_api_key:
            return "gemini"
        if self.anthropic_api_key:
            return "anthropic"
        return None

    @property
    def llm_model(self) -> Optional[str]:
        provider = self.llm_provider
        if provider == "groq":
            return self.groq_model
        if provider == "opencode":
            return self.opencode_model
        if provider == "openai":
            return self.openai_model
        if provider == "gemini":
            return self.gemini_model
        if provider == "anthropic":
            return self.anthropic_model
        return None

    @property
    def search_provider(self) -> Optional[str]:
        if self.tavily_api_key:
            return "tavily"
        if self.serpapi_api_key:
            return "serpapi"
        return None


def load_settings() -> Settings:
    origins_raw = _env("ALLOWED_ORIGINS", "http://localhost:5173") or ""
    origins = [o.strip() for o in origins_raw.split(",") if o.strip()]
    return Settings(
        groq_api_key=_env("GROQ_API_KEY"),
        groq_model=_env("GROQ_MODEL", "llama-3.3-70b-versatile") or "llama-3.3-70b-versatile",
        opencode_api_key=_env("OPENCODE_API_KEY"),
        opencode_model=(_env("OPENCODE_MODEL", "big-pickle") or "big-pickle").strip().lower().replace(" ", "-"),
        openai_api_key=_env("OPENAI_API_KEY"),
        openai_model=_env("OPENAI_MODEL", "gpt-4o-mini") or "gpt-4o-mini",
        gemini_api_key=_env("GEMINI_API_KEY"),
        gemini_model=_env("GEMINI_MODEL", "gemini-2.0-flash") or "gemini-2.0-flash",
        anthropic_api_key=_env("ANTHROPIC_API_KEY"),
        anthropic_model=_env("ANTHROPIC_MODEL", "claude-3-5-haiku-latest")
        or "claude-3-5-haiku-latest",
        tavily_api_key=_env("TAVILY_API_KEY"),
        serpapi_api_key=_env("SERPAPI_API_KEY"),
        firecrawl_api_key=_env("FIRECRAWL_API_KEY"),
        allowed_origins=origins,
    )


settings = load_settings()
