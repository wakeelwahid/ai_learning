"""Semantic reranker — improves Qdrant result quality via cross-encoder scoring."""
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


class RerankerService:
    def __init__(self) -> None:
        self._cohere = None
        if settings.COHERE_API_KEY:
            try:
                import cohere
                self._cohere = cohere.AsyncClient(settings.COHERE_API_KEY)
                logger.info("Reranker: Cohere API enabled")
            except ImportError:
                logger.warning("cohere package not installed; using keyword fallback")

    async def rerank(self, query: str, chunks: list[dict], top_n: int | None = None) -> list[dict]:
        if not chunks:
            return chunks
        top_n = top_n or len(chunks)
        if self._cohere:
            return await self._cohere_rerank(query, chunks, top_n)
        return self._keyword_rerank(query, chunks, top_n)

    async def _cohere_rerank(self, query: str, chunks: list[dict], top_n: int) -> list[dict]:
        try:
            docs = [c["payload"].get("text", "") for c in chunks]
            resp = await self._cohere.rerank(
                query=query,
                documents=docs,
                top_n=top_n,
                model="rerank-multilingual-v3.0",
            )
            result = []
            for r in resp.results:
                chunk = dict(chunks[r.index])
                chunk["rerank_score"] = r.relevance_score
                result.append(chunk)
            return result
        except Exception as exc:
            logger.warning("Cohere rerank failed (%s) — original order kept", exc)
            return chunks[:top_n]

    def _keyword_rerank(self, query: str, chunks: list[dict], top_n: int) -> list[dict]:
        terms = set(query.lower().split())
        scored = []
        for chunk in chunks:
            text = chunk["payload"].get("text", "").lower()
            overlap = sum(1 for t in terms if t in text) / max(len(terms), 1)
            scored.append({**chunk, "rerank_score": overlap})
        scored.sort(key=lambda x: x.get("rerank_score", 0), reverse=True)
        return scored[:top_n]
