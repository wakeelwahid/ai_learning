import uuid

from pydantic import BaseModel


class SendMessageRequest(BaseModel):
    recipient_id: uuid.UUID
    content: str


class MessageResponse(BaseModel):
    id: str
    sender_id: str
    recipient_id: str
    content: str
    is_read: bool
    created_at: str

    model_config = {"from_attributes": True}


class ThreadSummary(BaseModel):
    other_user_id: str
    other_user_name: str
    other_user_role: str
    last_message: str
    last_message_time: str
    unread_count: int


class UnreadCountResponse(BaseModel):
    count: int
