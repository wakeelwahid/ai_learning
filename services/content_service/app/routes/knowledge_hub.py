import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_admin
from app.crud import knowledge_hub_crud
from app.database.session import get_db
from app.schemas.content import (
    KnowledgeArticleCreate,
    KnowledgeArticleUpdate,
    KnowledgeCategoryCreate,
)

router = APIRouter(prefix="/content", tags=["content"])


@router.get("/knowledge-categories")
async def list_knowledge_categories(db: AsyncSession = Depends(get_db)):
    rows = await knowledge_hub_crud.list_knowledge_categories(db)
    return [{"id": str(r.id), "name": r.name, "icon": r.icon, "color": r.color, "description": r.description, "sequence": r.sequence} for r in rows]


@router.post("/knowledge-categories", status_code=201, dependencies=[Depends(require_admin)])
async def create_knowledge_category(body: KnowledgeCategoryCreate, db: AsyncSession = Depends(get_db)):
    cat = await knowledge_hub_crud.create_knowledge_category(db, body)
    return {"id": str(cat.id), "name": cat.name}


@router.put("/knowledge-categories/{cat_id}", dependencies=[Depends(require_admin)])
async def update_knowledge_category(cat_id: uuid.UUID, body: KnowledgeCategoryCreate, db: AsyncSession = Depends(get_db)):
    cat = await knowledge_hub_crud.get_knowledge_category(db, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    cat = await knowledge_hub_crud.update_knowledge_category(db, cat, body)
    return {"id": str(cat.id), "name": cat.name}


@router.delete("/knowledge-categories/{cat_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_knowledge_category(cat_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    cat = await knowledge_hub_crud.get_knowledge_category(db, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    await knowledge_hub_crud.deactivate_knowledge_category(db, cat)


@router.get("/knowledge-articles")
async def list_knowledge_articles(
    category_id: uuid.UUID | None = Query(default=None),
    is_trending: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    rows = await knowledge_hub_crud.list_knowledge_articles(db, category_id, is_trending, limit)
    return [
        {
            "id": str(r.id), "category_id": str(r.category_id), "title": r.title,
            "description": r.description, "content": r.content, "cover_image_url": r.cover_image_url,
            "duration_min": r.duration_min, "view_count": r.view_count,
            "is_trending": r.is_trending, "is_published": r.is_published,
            "author": r.author, "created_at": r.created_at.isoformat() if r.created_at else None,
            "content_type": r.content_type, "video_url": r.video_url, "external_url": r.external_url,
        }
        for r in rows
    ]


@router.post("/knowledge-articles", status_code=201, dependencies=[Depends(require_admin)])
async def create_knowledge_article(body: KnowledgeArticleCreate, db: AsyncSession = Depends(get_db)):
    article = await knowledge_hub_crud.create_knowledge_article(db, body)
    return {"id": str(article.id), "title": article.title}


@router.put("/knowledge-articles/{article_id}", dependencies=[Depends(require_admin)])
async def update_knowledge_article(article_id: uuid.UUID, body: KnowledgeArticleUpdate, db: AsyncSession = Depends(get_db)):
    art = await knowledge_hub_crud.get_knowledge_article(db, article_id)
    if not art:
        raise HTTPException(status_code=404, detail="Article not found")
    art = await knowledge_hub_crud.update_knowledge_article(db, art, body)
    return {"id": str(art.id), "title": art.title}


@router.delete("/knowledge-articles/{article_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_knowledge_article(article_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    art = await knowledge_hub_crud.get_knowledge_article(db, article_id)
    if not art:
        raise HTTPException(status_code=404, detail="Article not found")
    await knowledge_hub_crud.delete_knowledge_article(db, art)


@router.post("/knowledge-articles/{article_id}/view")
async def increment_article_view(article_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await knowledge_hub_crud.increment_article_view(db, article_id)
    return {"ok": True}
