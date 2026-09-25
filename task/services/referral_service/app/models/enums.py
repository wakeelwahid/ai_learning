import enum


class ReferralStatus(str, enum.Enum):
    PENDING = "pending"
    QUALIFIED = "qualified"
    REWARDED = "rewarded"
    INVALID = "invalid"


# Referrer milestone rewards, keyed by qualified-referral count.
# "xp_bonus_N" grants N x REFERRAL_SUCCESS XP+EduPoints via gamification_service
# (see ReferralTrackingService._payout_reward) — replaces the previous
# premium_notes/practice_papers/quiz_boost/adaptive_learning feature-unlock
# names, which named perks no entitlement system anywhere on the platform
# could actually grant, so they sat recorded-but-unclaimed forever.
# 7_days_premium/30_days_premium are unchanged — payment_service's internal
# grant endpoint already pays these out for real.
REFERRAL_MILESTONES = {
    1: "xp_bonus_1",
    2: "xp_bonus_2",
    3: "xp_bonus_3",
    5: "xp_bonus_5",
    7: "7_days_premium",
    10: "30_days_premium",
}
