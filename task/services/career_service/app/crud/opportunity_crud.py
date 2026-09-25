"""CRUD helpers for the Opportunity model."""
import uuid
from datetime import date, timedelta

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.opportunity import Opportunity, OpportunityCategory


async def list_opportunities(
    db: AsyncSession,
    category: OpportunityCategory | None,
    subcategory: str | None,
    active_only: bool,
    featured: bool | None,
    limit: int,
    offset: int,
) -> list[Opportunity]:
    filters = []
    if active_only:
        filters.append(Opportunity.is_active == True)  # noqa: E712
    if category:
        filters.append(Opportunity.category == category)
    if subcategory:
        filters.append(Opportunity.subcategory == subcategory)
    if featured is not None:
        filters.append(Opportunity.is_featured == featured)

    stmt = select(Opportunity).where(and_(*filters) if filters else True).order_by(Opportunity.last_date.asc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_upcoming_deadlines(db: AsyncSession, days: int) -> list[Opportunity]:
    cutoff = date.today() + timedelta(days=days)
    stmt = (
        select(Opportunity)
        .where(
            and_(
                Opportunity.is_active == True,  # noqa: E712
                Opportunity.last_date >= date.today(),
                Opportunity.last_date <= cutoff,
            )
        )
        .order_by(Opportunity.last_date.asc())
        .limit(20)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_active_by_category(db: AsyncSession, category: OpportunityCategory) -> list[Opportunity]:
    today = date.today()
    result = await db.execute(
        select(Opportunity).where(
            and_(Opportunity.category == category, Opportunity.is_active == True, Opportunity.last_date >= today)  # noqa: E712
        )
    )
    return result.scalars().all()


async def get_opportunity(db: AsyncSession, opportunity_id: uuid.UUID) -> Opportunity | None:
    result = await db.execute(select(Opportunity).where(Opportunity.id == opportunity_id))
    return result.scalar_one_or_none()


async def create_opportunity(db: AsyncSession, body) -> Opportunity:
    opp = Opportunity(
        id=uuid.uuid4(),
        category=body.category,
        subcategory=body.subcategory,
        title=body.title,
        organization=body.organization,
        description=body.description,
        total_posts=body.total_posts,
        qualification=body.qualification,
        age_min=body.age_min,
        age_max=body.age_max,
        salary_min=body.salary_min,
        salary_max=body.salary_max,
        application_fee=body.application_fee,
        last_date=body.last_date,
        exam_date=body.exam_date,
        selection_process=body.selection_process,
        official_url=body.official_url,
        notification_pdf_url=body.notification_pdf_url,
        is_active=True,
        is_featured=body.is_featured,
    )
    db.add(opp)
    await db.commit()
    await db.refresh(opp)
    return opp


async def update_opportunity(db: AsyncSession, opp: Opportunity, updates: dict) -> Opportunity:
    for field, value in updates.items():
        setattr(opp, field, value)
    await db.commit()
    await db.refresh(opp)
    return opp


async def deactivate_opportunity(db: AsyncSession, opp: Opportunity) -> None:
    opp.is_active = False
    await db.commit()
