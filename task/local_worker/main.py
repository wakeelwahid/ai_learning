"""
Local Ollama Worker — main polling loop.

Usage:
    python main.py

Environment:
    See config.py for all env vars.
"""
import asyncio
import logging
import os
import sys
import tempfile
from pathlib import Path

import httpx

from chunker       import chunk_text
from config        import (
    CHUNK_OVERLAP,
    CHUNK_SIZE_TOKENS,
    GENERATE_PAPERS,
    MAX_JOBS_PER_POLL,
    PAPER_DIFFICULTIES,
    POLL_INTERVAL_SEC,
    QDRANT_STRATEGY,
)
from embedder      import embed_batch
from file_parser   import parse_bytes
from paper_generator import generate_all_papers
from qdrant_uploader import ensure_collection, upsert_chunks
from server_client import (
    dump_papers,
    fetch_pending_jobs,
    mark_job_complete,
    mark_job_failed,
    mark_job_started,
    push_chunks_to_qdrant,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("worker.main")


# ── File download ──────────────────────────────────────────────────────────────

async def download_file(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.content


# ── Single job processor ───────────────────────────────────────────────────────

async def process_job(job: dict) -> None:
    job_id   = job["id"]
    filename = job["file_name"]
    file_url = job["file_url"]
    meta     = {
        "board":     job.get("board",     "CBSE"),
        "class_num": job.get("class_num", 10),
        "subject":   job.get("subject",   "General"),
        "chapter":   job.get("chapter",   ""),
        "topic":     job.get("topic"),
    }

    logger.info("Processing job %s — %s", job_id, filename)

    try:
        await mark_job_started(job_id)
    except Exception as exc:
        logger.warning("Could not mark job started: %s", exc)

    try:
        # 1. Download
        logger.info("  Downloading %s", file_url)
        data = await download_file(file_url)

        # 2. Parse
        parsed = parse_bytes(data, filename)
        if not parsed:
            raise ValueError(f"No text extracted from {filename}")
        full_text = "\n\n".join(text for _, text in parsed)
        logger.info("  Extracted %d chars from %d file(s)", len(full_text), len(parsed))

        # 3. Chunk
        chunks_text = chunk_text(full_text, CHUNK_SIZE_TOKENS, CHUNK_OVERLAP)
        logger.info("  %d chunks", len(chunks_text))

        # 4. Embed
        embeddings = await embed_batch(chunks_text)

        # Detect vector size for Qdrant collection
        vec_size = len(embeddings[0]) if embeddings else 1024

        # 5. Push to Qdrant
        chunk_dicts = [
            {
                "text":      text,
                "embedding": vec,
                "board":     meta["board"],
                "class_num": meta["class_num"],
                "subject":   meta["subject"],
                "chapter":   meta["chapter"],
                "topic":     meta.get("topic"),
                "job_id":    job_id,
            }
            for text, vec in zip(chunks_text, embeddings)
        ]

        if QDRANT_STRATEGY == "direct":
            await ensure_collection(vec_size)
            indexed = await upsert_chunks(chunk_dicts)
        else:
            indexed = await push_chunks_to_qdrant(chunk_dicts)

        logger.info("  Indexed %d chunks to Qdrant", indexed)
        await mark_job_complete(job_id, indexed)

        # 6. Generate papers (optional)
        if GENERATE_PAPERS:
            context = full_text[:6000]
            papers  = await generate_all_papers(
                meta,
                context,
                difficulties=PAPER_DIFFICULTIES,
                make_revision=True,
            )
            if papers:
                # Attach source_job_id
                for p in papers:
                    p["source_job_id"] = job_id

                dumped = await dump_papers(papers)
                logger.info("  Dumped %d generated papers to live server", dumped)

    except Exception as exc:
        logger.error("Job %s failed: %s", job_id, exc, exc_info=True)
        try:
            await mark_job_failed(job_id, str(exc))
        except Exception:
            pass


# ── Poll loop ──────────────────────────────────────────────────────────────────

async def poll_once() -> None:
    try:
        jobs = await fetch_pending_jobs(limit=MAX_JOBS_PER_POLL)
    except Exception as exc:
        logger.warning("Could not reach live server: %s", exc)
        return

    if not jobs:
        logger.debug("No pending jobs")
        return

    logger.info("Fetched %d pending job(s)", len(jobs))
    # Process concurrently (up to MAX_JOBS_PER_POLL)
    await asyncio.gather(*[process_job(j) for j in jobs], return_exceptions=True)


async def run() -> None:
    logger.info("=== Local Ollama Worker started (poll every %ds) ===", POLL_INTERVAL_SEC)
    while True:
        await poll_once()
        await asyncio.sleep(POLL_INTERVAL_SEC)


if __name__ == "__main__":
    asyncio.run(run())
