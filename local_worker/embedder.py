"""
Ollama embedder — calls the local Ollama API to generate embeddings.

POST http://localhost:11434/api/embeddings
{ "model": "mxbai-embed-large", "prompt": "text here" }
→ { "embedding": [0.123, ...] }
"""
import logging
from typing import Any

import httpx

from config import EMBEDDING_MODEL, OLLAMA_URL

logger = logging.getLogger(__name__)

_EMBED_URL = f"{OLLAMA_URL}/api/embeddings"


async def embed_text(text: str) -> list[float]:
    """Return embedding vector for a single text string."""
    payload = {"model": EMBEDDING_MODEL, "prompt": text}
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(_EMBED_URL, json=payload)
        r.raise_for_status()
        data: dict[str, Any] = r.json()
    return data["embedding"]


async def embed_batch(texts: list[str], batch_size: int = 16) -> list[list[float]]:
    """Embed a list of texts, returning one vector per text."""
    results: list[list[float]] = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        for text in batch:
            vec = await embed_text(text)
            results.append(vec)
        logger.debug("Embedded %d/%d", min(i + batch_size, len(texts)), len(texts))
    return results
