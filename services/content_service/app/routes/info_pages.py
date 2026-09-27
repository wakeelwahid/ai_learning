from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_admin
from app.crud import info_pages_crud
from app.database.session import get_db
from app.schemas.content import InfoPageBody

router = APIRouter(prefix="/content", tags=["content"])


# ─────────────────────────────────────────────────────────────────────────────
#  Info Pages (CMS) — admin-editable About/Contact/FAQ/Privacy/Terms/Refund/footer
# ─────────────────────────────────────────────────────────────────────────────

def ser_info_page(p) -> dict:
    return {
        "slug": p.slug,
        "title": p.title,
        "content": p.content,
        "data": p.data,
        "is_published": p.is_published,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


@router.get("/info-pages", summary="List all info/CMS pages")
async def list_info_pages(
    include_unpublished: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    rows = await info_pages_crud.list_info_pages(db, include_unpublished)
    return [ser_info_page(p) for p in rows]


@router.get("/info-pages/{slug}", summary="Get a single info/CMS page by slug")
async def get_info_page(slug: str = Path(min_length=1, max_length=60), db: AsyncSession = Depends(get_db)):
    p = await info_pages_crud.get_info_page(db, slug)
    if not p:
        raise HTTPException(status_code=404, detail="Info page not found")
    return ser_info_page(p)


@router.put("/info-pages/{slug}", summary="[Admin] Create or update an info/CMS page", dependencies=[Depends(require_admin)])
async def upsert_info_page(slug: str = Path(min_length=1, max_length=60), body: InfoPageBody = ..., db: AsyncSession = Depends(get_db)):
    p = await info_pages_crud.upsert_info_page(db, slug, body)
    return ser_info_page(p)


@router.delete("/info-pages/{slug}", status_code=204, summary="[Admin] Delete an info/CMS page", dependencies=[Depends(require_admin)])
async def delete_info_page(slug: str = Path(min_length=1, max_length=60), db: AsyncSession = Depends(get_db)):
    await info_pages_crud.delete_info_page(db, slug)
    return None
