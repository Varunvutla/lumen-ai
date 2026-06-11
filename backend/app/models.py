"""Pydantic schemas for request and response payloads."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class RecommendRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=500)
    top_k: int = Field(6, ge=1, le=12)
    max_price: Optional[float] = Field(None, ge=0)
    region: Optional[str] = Field(None, description="Optional region hint, e.g. 'US', 'IN'")


class Intent(BaseModel):
    product_type: Optional[str] = None
    budget_max: Optional[float] = None
    budget_currency: Optional[str] = None
    use_case: Optional[str] = None
    must_have: List[str] = Field(default_factory=list)
    nice_to_have: List[str] = Field(default_factory=list)
    avoid: List[str] = Field(default_factory=list)
    search_queries: List[str] = Field(default_factory=list)


class Recommendation(BaseModel):
    title: str
    url: str
    source: str
    snippet: str = ""
    price: Optional[str] = None
    image: Optional[str] = None
    score: float = 0.0
    reason: str = ""


class Providers(BaseModel):
    llm: Optional[str] = None
    llm_model: Optional[str] = None
    search: Optional[str] = None


class RecommendResponse(BaseModel):
    query: str
    intent: Intent
    summary: str
    results: List[Recommendation]
    providers: Providers


class HealthResponse(BaseModel):
    status: str
    llm_provider: Optional[str]
    llm_model: Optional[str]
    search_provider: Optional[str]
    firecrawl_enabled: bool



# ─── Comparison ───────────────────────────────────────────────


class CompareItem(BaseModel):
    title: str
    url: str
    source: str = ""
    snippet: str = ""
    price: Optional[str] = None
    image: Optional[str] = None
    reason: Optional[str] = None


class CompareRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=500)
    items: List[CompareItem] = Field(..., min_length=2, max_length=6)
    deep: bool = Field(False, description="Use Firecrawl to scrape product pages.")


class SpecCell(BaseModel):
    value: str = ""
    note: Optional[str] = None
    is_winner: bool = False


class SpecRow(BaseModel):
    attribute: str
    cells: List[SpecCell]
    higher_is_better: Optional[bool] = None


class ItemAnalysis(BaseModel):
    title: str
    url: str
    pros: List[str] = Field(default_factory=list)
    cons: List[str] = Field(default_factory=list)
    award: Optional[str] = None  # e.g. "Best Overall", "Best Value"


class Verdict(BaseModel):
    winner_index: int
    headline: str
    explanation: str


class CompareResponse(BaseModel):
    query: str
    matrix: List[SpecRow]
    analyses: List[ItemAnalysis]
    verdict: Verdict
    grounded: bool  # whether Firecrawl was actually used
    providers: Providers
