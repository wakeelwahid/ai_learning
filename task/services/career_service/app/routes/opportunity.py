"""Career & Opportunities Hub — API routes."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_admin
from app.crud import opportunity_crud
from app.database.session import get_db
from app.models.opportunity import Opportunity, OpportunityCategory
from app.schemas.opportunity import OpportunityCreate, OpportunityUpdate

router = APIRouter(prefix="/opportunities", tags=["opportunities"])


def serialize(o: Opportunity) -> dict:
    return {
        "id":                   str(o.id),
        "category":             o.category.value,
        "subcategory":          o.subcategory,
        "title":                o.title,
        "organization":         o.organization,
        "description":          o.description,
        "total_posts":          o.total_posts,
        "qualification":        o.qualification,
        "age_min":              o.age_min,
        "age_max":              o.age_max,
        "salary_min":           o.salary_min,
        "salary_max":           o.salary_max,
        "application_fee":      o.application_fee,
        "last_date":            o.last_date.isoformat() if o.last_date else None,
        "exam_date":            o.exam_date.isoformat() if o.exam_date else None,
        "selection_process":    o.selection_process,
        "official_url":         o.official_url,
        "notification_pdf_url": o.notification_pdf_url,
        "is_active":            o.is_active,
        "is_featured":          o.is_featured,
        "created_at":           o.created_at.isoformat(),
    }


@router.get("")
async def list_opportunities(
    category:    OpportunityCategory | None  = Query(default=None),
    subcategory: str | None  = Query(default=None),
    active_only: bool        = Query(default=True),
    featured:    bool | None = Query(default=None),
    limit:       int         = Query(default=50, le=200),
    offset:      int         = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    items = await opportunity_crud.list_opportunities(
        db, category, subcategory, active_only, featured, limit, offset
    )
    return {"opportunities": [serialize(o) for o in items], "total": len(items)}


@router.get("/upcoming")
async def upcoming_deadlines(
    days: int = Query(default=30, le=90),
    db: AsyncSession = Depends(get_db),
):
    items = await opportunity_crud.get_upcoming_deadlines(db, days)
    return {"opportunities": [serialize(o) for o in items]}


@router.get("/hub-summary")
async def hub_summary(db: AsyncSession = Depends(get_db)):
    """Returns category counts + 3 featured items per category for the hub page."""
    summary = {}
    for cat in OpportunityCategory:
        all_items = await opportunity_crud.get_active_by_category(db, cat)
        featured = [o for o in all_items if o.is_featured][:3] or all_items[:3]
        summary[cat.value] = {
            "count":    len(all_items),
            "featured": [serialize(o) for o in featured],
        }
    return {"summary": summary}


@router.get("/{opportunity_id}")
async def get_opportunity(
    opportunity_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    opp = await opportunity_crud.get_opportunity(db, opportunity_id)
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    return serialize(opp)


# ── Admin endpoints ────────────────────────────────────────────────────────────

@router.post("/admin/create", status_code=201, dependencies=[Depends(require_admin)])
async def admin_create(body: OpportunityCreate, db: AsyncSession = Depends(get_db)):
    opp = await opportunity_crud.create_opportunity(db, body)
    return serialize(opp)


@router.patch("/admin/{opportunity_id}", dependencies=[Depends(require_admin)])
async def admin_update(
    opportunity_id: uuid.UUID,
    body: OpportunityUpdate,
    db: AsyncSession = Depends(get_db),
):
    opp = await opportunity_crud.get_opportunity(db, opportunity_id)
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    opp = await opportunity_crud.update_opportunity(db, opp, body.model_dump(exclude_unset=True))
    return serialize(opp)


@router.delete("/admin/{opportunity_id}", dependencies=[Depends(require_admin)])
async def admin_deactivate(
    opportunity_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    opp = await opportunity_crud.get_opportunity(db, opportunity_id)
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    await opportunity_crud.deactivate_opportunity(db, opp)
    return {"deactivated": True, "id": str(opportunity_id)}
