"""
Celery application for the AI service.

Phase 7 — Production queue architecture:
  ai.rag        — RAG pipeline calls (user-facing, highest priority)
  ai.questions  — Question generation
  ai.generation — Paper generation (can be slow, isolated from RAG)
  ai.embedding  — Embedding / indexing (bulk, can lag)
  ai.upload     — File upload processing (separate from AI workloads)

Each queue gets dedicated workers with appropriate concurrency.
All tasks have soft + hard time limits to prevent worker starvation.

Worker startup (one command per queue type):
  celery -A app.celery_app worker -Q ai.rag        -c 4  --loglevel=info
  celery -A app.celery_app worker -Q ai.generation -c 2  --loglevel=info
  celery -A app.celery_app worker -Q ai.embedding,ai.upload -c 4 --loglevel=info
"""
from celery import Celery
from celery.schedules import crontab
from kombu import Exchange, Queue

from app.core.config import settings

redis_url = settings.REDIS_URL.split("?")[0]

celery_app = Celery(
    "ai_worker",
    broker=settings.RABBITMQ_URL,
    backend=redis_url,
    include=[
        "app.tasks.indexing", "app.tasks.generation", "app.tasks.upload_task",
        "app.tasks.parent_index",
    ],
)

# ── Queue definitions ─────────────────────────────────────────────────────────
default_exchange = Exchange("ai", type="direct")

celery_app.conf.update(
    # Serialization
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],

    # Timezone
    timezone="Asia/Kolkata",
    enable_utc=True,

    # Reliability: ack only after completion, requeue if worker dies
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,   # one task at a time per worker slot

    # Phase 7: global time limits (per-task overrides in the task decorators)
    task_soft_time_limit=240,   # send SoftTimeLimitExceeded warning at 4 min
    task_time_limit=300,        # hard kill at 5 min — prevents zombie workers

    # Result backend — store results for 1 hour (paper status polling)
    result_expires=3600,

    # Phase 7: separate queue routing
    task_queues=[
        Queue("ai.rag",        default_exchange, routing_key="ai.rag"),
        Queue("ai.questions",  default_exchange, routing_key="ai.questions"),
        Queue("ai.generation", default_exchange, routing_key="ai.generation"),
        Queue("ai.embedding",  default_exchange, routing_key="ai.embedding"),
        Queue("ai.upload",     default_exchange, routing_key="ai.upload"),
        Queue("ai.indexing",   default_exchange, routing_key="ai.indexing"),  # legacy compat
    ],

    task_routes={
        # RAG calls — highest priority, own workers
        "app.tasks.rag.*":                                  {"queue": "ai.rag"},

        # Question generation
        "app.tasks.generation.generate_questions_task":     {"queue": "ai.questions"},

        # Paper generation — slow, isolated
        "app.tasks.generation.generate_paper_task":         {"queue": "ai.generation"},

        # Indexing / embeddings — bulk, can be delayed
        "app.tasks.indexing.index_content_task":            {"queue": "ai.embedding"},

        # Upload processing
        "app.tasks.upload_task.process_upload_task":        {"queue": "ai.upload"},

        # Nightly parent-RAG student index refresh
        "app.tasks.parent_index.refresh_parent_rag_index":  {"queue": "ai.embedding"},
    },

    # Parents ask about yesterday's work, so the student index is rebuilt
    # overnight rather than only when a chat happens to open. 03:00 IST —
    # after the day's activity has landed, before anyone is awake to ask.
    beat_schedule={
        "refresh-parent-rag-index": {
            "task": "app.tasks.parent_index.refresh_parent_rag_index",
            "schedule": crontab(hour=3, minute=0),
        },
    },

    task_default_queue="ai.embedding",

    # Dead-letter: failed tasks beyond max_retries go to ai.dlq for inspection
    task_default_delivery_mode="persistent",
)
