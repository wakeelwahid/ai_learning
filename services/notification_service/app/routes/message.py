"""
Message threading endpoints — parent/teacher to student messaging.

Endpoints:
    GET  /notifications/messages/threads          — list threads for the authenticated student
    POST /notifications/messages/threads          — create a new thread (parent/teacher)
    GET  /notifications/messages/threads/{id}     — thread detail + messages (marks as read)
    POST /notifications/messages/threads/{id}     — send a reply in a thread

All endpoints require a verified JWT (Bearer token). Identity for any
sender/participant field is always taken from the token — never from a
request body or query parameter — and callers may only view/act on threads
they are a participant of (the thread's `student_id` or `sender_id`).
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import UserRole, get_current_user_id, get_current_user_id_and_role
from app.database.session import get_db
from app.crud.message_crud import (
    get_threads_for_student,
    get_thread,
    create_thread,
    add_message_to_thread,
    mark_thread_read,
)
from app.models.message import MessageThread, SenderRole
from app.schemas.message import (
    CreateThreadRequest,
    SendMessageRequest,
    ThreadDetailResponse,
    ThreadListResponse,
    ThreadSummary,
    MessageOut,
)

router = APIRouter(prefix="/notifications/messages", tags=["messages"])


def assert_participant(thread: MessageThread, caller_id: uuid.UUID) -> None:
    """Raise 403 unless the caller is the student or the sender on this thread."""
    if caller_id not in (thread.student_id, thread.sender_id):
        raise HTTPException(status_code=403, detail="Not a participant in this thread")


@router.get("/threads", response_model=ThreadListResponse)
async def list_threads(
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Return all message threads for the authenticated student, newest-activity first."""
    threads = await get_threads_for_student(db, student_id=caller_id)
    return ThreadListResponse(threads=threads, total=len(threads))


@router.post("/threads", status_code=201, response_model=ThreadSummary)
async def create_new_thread(
    body: CreateThreadRequest,
    identity: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new thread from the authenticated parent/teacher to a student.
    Optionally include an initial message.

    Restricted to callers whose verified JWT role is teacher, parent,
    admin, or super_admin — a student (or any other caller) cannot open a
    thread claiming to be a teacher/parent.

    `sender_id` is always bound to the authenticated caller (never trusted
    from the request body), so a caller can only ever create threads as
    themselves — they cannot impersonate another sender. `sender_role` is
    likewise derived from the caller's verified JWT role rather than the
    request body, except for admin/super_admin callers, who may open a
    thread on behalf of a parent/teacher via the requested role.
    """
    caller_id, role = identity
    if role == UserRole.TEACHER.value:
        sender_role = SenderRole.TEACHER
    elif role == UserRole.PARENT.value:
        sender_role = SenderRole.PARENT
    elif role in (UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value):
        sender_role = body.sender_role
    else:
        raise HTTPException(
            status_code=403,
            detail="Only teacher, parent, or admin accounts may open a message thread",
        )

    thread = await create_thread(
        db,
        student_id=body.student_id,
        sender_id=caller_id,
        sender_name=body.sender_name,
        sender_role=sender_role,
        sender_avatar=body.sender_avatar,
        initial_message=body.initial_message,
    )
    return thread


@router.get("/threads/{thread_id}", response_model=ThreadDetailResponse)
async def get_thread_detail(
    thread_id: uuid.UUID,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Return full thread detail including all messages.
    Automatically marks all unread messages in the thread as read.
    Only the student or the sender on the thread may view it.
    """
    thread = await get_thread(db, thread_id=thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    assert_participant(thread, caller_id)

    await mark_thread_read(db, thread_id=thread_id)
    await db.refresh(thread)

    return ThreadDetailResponse(
        thread=ThreadSummary.model_validate(thread),
        messages=[MessageOut.model_validate(m) for m in thread.messages],
    )


@router.post("/threads/{thread_id}", status_code=201, response_model=MessageOut)
async def send_message(
    thread_id: uuid.UUID,
    body: SendMessageRequest,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Send a reply message in an existing thread.
    Can be called by the student (reply) or parent/teacher (new message).

    `sender_id` is always the authenticated caller (never a query param),
    and the caller must be a participant (student or sender) on the thread.
    `sender_role` is derived from which participant the caller is (the
    thread's student, or its original teacher/parent sender) — never
    trusted from a client-supplied param — so a participant cannot mislabel
    themselves as a different role when replying.
    """
    thread = await get_thread(db, thread_id=thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    assert_participant(thread, caller_id)

    if not body.content.strip():
        raise HTTPException(status_code=422, detail="Message content cannot be empty")

    sender_role = SenderRole.STUDENT if caller_id == thread.student_id else thread.sender_role

    msg = await add_message_to_thread(
        db,
        thread_id=thread_id,
        sender_id=caller_id,
        sender_role=sender_role,
        content=body.content.strip(),
    )
    return msg
