from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.services.content_service import ContentService

router = APIRouter(prefix="/content", tags=["content"])


@router.get("/search")
async def search_content(q: str = Query(..., min_length=1), db: AsyncSession = Depends(get_db)):
    return await ContentService(db).search(q)
