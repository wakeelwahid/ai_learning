"""Career catalog — listing and lookup of careers."""
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.career_catalog import Career

logger = logging.getLogger(__name__)


class CareerCatalogService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_careers(
        self,
        category: str | None = None,
        search: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Career]:
        q = select(Career).where(Career.is_active == True)
        if category:
            q = q.where(Career.category == category)
        if search:
            q = q.where(Career.title.ilike(f"%{search}%"))
        q = q.order_by(Career.category, Career.title).limit(limit).offset(offset)
        res = await self.db.execute(q)
        return res.scalars().all()

    async def get_career(self, career_id: uuid.UUID) -> Career | None:
        res = await self.db.execute(select(Career).where(Career.id == career_id))
        return res.scalar_one_or_none()

    async def get_career_by_slug(self, slug: str) -> Career | None:
        res = await self.db.execute(select(Career).where(Career.slug == slug))
        return res.scalar_one_or_none()
