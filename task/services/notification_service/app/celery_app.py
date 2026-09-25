"""
Celery application for the notification service.

All outbound messages (email, WhatsApp, push) are dispatched as background
tasks so the API returns immediately and delivery is handled asynchronously
with automatic retries.
"""
from celery import Celery
from kombu import Queue

from app.core.config import settings

# Use REDIS_URL as result backend (strip +asyncio driver prefix if present)
redis_url = settings.REDIS_URL.replace("redis://", "redis://").split("?")[0]

celery_app = Celery(
    "notification_worker",
    broker=settings.RABBITMQ_URL,
    backend=redis_url,
    include=["app.tasks.notifications"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Kolkata",
    enable_utc=True,
    task_acks_late=True,                # Ack only after task completes (safe retries)
    task_reject_on_worker_lost=True,    # Re-queue on unexpected worker death
    worker_prefetch_multiplier=1,       # One task at a time per worker (fair dispatch)
    task_routes={
        "app.tasks.notifications.send_email_task":     {"queue": "notifications.email"},
        "app.tasks.notifications.send_push_task":      {"queue": "notifications.push"},
        "app.tasks.notifications.send_whatsapp_task":  {"queue": "notifications.whatsapp"},
        "app.tasks.notifications.broadcast_task":      {"queue": "notifications.email"},
    },
    task_default_queue="notifications.email",
    task_queues=[
        Queue("notifications.email"),
        Queue("notifications.push"),
        Queue("notifications.whatsapp"),
    ],
)
