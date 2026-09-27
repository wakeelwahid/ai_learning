import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id
from app.crud import bookmarks_crud
from app.crud import videos_crud
from app.crud.notes_crud import get_note as _get_note
from app.database.session import get_db
from app.schemas.content import (
    BookmarkToggleRequest,
    BookmarkToggleResponse,
    NoteBookmarkRequest,
    UserBookmarksResponse,
)

router = APIRouter(prefix="/content", tags=["content"])


# ── Bookmarks (save-for-later videos & notes) ──────────────────────────────────
@router.post("/bookmarks/toggle", response_model=BookmarkToggleResponse)
async def toggle_bookmark(
    body: BookmarkToggleRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Save or un-save a video/note for the current user. Idempotent toggle —
    call it again to undo. Verifies the target exists before bookmarking it."""
    if body.entity_type == "video":
        exists = await videos_crud.get_video(db, body.entity_id)
    else:
        exists = await _get_note(db, body.entity_id)
    if not exists:
        raise HTTPException(status_code=404, detail=f"{body.entity_type.capitalize()} not found")

    bookmarked = await bookmarks_crud.toggle_bookmark(db, current_user_id, body.entity_type, body.entity_id)
    return BookmarkToggleResponse(bookmarked=bookmarked, entity_type=body.entity_type, entity_id=body.entity_id)


@router.post("/notes/{note_id}/bookmark", status_code=201, response_model=BookmarkToggleResponse)
async def bookmark_note(
    note_id: uuid.UUID,
    body: NoteBookmarkRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Legacy path kept for existing callers — toggles the same real
    bookmark as POST /bookmarks/toggle. The body's user_id must match the
    caller; a real bookmark can only ever be set for yourself."""
    if body.user_id != current_user_id:
        raise HTTPException(status_code=403, detail="Cannot bookmark on behalf of another user")
    note = await _get_note(db, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    bookmarked = await bookmarks_crud.toggle_bookmark(db, current_user_id, "note", note_id)
    return BookmarkToggleResponse(bookmarked=bookmarked, entity_type="note", entity_id=note_id)


@router.get("/bookmarks/{user_id}", response_model=UserBookmarksResponse)
async def get_user_bookmarks(
    user_id: uuid.UUID,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if user_id != current_user_id:
        raise HTTPException(status_code=403, detail="Cannot access another user's bookmarks")
    videos = await bookmarks_crud.get_user_bookmarked_videos(db, current_user_id)
    notes = await bookmarks_crud.get_user_bookmarked_notes(db, current_user_id)
    return UserBookmarksResponse(videos=videos, notes=notes)
