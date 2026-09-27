import uuid

from pydantic import BaseModel, Field


class FriendRequestBody(BaseModel):
    to_user_id: uuid.UUID


class AcceptFriendBody(BaseModel):
    from_user_id: uuid.UUID


class SendMessageBody(BaseModel):
    to_user_id: uuid.UUID
    content: str


class CreateGroupBody(BaseModel):
    name: str = Field(max_length=100)
    description: str | None = None
    subject: str | None = None
