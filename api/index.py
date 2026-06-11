"""Vercel serverless entrypoint.

Vercel auto-detects a FastAPI ``app`` instance at supported entrypoints
(this file is one of them). We re-export the existing FastAPI app from
``backend/app/main.py`` so we don't fork the code.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Make `backend/` importable so `app.main` resolves as a package.
_ROOT = Path(__file__).resolve().parent.parent
_BACKEND = _ROOT / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.main import app  # noqa: E402,F401  (re-exported for Vercel)
