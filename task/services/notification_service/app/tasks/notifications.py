"""
Celery tasks for outbound notifications.

All tasks run in worker processes (separate from the FastAPI server) so they
never block request handling.  Each task:
  1. Attempts delivery
  2. Updates the notification record in PostgreSQL
  3. Retries up to 3 times on failure (exponential backoff)
"""
import asyncio
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import asyncpg
import aiosmtplib

from app.celery_app import celery_app
from app.core.config import settings

logger = logging.getLogger(__name__)

# Strip SQLAlchemy driver prefix for asyncpg
DB_URL = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")


# ── Helpers ───────────────────────────────────────────────────────────────────

async def update_status(notification_id: str, status: str) -> None:
    conn = await asyncpg.connect(DB_URL)
    try:
        await conn.execute(
            "UPDATE notifications SET status=$1 WHERE id=$2::uuid",
            status,
            notification_id,
        )
    finally:
        await conn.close()


async def do_send_email(to_email: str, subject: str, html_body: str, text_body: str = "") -> bool:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.EMAIL_FROM_NAME} <{settings.SMTP_USER}>"
    msg["To"] = to_email
    if text_body:
        msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
        start_tls=True,
    )
    return True


# ── Email task ────────────────────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    name="app.tasks.notifications.send_email_task",
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
)
def send_email_task(
    self,
    notification_id: str,
    to_email: str,
    subject: str,
    html_body: str,
    text_body: str = "",
):
    """Send an email and update notification status."""
    async def _run():
        try:
            await do_send_email(to_email, subject, html_body, text_body)
            await update_status(notification_id, "SENT")
            logger.info("Email sent to %s (notification %s)", to_email, notification_id)
        except Exception as exc:
            await update_status(notification_id, "FAILED")
            logger.error("Email failed for %s: %s", to_email, exc)
            raise exc

    asyncio.run(_run())


# ── Broadcast task ────────────────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    name="app.tasks.notifications.broadcast_task",
    max_retries=2,
    default_retry_delay=120,
)
def broadcast_task(
    self,
    subject: str,
    html_body: str,
    to_emails: list[str],
    notification_ids: list[str] | None = None,
):
    """Send the same email to a list of recipients."""
    async def _run():
        for i, email in enumerate(to_emails):
            try:
                await do_send_email(email, subject, html_body)
                if notification_ids and i < len(notification_ids):
                    await update_status(notification_ids[i], "SENT")
            except Exception as exc:
                logger.warning("Broadcast failed for %s: %s", email, exc)

    asyncio.run(_run())


# ── Push notification task ─────────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    name="app.tasks.notifications.send_push_task",
    max_retries=3,
    default_retry_delay=30,
)
def send_push_task(
    self,
    notification_id: str,
    device_token: str,
    title: str,
    body: str,
    data: dict | None = None,
):
    """Send a Firebase Cloud Messaging push notification via firebase-admin SDK."""
    async def _run():
        try:
            if not settings.FIREBASE_CREDENTIALS_PATH:
                logger.warning("FIREBASE_CREDENTIALS_PATH not configured — push skipped")
                await update_status(notification_id, "FAILED")
                return

            import firebase_admin
            from firebase_admin import credentials, messaging

            # Initialise once per worker process (idempotent)
            if not firebase_admin._apps:
                cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
                firebase_admin.initialize_app(cred)

            message = messaging.Message(
                notification=messaging.Notification(title=title, body=body),
                data={str(k): str(v) for k, v in (data or {}).items()},
                token=device_token,
            )
            messaging.send(message)
            await update_status(notification_id, "SENT")
        except Exception as exc:
            await update_status(notification_id, "FAILED")
            raise exc

    asyncio.run(_run())


# ── Plain SMS (synchronous — OTP delivery) ─────────────────────────────────────
# Unlike the other channels above, OTP SMS is sent SYNCHRONOUSLY (not via
# Celery) and does not create a persisted Notification row — the caller
# (auth_service) needs to know immediately whether delivery succeeded so it
# can surface a real error to the user instead of a false "OTP sent".

def send_sms_sync(phone: str, message: str) -> bool:
    """Send a plain SMS via Twilio. Returns True on success. Raises nothing —
    logs and returns False on any failure (missing config, Twilio error)."""
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
        logger.warning("Twilio SMS not configured (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER) — skipped")
        return False
    try:
        from twilio.rest import Client
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        client.messages.create(
            body=message,
            from_=settings.TWILIO_FROM_NUMBER,
            to=phone,
        )
        return True
    except Exception:
        logger.exception("SMS send failed for %s", phone)
        return False


# ── WhatsApp task ─────────────────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    name="app.tasks.notifications.send_whatsapp_task",
    max_retries=3,
    default_retry_delay=60,
)
def send_whatsapp_task(
    self,
    notification_id: str,
    phone: str,
    message: str,
):
    """Send WhatsApp message via Twilio/WhatsApp API."""
    async def _run():
        try:
            if not settings.WHATSAPP_API_KEY:
                logger.warning("WHATSAPP_API_KEY not configured — skipped")
                await update_status(notification_id, "FAILED")
                return

            # Twilio WhatsApp integration
            from twilio.rest import Client
            if not settings.TWILIO_ACCOUNT_SID:
                logger.warning("TWILIO_ACCOUNT_SID not configured — WhatsApp skipped")
                await update_status(notification_id, "FAILED")
                return
            client = Client(settings.TWILIO_ACCOUNT_SID, auth_token=settings.WHATSAPP_API_KEY)
            client.messages.create(
                body=message,
                from_=f"whatsapp:{settings.WHATSAPP_FROM_NUMBER}",
                to=f"whatsapp:{phone}",
            )
            await update_status(notification_id, "SENT")
        except Exception as exc:
            await update_status(notification_id, "FAILED")
            raise exc

    asyncio.run(_run())
