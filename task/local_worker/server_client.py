"""
HTTP client for the live server API.

Used by local worker to:
- Poll pending jobs
- Report job status (start / complete / fail)
- Push embedded chunks to Qdrant (via server endpoint)
- Dump generated papers to the live server DB
"""
import logging
from typing import Any

import httpx

from config import API_BASE, API_TOKEN, WORKER_ID

logger = logging.getLogger(__name__)

_HEADERS = {"Authorization": f"Bearer {API_TOKEN}"} if API_TOKEN else {}


async def _get(path: str, params: dict | None = None) -> Any:
    url = f"{API_BASE}{path}"
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(url, params=params, headers=_HEADERS)
        r.raise_for_status()
        return r.json()


async def _post(path: str, json: Any = None, timeout: float = 60) -> Any:
    url = f"{API_BASE}{path}"
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(url, json=json, headers=_HEADERS)
        r.raise_for_status()
        return r.json()


# ── Job management ────────────────────────────────────────────────────────────

async def fetch_pending_jobs(limit: int = 3) -> list[dict]:
    data = await _get("/jobs/pending", params={"limit": limit})
    return data.get("jobs", [])


async def mark_job_started(job_id: str) -> None:
    await _post(f"/jobs/{job_id}/start", {"worker_id": WORKER_ID})
    logger.info("Job %s → PROCESSING", job_id)


async def mark_job_complete(job_id: str, chunks_indexed: int) -> None:
    await _post(f"/jobs/{job_id}/complete", {"chunks_indexed": chunks_indexed})
    logger.info("Job %s → COMPLETED (%d chunks)", job_id, chunks_indexed)


async def mark_job_failed(job_id: str, error: str) -> None:
    await _post(f"/jobs/{job_id}/fail", {"error_message": error})
    logger.warning("Job %s → FAILED: %s", job_id, error)


# ── Qdrant upsert via server ──────────────────────────────────────────────────

async def push_chunks_to_qdrant(
    chunks: list[dict],  # each dict has text + metadata + embedding list
    collection: str = "school_subjects",
) -> int:
    """
    Send pre-computed embeddings to the live server's batch-upsert endpoint.
    Server forwards them to Qdrant without re-embedding.
    """
    payload = {
        "collection": collection,
        "chunks":     chunks,   # [{text, board, class_num, subject, chapter, topic, job_id, embedding: [...]}]
    }
    result = await _post("/qdrant/batch-upsert", payload, timeout=120)
    return result.get("upserted", 0)


# ── Generated papers dump ─────────────────────────────────────────────────────

async def dump_papers(papers: list[dict]) -> int:
    """Batch-dump all locally generated papers to live server DB."""
    result = await _post("/papers/bulk", {"papers": papers}, timeout=60)
    return result.get("created", 0)
