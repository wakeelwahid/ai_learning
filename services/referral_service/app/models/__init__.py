"""Model package — importing any model registers all tables on Base.metadata.

main.py runs Base.metadata.create_all() at startup, so every table module must
be imported here for the schema to be created in full.
"""
from app.models.enums import REFERRAL_MILESTONES, ReferralStatus
from app.models.referral import Referral
from app.models.referral_code import ReferralCode
from app.models.reward import ReferralReward

__all__ = [
    "REFERRAL_MILESTONES",
    "Referral",
    "ReferralCode",
    "ReferralReward",
    "ReferralStatus",
]
