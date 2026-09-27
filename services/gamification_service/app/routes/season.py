import calendar
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.gamification_crud import get_leaderboard
from app.database.session import get_db

router = APIRouter(prefix="/gamification", tags=["Gamification"])


# ── Season endpoint ───────────────────────────────────────────────────────────

@router.get("/season/current")
async def get_current_season(db: AsyncSession = Depends(get_db)):
    """Return current season info: season number, year, start/end dates, top 3 leaderboard."""
    today = date.today()
    month = today.month
    year = today.year

    # season 1=Q1 (Jan-Mar), 2=Q2 (Apr-Jun), 3=Q3 (Jul-Sep), 4=Q4 (Oct-Dec)
    season_number = (month - 1) // 3 + 1
    season_start_month = (season_number - 1) * 3 + 1
    season_end_month = season_start_month + 2

    last_day = calendar.monthrange(year, season_end_month)[1]
    season_start = date(year, season_start_month, 1)
    season_end = date(year, season_end_month, last_day)

    top3_rows = await get_leaderboard(db, 3)
    top3 = [
        {"rank": i + 1, "user_id": str(r.user_id), "total_xp": r.total_xp, "level": r.level}
        for i, r in enumerate(top3_rows)
    ]

    return {
        "season_number": season_number,
        "year": year,
        "label": f"Season {season_number} {year} (Q{season_number})",
        "start_date": season_start.isoformat(),
        "end_date": season_end.isoformat(),
        "top3": top3,
    }
