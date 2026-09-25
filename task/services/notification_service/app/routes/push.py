import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id
from app.crud.push_crud import upsert_token
from app.database.session import get_db
from app.schemas.push import RegisterTokenRequest, SendPushRequest
from app.services.push_service import send_push_to_user

router = APIRouter(prefix="/push", tags=["push"])


@router.post("/token", status_code=201)
async def register_token(
    body: RegisterTokenRequest,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    # user_id is always taken from the verified JWT; the body field (if any)
    # is ignored to prevent registering tokens for arbitrary users.
    await upsert_token(db, caller_id, body.token, body.platform)
    return {"status": "registered"}


@router.post("/send")
async def send_push_notification(
    body: SendPushRequest,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    # user_id is always taken from the verified JWT; the body field (if any)
    # is ignored to prevent sending pushes to arbitrary users' devices.
    return await send_push_to_user(db, caller_id, body.title, body.body, body.data)
