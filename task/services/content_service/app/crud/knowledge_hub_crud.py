import uuid

from sqlalchemy import select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import (
    KnowledgeArticle,
    KnowledgeCategory,
)
from app.schemas.content import (
    KnowledgeArticleCreate,
    KnowledgeArticleUpdate,
    KnowledgeCategoryCreate,
)


async def list_knowledge_categories(db: AsyncSession) -> list[KnowledgeCategory]:
    return (await db.execute(
        select(KnowledgeCategory).where(KnowledgeCategory.is_active == True).order_by(KnowledgeCategory.sequence)  # noqa: E712
    )).scalars().all()


async def create_knowledge_category(db: AsyncSession, body: KnowledgeCategoryCreate) -> KnowledgeCategory:
    cat = KnowledgeCategory(**body.model_dump())
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


async def get_knowledge_category(db: AsyncSession, cat_id: uuid.UUID) -> KnowledgeCategory | None:
    return (await db.execute(select(KnowledgeCategory).where(KnowledgeCategory.id == cat_id))).scalar_one_or_none()


async def update_knowledge_category(
    db: AsyncSession, cat: KnowledgeCategory, body: KnowledgeCategoryCreate
) -> KnowledgeCategory:
    for k, v in body.model_dump().items():
        setattr(cat, k, v)
    await db.commit()
    return cat


async def deactivate_knowledge_category(db: AsyncSession, cat: KnowledgeCategory) -> None:
    cat.is_active = False
    await db.commit()


async def list_knowledge_articles(
    db: AsyncSession,
    category_id: uuid.UUID | None,
    is_trending: bool | None,
    limit: int,
) -> list[KnowledgeArticle]:
    q = select(KnowledgeArticle).where(KnowledgeArticle.is_published == True)  # noqa: E712
    if category_id:
        q = q.where(KnowledgeArticle.category_id == category_id)
    if is_trending is not None:
        q = q.where(KnowledgeArticle.is_trending == is_trending)
    q = q.order_by(KnowledgeArticle.created_at.desc()).limit(limit)
    return (await db.execute(q)).scalars().all()


async def create_knowledge_article(db: AsyncSession, body: KnowledgeArticleCreate) -> KnowledgeArticle:
    article = KnowledgeArticle(**body.model_dump())
    db.add(article)
    await db.commit()
    await db.refresh(article)
    return article


async def get_knowledge_article(db: AsyncSession, article_id: uuid.UUID) -> KnowledgeArticle | None:
    return (await db.execute(select(KnowledgeArticle).where(KnowledgeArticle.id == article_id))).scalar_one_or_none()


async def update_knowledge_article(
    db: AsyncSession, article: KnowledgeArticle, body: KnowledgeArticleUpdate
) -> KnowledgeArticle:
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(article, k, v)
    await db.commit()
    return article


async def delete_knowledge_article(db: AsyncSession, article: KnowledgeArticle) -> None:
    await db.delete(article)
    await db.commit()


async def increment_article_view(db: AsyncSession, article_id: uuid.UUID) -> None:
    await db.execute(
        sa_update(KnowledgeArticle)
        .where(KnowledgeArticle.id == article_id)
        .values(view_count=KnowledgeArticle.view_count + 1)
    )
    await db.commit()


# ── Admin Catalog: Boards ─────────────────────────────────────────────────────
