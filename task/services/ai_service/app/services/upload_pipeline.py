"""
Self-contained, automatic upload processing — runs in-process via FastAPI
BackgroundTasks (no MinIO, no external worker required).

Pipeline:  extract (PDF/PPTX/DOCX/TXT) → chunk → embed → Qdrant upsert (with
board/class/subject/chapter metadata) → auto-generate MCQs → auto-verify →
save verified quiz → mark IngestionJob COMPLETED / FAILED.
"""
import logging
from datetime import datetime

from sqlalchemy import select

from app.database.session import AsyncSessionLocal
from app.models.generated_paper import GeneratedPaper
from app.models.ingestion_job import IngestionJob
from app.services import generation_service, llm_service, question_cache
from app.services.document_processor import chunk_text, extract_pages
from app.services.embedding_service import EmbeddingService
from app.services.qdrant_service import QdrantService

logger = logging.getLogger(__name__)


def _now():
    # ingestion_jobs timestamps are TIMESTAMP WITHOUT TIME ZONE → use naive UTC
    return datetime.utcnow()


async def _mark(job_id: str, **fields):
    async with AsyncSessionLocal() as s:
        job = (await s.execute(select(IngestionJob).where(IngestionJob.id == job_id))).scalar_one_or_none()
        if not job:
            return None
        for k, v in fields.items():
            setattr(job, k, v)
        await s.commit()
        return {
            "board": job.board, "class_num": job.class_num, "subject": job.subject,
            "chapter": job.chapter, "topic": job.topic, "content_type": job.content_type,
            "document_type": job.document_type, "collection": job.collection,
            "file_name": job.file_name, "id": str(job.id),
        }


async def process_upload(job_id: str, data: bytes, filename: str) -> None:
    job = await _mark(job_id, status="PROCESSING", started_at=_now(), worker_id="server-inline")
    if not job:
        return
    meta = {
        "board": job["board"], "class_num": job["class_num"], "subject": job["subject"],
        "chapter": job["chapter"], "topic": job["topic"],
    }
    collection = job["collection"] or "school_subjects"

    try:
        # Page-aware extraction → chunk each page, keeping the page/slide number
        pages = extract_pages(data, filename)
        seg: list[tuple[str, int | None]] = []
        for ptext, pnum in pages:
            for c in chunk_text(ptext):
                seg.append((c, pnum))
        if not seg:
            raise ValueError("No extractable text found in the document.")
        chunks = [c for c, _ in seg]

        # ── Embed + upsert to Qdrant (full syllabus metadata, filterable) ──
        embedder = EmbeddingService()
        embeddings = await embedder.embed_batch(chunks)
        qdrant = QdrantService()
        await qdrant.ensure_collection(len(embeddings[0]), collection)
        # Payload keys/values MUST match the study-mode search filters:
        #   board(lower), class(int), subject(lower), chapter(lower)
        _board   = (job["board"] or "").lower() or None
        _subject = (job["subject"] or "").lower() or None
        _chapter = (job["chapter"] or "").lower() or None
        _topic   = (job["topic"] or "").lower() or None
        payloads = [{
            "text": c,
            "board": _board,
            "class": job["class_num"],
            "class_num": job["class_num"],
            "subject": _subject,
            "chapter": _chapter,
            "chapter_title": job["chapter"],
            "topic": _topic,
            "content_type": job["content_type"],
            "document_type": job.get("document_type"),
            "document_name": job["file_name"],
            "page": page,
            "job_id": job["id"],
            "title": job["file_name"],
        } for (c, page) in seg]
        await qdrant.upsert_chunks(payloads, embeddings, collection)

        # ── Auto-generate + auto-verify a quiz from the new material ──
        note = ""
        try:
            context = "\n\n".join(chunks[:6])
            raw, provider = await generation_service.generate_mcqs(context, meta, count=8, difficulty="medium")
            verified, report = generation_service.verify_mcqs(raw, context)
            if verified:
                async with AsyncSessionLocal() as s:
                    s.add(GeneratedPaper(
                        paper_type="quiz_paper",
                        board=job["board"], class_num=job["class_num"], subject=job["subject"],
                        chapter=job["chapter"], topic=job["topic"],
                        title=f"Auto Quiz — {job['chapter'] or job['subject'] or job['file_name']}",
                        difficulty="medium",
                        total_marks=len(verified),
                        duration_min=max(10, len(verified) * 2),
                        content={
                            "sections": [{
                                "section_name": "Multiple Choice Questions",
                                "marks_per_question": 1,
                                "questions": [{"q_no": i + 1, **v} for i, v in enumerate(verified)],
                            }],
                            "verification": report,
                        },
                        generated_by=provider,
                        source_job_id=job["id"],
                        verified=True,
                        status="PUBLISHED",
                    ))
                    await s.commit()
                # question_cache.warm()'s real signature is (feature, board,
                # class_num, subject, chapter, questions) — this call was
                # missing the leading `feature` arg (a TypeError caught by
                # the broad except below and reported as a generic
                # "Generation error" despite the paper above already having
                # committed successfully as PUBLISHED). Same bug independently
                # found and fixed in tasks/generation.py's Celery path.
                await question_cache.warm("questions", job["board"], job["class_num"], job["subject"], job["chapter"], verified)
                note = f" Auto-generated {report['verified']}/{report['generated']} verified questions ({provider})."
            else:
                note = " No verifiable questions could be generated from this document."
        except llm_service.NoLLMAvailable:
            note = " (RAG ingest done. Question generation skipped — no LLM configured: set GROQ/OPENAI/ANTHROPIC key or run local Ollama.)"
        except Exception as e:  # noqa
            note = f" (Generation error: {str(e)[:140]})"

        await _mark(
            job_id, status="COMPLETED", chunks_indexed=len(chunks), completed_at=_now(),
            error_message=(f"Indexed {len(chunks)} chunks via {embedder.provider}." + note)[:500],
        )
        logger.info("Upload processed: job=%s chunks=%d", job_id, len(chunks))
    except Exception as e:  # noqa
        logger.exception("Upload processing failed for job=%s", job_id)
        await _mark(job_id, status="FAILED", completed_at=_now(), error_message=str(e)[:500])
