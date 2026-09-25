"""
Embedding service with graceful no-key fallback.

Priority:
  1. OpenAI  (if OPENAI_API_KEY is set)            → 1536-dim
  2. sentence-transformers local model (no key)    → 384-dim (all-MiniLM-L6-v2)

The SAME provider is used for both ingestion and query, so Qdrant vector
dimensions always match. `dim` reports the active provider's size.
"""
import asyncio
import hashlib

from app.core.config import settings


class EmbeddingService:
    _st_model = None  # process-wide cached sentence-transformers model

    def __init__(self):
        self._use_openai = bool(settings.OPENAI_API_KEY)
        self._client = None
        if self._use_openai:
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    # ── local model loader (lazy) ───────────────────────────────────────────────
    @classmethod
    def _get_st(cls):
        if cls._st_model is None:
            from sentence_transformers import SentenceTransformer
            cls._st_model = SentenceTransformer(settings.LOCAL_EMBED_MODEL)
        return cls._st_model

    @property
    def provider(self) -> str:
        return "openai" if self._use_openai else "sentence-transformers"

    @property
    def dim(self) -> int:
        return 1536 if self._use_openai else 384

    async def embed(self, text: str) -> list[float]:
        return (await self.embed_batch([text]))[0]

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        cleaned = [(t or "").strip() or " " for t in texts]
        if self._use_openai:
            try:
                resp = await self._client.embeddings.create(
                    input=cleaned, model=settings.EMBEDDING_MODEL,
                )
                return [item.embedding for item in resp.data]
            except Exception:
                # A configured-but-broken key (expired, revoked, rate-limited,
                # or — as found live — a leftover placeholder value that's
                # non-empty but not real) must degrade to the local model
                # rather than crash the whole RAG pipeline. NOTE: this
                # silently changes the embedding dimension (1536 → 384) for
                # this call — the `dim` property still reports the
                # configured provider's size, so a persistent OpenAI outage
                # would produce dimension-mismatched vectors against an
                # OpenAI-dimensioned Qdrant collection. Acceptable as a
                # last-resort fallback, not a substitute for fixing the key.
                pass
        # Local sentence-transformers — run the blocking encode off the event loop
        model = self._get_st()
        vecs = await asyncio.to_thread(
            lambda: model.encode(cleaned, normalize_embeddings=True, convert_to_numpy=True)
        )
        return [v.tolist() for v in vecs]

    @staticmethod
    def query_hash(text: str) -> str:
        return hashlib.sha256(text.strip().lower().encode()).hexdigest()
