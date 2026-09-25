from typing import List

from pydantic import BaseModel


class AdminOverviewResponse(BaseModel):
    total_active_students: int
    total_videos_watched: int
    total_quizzes_completed: int


class EngagementTrendPoint(BaseModel):
    date: str
    active_students: int


class AdminEngagementResponse(BaseModel):
    daily_active_users: int
    weekly_active_users: int
    trend: List[EngagementTrendPoint]
    avg_session_minutes: float | None = None
    avg_session_minutes_note: str | None = None


class AdminRevenueResponse(BaseModel):
    """Mirrors payment_service's real /admin/revenue payload (see
    payment_crud.get_revenue_stats), plus a trial_conversions field that has
    no backing data anywhere and is reported as null with a reason."""

    total_revenue_paise: int
    today_revenue_paise: int
    new_subscriptions_today: int
    cancellations_today: int
    successful_payments: int
    failed_payments: int
    refunds: int
    trial_conversions: int | None = None
    trial_conversions_note: str | None = None


class DailyActiveTrendPoint(BaseModel):
    date: str
    students: int


class AdminDailyActiveResponse(BaseModel):
    trend: List[DailyActiveTrendPoint]


class BattleWinLoss(BaseModel):
    battles_played: int
    battles_won: int
    battles_lost: int


class AdminBattleStatsResponse(BaseModel):
    """Mirrors battle_service's real /admin/stats payload (see
    BattleService.get_admin_stats) — analytics_service delegates to it
    rather than re-deriving battle data locally."""

    total: int
    by_status: dict[str, int]
    by_type: dict[str, int]
    completed_battles: int
    cancelled_battles: int
    avg_duration_sec: float | None
    total_xp_exchanged: int
    total_participants: int
    win_loss: BattleWinLoss
