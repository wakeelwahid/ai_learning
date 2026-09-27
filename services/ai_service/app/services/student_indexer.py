"""Index a student's fact cards into Qdrant so a parent can ask about them.

Cards are keyed by a deterministic point id derived from their source_id, so
re-indexing updates in place instead of duplicating. A Redis hash of each
card's text lets a re-index skip embedding for anything unchanged — the
common case, since most of a student's history is immutable.
"""
from __future__ import annotations

import hashlib
import json
import logging
import uuid

import redis.asyncio as aioredis

from app.core.config import settings
from app.services.embedding_service import EmbeddingService
from app.services.qdrant_service import QdrantService
from app.services.student_facts import FactCard, build_cards, fetch_all

logger = logging.getLogger(__name__)

# Namespace for deterministic point ids — must stay fixed or every re-index
# writes duplicates instead of updating.
_NS = uuid.UUID("1b4e28ba-2fa1-11d2-883f-b9a761bde3fb")


def _point_id(student_id: str, card: FactCard) -> str:
    return str(uuid.uuid5(_NS, f"{student_id}:{card.domain}:{card.source_id}"))


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def _payload(student_id: str, name: str, card: FactCard) -> dict:
    return {
        "student_id": student_id,
        "student_name": name,
        "domain": card.domain,
        "card_type": card.card_type,
        "text": card.text,
        "date": card.day,
        "period": card.period,
        "subject": card.subject,
        "metric": card.metric,
        "source_id": card.source_id,
    }


class StudentIndexer:
    def __init__(self, redis: aioredis.Redis):
        self._redis = redis
        self._embedder = EmbeddingService()
        self._qdrant = QdrantService()
        self._collection = settings.QDRANT_COLLECTION_STUDENT

    async def index_student(self, student_id: uuid.UUID, force: bool = False) -> dict:
        """Rebuild this student's cards. Returns per-domain counts."""
        sid = str(student_id)
        data = await fetch_all(student_id)
        name = (data.get("profile") or {}).get("full_name") or "The student"
        cards = build_cards(name, data)
        if not cards:
            return {"indexed": 0, "skipped": 0, "domains": {}}

        state_key = f"student_index:{sid}"
        known = {} if force else (await self._redis.hgetall(state_key) or {})

        changed = [c for c in cards if known.get(c.source_id) != _hash(c.text)]
        if changed:
            await self._qdrant.ensure_collection(self._embedder.dim, self._collection)
            vectors = await self._embedder.embed_batch([c.text for c in changed])
            await self._qdrant.upsert_points(
                collection_name=self._collection,
                points=[
                    (_point_id(sid, c), vec, _payload(sid, name, c))
                    for c, vec in zip(changed, vectors)
                ],
            )
            await self._redis.hset(
                state_key, mapping={c.source_id: _hash(c.text) for c in changed}
            )
            await self._redis.expire(state_key, 86400 * 30)

        await self._redis.setex(f"student_indexed_at:{sid}", settings.PARENT_RAG_REINDEX_SECONDS, "1")

        domains: dict[str, int] = {}
        for c in cards:
            domains[c.domain] = domains.get(c.domain, 0) + 1
        logger.info("Indexed student %s: %d changed of %d cards", sid, len(changed), len(cards))
        return {"indexed": len(changed), "skipped": len(cards) - len(changed), "domains": domains}

    async def is_fresh(self, student_id: uuid.UUID) -> bool:
        return bool(await self._redis.exists(f"student_indexed_at:{student_id}"))

    async def search(self, student_id: uuid.UUID, query: str, limit: int) -> list[dict]:
        """Retrieve this student's most relevant cards. The student_id filter
        is the access boundary — never widen it to search across students."""
        vector = await self._embedder.embed(query)
        return await self._qdrant.search(
            query_vector=vector,
            filters={"student_id": str(student_id)},
            limit=limit,
            collection_name=self._collection,
        )
