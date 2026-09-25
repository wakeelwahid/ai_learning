from fastapi import APIRouter, Depends

from app.core.dependencies import require_admin
from app.schemas.ai import QdrantUpsertRequest, QdrantUpsertResponse
from app.services.qdrant_service import QdrantService

router = APIRouter(prefix="/ai", tags=["ai"])


# ── Qdrant Batch Upsert (worker sends pre-computed embeddings) ────────────────

@router.post("/qdrant/batch-upsert", response_model=QdrantUpsertResponse, dependencies=[Depends(require_admin)])
async def qdrant_batch_upsert(
    body: QdrantUpsertRequest,
):
    """
    Local worker sends text + pre-computed Ollama embeddings.
    Server upserts directly to Qdrant (no re-embedding needed).
    Collection: school_subjects  (board/class/subject/chapter metadata)
    """
    qdrant     = QdrantService()
    collection = body.collection

    # Build chunk dicts compatible with qdrant_service.upsert_chunks.
    # job_id is stringified — it becomes a Qdrant point payload value, and
    # uuid.UUID objects aren't JSON-serializable.
    chunks = [
        {
            "text":      c.text,
            "board":     c.board,
            "class":     c.class_num,
            "subject":   c.subject,
            "chapter":   c.chapter,
            "topic":     c.topic,
            "job_id":    str(c.job_id) if c.job_id else None,
        }
        for c in body.chunks
    ]
    embeddings = [c.embedding for c in body.chunks]

    vector_size = len(embeddings[0]) if embeddings else 1024
    await qdrant.ensure_collection(vector_size, collection_name=collection)
    await qdrant.upsert_chunks(chunks, embeddings, collection_name=collection)

    return QdrantUpsertResponse(upserted=len(chunks), collection=collection)
