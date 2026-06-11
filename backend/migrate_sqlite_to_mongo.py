"""One-time migration: copy users and track_items from trackify.sqlite3 to MongoDB Atlas.

Usage:  python migrate_sqlite_to_mongo.py
Requires MONGODB_URI set in backend/.env.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from app.db import ensure_indexes, get_db  # noqa: E402

SQLITE_PATH = Path(__file__).resolve().parents[1] / "trackify.sqlite3"


def main() -> None:
    if not SQLITE_PATH.exists():
        print(f"No SQLite file at {SQLITE_PATH} — nothing to migrate.")
        return

    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    db = get_db()
    ensure_indexes()

    # Users
    max_user_id = 0
    users = conn.execute("SELECT * FROM users").fetchall()
    for row in users:
        doc = dict(row)
        max_user_id = max(max_user_id, int(doc["id"]))
        db["users"].update_one({"id": int(doc["id"])}, {"$set": doc}, upsert=True)
    print(f"Migrated {len(users)} users")

    # Track items
    max_item_id = 0
    items = conn.execute("SELECT * FROM track_items").fetchall()
    for row in items:
        doc = dict(row)
        max_item_id = max(max_item_id, int(doc["id"]))
        doc["notified"] = bool(doc.get("notified"))
        try:
            doc["price_history"] = json.loads(doc.get("price_history") or "[]")
        except Exception:
            doc["price_history"] = []
        db["track_items"].update_one({"id": int(doc["id"])}, {"$set": doc}, upsert=True)
    print(f"Migrated {len(items)} track items")

    # Bump counters past existing IDs so new inserts don't collide
    db["counters"].update_one(
        {"_id": "users"}, {"$max": {"value": max_user_id}}, upsert=True
    )
    db["counters"].update_one(
        {"_id": "track_items"}, {"$max": {"value": max_item_id}}, upsert=True
    )
    print(f"Counters set: users={max_user_id}, track_items={max_item_id}")
    print("Done.")


if __name__ == "__main__":
    main()
