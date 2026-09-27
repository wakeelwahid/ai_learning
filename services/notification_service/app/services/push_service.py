"""Push-notification delivery via FCM."""
import json
import os

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.push_crud import get_tokens_for_user


async def send_fcm(token: str, title: str, body_text: str, data: dict) -> None:
    fcm_key = os.getenv("FCM_SERVER_KEY", "")
    if not fcm_key:
        return

    payload = {
        "to": token,
        "notification": {"title": title, "body": body_text},
        "data": data,
        "priority": "high",
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://fcm.googleapis.com/fcm/send",
            headers={"Authorization": "key=" + fcm_key, "Content-Type": "application/json"},
            json=payload,
            timeout=5.0,
        )
        resp.raise_for_status()


async def send_push_to_user(db: AsyncSession, user_id, title: str, body_text: str, data: dict) -> dict:
    """Send a push to every registered device for `user_id`."""
    tokens = await get_tokens_for_user(db, user_id)
    if not tokens:
        return {"status": "no_tokens", "sent": 0}

    sent = 0
    for push_token in tokens:
        try:
            await send_fcm(push_token.token, title, body_text, data)
            sent += 1
        except Exception:
            pass
    return {"status": "ok", "sent": sent}
