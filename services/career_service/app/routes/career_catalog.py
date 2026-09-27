"""Career catalog API routes — listing, categories and detail."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.services.career_catalog_service import CareerCatalogService

router = APIRouter(prefix="/careers", tags=["careers"])


@router.get("")
async def list_careers(
    category:  str | None = Query(default=None),
    search:    str | None = Query(default=None),
    limit:     int        = Query(default=50, le=100),
    offset:    int        = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    svc = CareerCatalogService(db)
    careers = await svc.list_careers(category=category, search=search, limit=limit, offset=offset)
    return {
        "careers": [
            {
                "id":           str(c.id),
                "title":        c.title,
                "category":     c.category,
                "slug":         c.slug,
                "overview":     c.overview[:180] + "..." if len(c.overview) > 180 else c.overview,
                "demand_level": c.demand_level,
                "icon":         c.icon,
                "color":        c.color,
                "salary_range": c.salary_range,
                "required_subjects": c.required_subjects,
            }
            for c in careers
        ],
        "total": len(careers),
    }


@router.get("/categories")
async def get_categories(db: AsyncSession = Depends(get_db)):
    svc = CareerCatalogService(db)
    careers = await svc.list_careers(limit=500)
    cats = sorted(set(c.category for c in careers))
    return {"categories": cats}


@router.get("/{career_id_or_slug}")
async def get_career(
    career_id_or_slug: str,
    db: AsyncSession = Depends(get_db),
):
    svc = CareerCatalogService(db)
    career = None
    try:
        career = await svc.get_career(uuid.UUID(career_id_or_slug))
    except ValueError:
        career = await svc.get_career_by_slug(career_id_or_slug)

    if not career:
        raise HTTPException(status_code=404, detail="Career not found")

    return {
        "id":                str(career.id),
        "title":             career.title,
        "category":          career.category,
        "slug":              career.slug,
        "overview":          career.overview,
        "required_subjects": career.required_subjects,
        "skills_required":   career.skills_required,
        "roadmap_steps":     career.roadmap_steps,
        "salary_range":      career.salary_range,
        "demand_level":      career.demand_level,
        "top_colleges":      career.top_colleges,
        "entrance_exams":    career.entrance_exams,
        "future_demand":     career.future_demand,
        "icon":              career.icon,
        "color":             career.color,
    }
