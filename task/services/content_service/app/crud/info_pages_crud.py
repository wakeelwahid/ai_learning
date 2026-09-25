from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import InfoPage
from app.schemas.content import InfoPageBody


async def list_info_pages(db: AsyncSession, include_unpublished: bool) -> list[InfoPage]:
    stmt = select(InfoPage).order_by(InfoPage.slug)
    if not include_unpublished:
        stmt = stmt.where(InfoPage.is_published == True)  # noqa: E712
    return (await db.execute(stmt)).scalars().all()


async def get_info_page(db: AsyncSession, slug: str) -> InfoPage | None:
    return (await db.execute(select(InfoPage).where(InfoPage.slug == slug))).scalar_one_or_none()


async def upsert_info_page(db: AsyncSession, slug: str, body: InfoPageBody) -> InfoPage:
    p = (await db.execute(select(InfoPage).where(InfoPage.slug == slug))).scalar_one_or_none()
    if p:
        p.title = body.title
        p.content = body.content
        p.data = body.data
        p.is_published = body.is_published
    else:
        p = InfoPage(
            slug=slug, title=body.title, content=body.content,
            data=body.data, is_published=body.is_published,
        )
        db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def delete_info_page(db: AsyncSession, slug: str) -> None:
    p = (await db.execute(select(InfoPage).where(InfoPage.slug == slug))).scalar_one_or_none()
    if p:
        await db.delete(p)
        await db.commit()


# ── Completion Certificates ───────────────────────────────────────────────────
