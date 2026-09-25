from typing import Literal

from pydantic import BaseModel, Field
import uuid


class RegisterTokenRequest(BaseModel):
    # user_id is ignored server-side (always taken from the verified JWT — see
    # register_token in app/routes/push.py), kept optional/typed for callers
    # that still send it.
    user_id: uuid.UUID | None = None
    token: str = Field(min_length=1, max_length=500)   # PushToken.token is String(500)
    platform: Literal["ios", "android", "web"]


class SendPushRequest(BaseModel):
    # user_id is ignored server-side (always taken from the verified JWT — see
    # send_push_notification in app/routes/push.py), kept optional/typed for
    # callers that still send it.
    user_id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=1000)
    data: dict | None = None
