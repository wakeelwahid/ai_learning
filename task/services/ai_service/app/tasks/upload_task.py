"""
Celery task: process an uploaded document (extract → chunk → embed → Qdrant →
auto-generate quiz → verify) in the background. Updates IngestionJob.status in DB.

The upload endpoint base64-encodes the file bytes and enqueues this task, so the
HTTP request returns immediately and all heavy work runs on the ai_worker queue.
"""
import asyncio
import base64
import logging

from app.celery_app import celery_app
from app.services.upload_pipeline import process_upload

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name="app.tasks.upload_task.process_upload_task",
    max_retries=1,
    default_retry_delay=30,
    soft_time_limit=90,     # Phase 7: warn at 90s for large uploads
    time_limit=120,         # hard kill at 2 min
)
def process_upload_task(self, job_id: str, data_b64: str, filename: str):
    data = base64.b64decode(data_b64)
    asyncio.run(process_upload(job_id, data, filename))
