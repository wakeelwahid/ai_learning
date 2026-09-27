"""
Direct Qdrant uploader — used when QDRANT_STRATEGY="direct".

Pushes pre-embedded chunks directly to Qdrant REST API,
bypassing the live server endpoint.

Qdrant PUT /collections/{name}/points
"""
import logging
import uuid
from typing import Any

import httpx

from config import QDRANT_API_KEY, QDRANT_COLLECTION, QDRANT_URL

logger = logging.getLogger(__name__)

_HEADERS: dict[str, str] = {}
if QDRANT_API_KEY:
    _HEADERS["api-key"] = QDRANT_API_KEY


async def ensure_collection(
    vector_size: int,
    collection: str = QDRANT_COLLECTION,
) -> None:
    """Create the Qdrant collection if it doesn't already exist."""
    url = f"{QDRANT_URL}/collections/{collection}"
    async with httpx.AsyncClient(timeout=30, headers=_HEADERS) as client:
        r = await client.get(url)
        if r.status_code == 200:
            return
        # Create
        body: dict[str, Any] = {
            "vectors": {"size": vector_size, "distance": "Cosine"},
        }
        r2 = await client.put(url, json=body)
        r2.raise_for_status()
        logger.info("Created Qdrant collection %s (dim=%d)", collection, vector_size)


async def upsert_chunks(
    chunks: list[dict],  # each has: text, embedding, board, class_num, subject, chapter, topic, job_id
    collection: str = QDRANT_COLLECTION,
) -> int:
    """Upsert a list of embedded chunks directly to Qdrant."""
    if not chunks:
        return 0

    points = [
        {
            "id":      str(uuid.uuid4()),
            "vector":  c["embedding"],
            "payload": {
                "text":      c["text"],
                "board":     c.get("board"),
                "class_num": c.get("class_num"),
                "subject":   c.get("subject"),
                "chapter":   c.get("chapter"),
                "topic":     c.get("topic"),
                "job_id":    c.get("job_id"),
            },
        }
        for c in chunks
    ]

    url = f"{QDRANT_URL}/collections/{collection}/points"
    async with httpx.AsyncClient(timeout=120, headers=_HEADERS) as client:
        r = await client.put(url, json={"points": points})
        r.raise_for_status()

    logger.info("Upserted %d points to Qdrant collection %s", len(points), collection)
    return len(points)
