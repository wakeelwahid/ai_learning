"""
Publishes events to the quiz_events RabbitMQ exchange.

Routing keys published:
  quiz.cache_rebuild   — after a quiz or its questions are created/updated
  quiz.cache_invalidate — after a quiz is deleted
"""
import json
import logging

import aio_pika

from app.core.config import settings

logger = logging.getLogger(__name__)

EXCHANGE_NAME = "quiz_events"


async def publish_event(routing_key: str, payload: dict) -> None:
    """Fire-and-forget event publish. Logs a warning if RabbitMQ is unavailable."""
    try:
        connection = await aio_pika.connect_robust(settings.RABBITMQ_URL, timeout=3)
        async with connection:
            channel = await connection.channel()
            exchange = await channel.declare_exchange(
                EXCHANGE_NAME, aio_pika.ExchangeType.TOPIC, durable=True
            )
            await exchange.publish(
                aio_pika.Message(
                    body=json.dumps(payload).encode(),
                    content_type="application/json",
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                ),
                routing_key=routing_key,
            )
        logger.debug("Published %s: %s", routing_key, payload)
    except Exception as exc:
        logger.warning("RabbitMQ publish failed (%s), continuing: %s", routing_key, exc)
