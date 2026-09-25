import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import Note


async def get_note(db: AsyncSession, note_id: uuid.UUID) -> Note | None:
    return await db.get(Note, note_id)
