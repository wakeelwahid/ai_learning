import uuid

from qdrant_client import AsyncQdrantClient
from qdrant_client.http.exceptions import UnexpectedResponse
from qdrant_client.models import (
    Distance, FieldCondition, Filter, MatchValue, PointStruct, VectorParams,
)

from app.core.config import settings


class QdrantService:
    def __init__(self):
        self._client = AsyncQdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY or None,
        )
        self._default_collection = settings.QDRANT_COLLECTION_SYLLABUS

    async def ensure_collection(
        self,
        vector_size:     int = 1536,
        collection_name: str | None = None,
    ) -> None:
        name        = collection_name or self._default_collection
        collections = await self._client.get_collections()
        names       = [c.name for c in collections.collections]
        if name not in names:
            await self._client.create_collection(
                collection_name=name,
                vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
            )

    async def upsert_chunks(
        self,
        chunks:          list[dict],
        embeddings:      list[list[float]],
        collection_name: str | None = None,
    ) -> None:
        name   = collection_name or self._default_collection
        points = [
            PointStruct(id=str(uuid.uuid4()), vector=emb, payload=chunk)
            for chunk, emb in zip(chunks, embeddings)
        ]
        await self._client.upsert(collection_name=name, points=points)

    async def upsert_points(
        self,
        points:          list[tuple[str, list[float], dict]],
        collection_name: str | None = None,
    ) -> None:
        """Upsert (id, vector, payload) triples. Unlike upsert_chunks, the
        caller supplies the point id, so re-indexing the same source row
        updates it in place instead of appending a duplicate."""
        await self._client.upsert(
            collection_name=collection_name or self._default_collection,
            points=[PointStruct(id=pid, vector=vec, payload=payload)
                    for pid, vec, payload in points],
        )

    async def search(
        self,
        query_vector:    list[float],
        filters:         dict | None = None,
        limit:           int = 5,
        collection_name: str | None = None,
    ) -> list[dict]:
        name = collection_name or self._default_collection

        qdrant_filter = None
        if filters:
            conditions = [
                FieldCondition(key=k, match=MatchValue(value=v))
                for k, v in filters.items()
            ]
            qdrant_filter = Filter(must=conditions)

        try:
            results = await self._client.search(
                collection_name=name,
                query_vector=query_vector,
                query_filter=qdrant_filter,
                limit=limit,
                with_payload=True,
            )
        except UnexpectedResponse as exc:
            # A collection that hasn't been created yet (nothing ingested
            # for this subject/board yet, or a fresh environment) is "no
            # results," not an error — the caller (RAGService) already has
            # a graceful "I don't have information about this topic" path
            # for an empty result list; it just never reached it because
            # this raised first. Only swallow 404 (collection missing) —
            # any other failure (auth, bad request) should still surface.
            if exc.status_code == 404:
                return []
            raise
        return [{"score": r.score, "payload": r.payload} for r in results]
