# Lumen — AI Product Recommender

> *Tell us what you need in plain English. We search the live web, reason about your needs, and surface real products with real purchase links.*

A polished, full-stack AI assistant that takes natural-language product requests, uses an LLM to understand intent, searches the live web for real listings, and returns ranked recommendations with personalized reasoning and direct buy links.

---

## What makes it different

- **No static catalog.** Recommendations come from live web search, so results are current and grounded in real listings.
- **LLM-driven understanding.** A language model parses budget, use case, must-haves, and nice-to-haves from a single sentence.
- **Real purchase links.** Every result links straight to the source (Amazon, Best Buy, Flipkart, brand sites, etc.).
- **Personalized reasoning.** The LLM writes a summary plus a one-line reason for each pick, tailored to the user's request.
- **Compare drawer.** Pin any number of picks and review them side by side.
- **Refine.** Nudge the search with quick presets ("cheaper", "premium", "travel-friendly") or free-text instructions.
- **History.** Recent searches are saved locally for one-tap re-runs.
- **Provider-flexible.** Plug in Groq, OpenAI, Gemini, or Anthropic. Plug in Tavily (default) or SerpAPI for search. Add Firecrawl for richer scraping.

---

## Architecture

```
        ┌─────────────────┐
        │   React UI      │
        │ (Vite+Tailwind) │
        └────────┬────────┘
                 │ POST /api/recommend
                 ▼
        ┌─────────────────┐     1. parse intent
        │   FastAPI       │ ──────────────────► LLM (OpenAI / Gemini / Anthropic)
        │   pipeline      │
        │                 │     2. live search
        │                 │ ──────────────────► Tavily / SerpAPI / Exa
        │                 │
        │                 │     3. (optional) enrich
        │                 │ ──────────────────► Firecrawl
        │                 │
        │                 │     4. rank + reason
        │                 │ ──────────────────► LLM
        └─────────────────┘
```

---

## Project structure

```
.
├── backend/
│   ├── app/
│   │   ├── main.py          FastAPI app + CORS + routes
│   │   ├── config.py        env-driven settings
│   │   ├── models.py        Pydantic schemas
│   │   ├── llm.py           LLM client (OpenAI / Gemini / Anthropic)
│   │   ├── search.py        Web search client (Tavily / SerpAPI)
│   │   ├── scraper.py       Optional Firecrawl enrichment
│   │   └── pipeline.py      Orchestrates parse → search → rank
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js
│   │   ├── index.css
│   │   ├── main.jsx
│   │   └── components/
│   │       ├── Hero.jsx
│   │       ├── SearchBar.jsx
│   │       ├── ExampleChips.jsx
│   │       ├── LoadingState.jsx
│   │       ├── SummaryPanel.jsx
│   │       ├── ProductCard.jsx
│   │       └── ResultsGrid.jsx
│   ├── index.html
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── vite.config.js
│   └── package.json
└── README.md
```

---

## Quick start

### 1. Get API keys

You need **one LLM key** and **one search key**.

| Service       | Env var              | Free tier?         | Where                                    |
| ------------- | -------------------- | ------------------ | ---------------------------------------- |
| Groq          | `GROQ_API_KEY`       | yes, generous      | https://console.groq.com/keys            |
| OpenAI        | `OPENAI_API_KEY`     | trial credits      | https://platform.openai.com/api-keys     |
| Google Gemini | `GEMINI_API_KEY`     | yes, generous      | https://aistudio.google.com/app/apikey   |
| Anthropic     | `ANTHROPIC_API_KEY`  | trial credits      | https://console.anthropic.com            |
| Tavily        | `TAVILY_API_KEY`     | yes, 1000 req/mo   | https://app.tavily.com                   |
| SerpAPI       | `SERPAPI_API_KEY`    | yes, 100 req/mo    | https://serpapi.com                      |
| Firecrawl     | `FIRECRAWL_API_KEY`  | yes, 500 credits   | https://firecrawl.dev (optional)         |

Free combo for a working demo: **Groq + Tavily** (default model: `openai/gpt-oss-120b`).

### 2. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# edit .env and paste your keys
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

---

## API

`POST /api/recommend`

```json
{
  "query": "noise cancelling headphones under $250 for long flights",
  "top_k": 6,
  "max_price": 250
}
```

Response:

```json
{
  "query": "...",
  "intent": { "product_type": "...", "budget_max": 250, "use_case": "...", "must_have": [...] },
  "summary": "Based on your need for ...",
  "results": [
    {
      "title": "Sony WH-1000XM5",
      "url": "https://www.amazon.com/...",
      "source": "amazon.com",
      "snippet": "...",
      "price": "$248",
      "image": "https://...",
      "score": 0.94,
      "reason": "Top-tier ANC, 30h battery — ideal for a 14h flight."
    }
  ],
  "providers": { "llm": "gemini", "search": "tavily" }
}
```

Try it interactively at http://localhost:8000/docs.

---

## License

MIT

---

## Deploy

### Render (full stack, one click)

This repo includes a `render.yaml` blueprint. From the Render dashboard, choose
**New → Blueprint** and point it at this repo. Set `GROQ_API_KEY`, `TAVILY_API_KEY`,
and `ALLOWED_ORIGINS` (your deployed frontend URL) in the environment.

### Backend on Render / Fly / Railway, frontend on Vercel

1. Deploy the backend using `backend/Dockerfile` or with the build command
   `pip install -r requirements.txt` and start command
   `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
2. Update `frontend/vercel.json` — replace `YOUR-BACKEND.onrender.com` with the
   deployed backend host, then push the frontend to Vercel as a Vite project.
3. Set `ALLOWED_ORIGINS` on the backend to include the Vercel URL.
