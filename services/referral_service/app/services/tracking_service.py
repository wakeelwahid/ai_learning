import logging
import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.enums import REFERRAL_MILESTONES, ReferralStatus
from app.models.referral import Referral
from app.models.referral_code import ReferralCode
from app.models.reward import ReferralReward

logger = logging.getLogger(__name__)


class ReferralTrackingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def register_referral(
        self, referral_code: str, referred_user_id: uuid.UUID
    ) -> Referral | None:
        code_result = await self.db.execute(
            select(ReferralCode).where(ReferralCode.code == referral_code)
        )
        code_record = code_result.scalar_one_or_none()
        if not code_record:
            return None

        if code_record.user_id == referred_user_id:
            return None

        existing = await self.db.execute(
            select(Referral).where(Referral.referred_id == referred_user_id)
        )
        if existing.scalar_one_or_none():
            return None

        referral = Referral(
            referrer_id=code_record.user_id,
            referred_id=referred_user_id,
            referral_code=referral_code,
            signup_completed=True,
        )
        self.db.add(referral)
        await self.db.execute(
            update(ReferralCode)
            .where(ReferralCode.id == code_record.id)
            .values(total_referrals=ReferralCode.total_referrals + 1)
        )
        await self.db.commit()
        return referral

    async def update_qualification(self, referred_user_id: uuid.UUID) -> dict:
        """Re-check and persist this referral's qualification checklist,
        computed ENTIRELY server-side against the owning services — never
        from client-asserted booleans (the caller previously passed
        email_verified/video_watched/quiz_completed directly in the request
        body, which let anyone qualify their own referral, and trigger a
        real reward payout, by lying in the API call — no video ever
        watched, no quiz ever taken required).

        - email_verified: the platform is phone-OTP-only now (no separate
          email-verification step exists), and phone_otp_service sets
          phone_verified=True unconditionally on every successful OTP
          login — so holding a valid JWT for referred_user_id already
          proves this. Always true for any caller who reaches this method.
        - video_watched / quiz_completed: verified live against
          content_service / quiz_service's internal-only endpoints, which
          query VideoProgress.is_completed / QuizAttempt.status="completed"
          directly — the real record of what this user actually did.
        """
        result = await self.db.execute(
            select(Referral).where(Referral.referred_id == referred_user_id)
        )
        referral = result.scalar_one_or_none()
        if not referral:
            return {"qualified": False}

        referral.email_verified = True

        async with httpx.AsyncClient(timeout=3.0) as client:
            try:
                video_resp = await client.get(
                    f"{settings.CONTENT_SERVICE_URL}/api/v1/content/videos/internal/completed/{referred_user_id}",
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
                referral.video_watched = video_resp.json().get("completed", False)
            except Exception as exc:
                logger.warning("content_service video-completion check failed: %s", exc)
                # Fail closed — an unreachable dependency must never look
                # like "qualified", or a flaky network call could grant an
                # unearned reward. Keep whatever was already persisted.
            try:
                quiz_resp = await client.get(
                    f"{settings.QUIZ_SERVICE_URL}/api/v1/quizzes/attempts/internal/completed/{referred_user_id}",
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
                referral.quiz_completed = quiz_resp.json().get("completed", False)
            except Exception as exc:
                logger.warning("quiz_service quiz-completion check failed: %s", exc)

        all_qualified = (
            referral.signup_completed
            and referral.email_verified
            and referral.video_watched
            and referral.quiz_completed
        )

        rewards_granted = []

        # The referred friend's own one-time welcome bonus — the "Both get
        # reward" half of the referral flow that previously didn't exist at
        # all: only the referrer ever received anything. Tracked on its own
        # `friend_reward_claimed` flag (not gated on `status`, which flips
        # to QUALIFIED permanently the first time and would otherwise never
        # let a failed grant call retry on a later qualification check —
        # e.g. gamification_service being briefly down must not mean this
        # friend never gets their bonus).
        friend_reward_granted = referral.friend_reward_claimed
        if all_qualified and not referral.friend_reward_claimed:
            friend_reward_granted = await self._grant_referral_success(
                referral.referred_id, f"referral_friend_bonus_{referral.id}"
            )
            referral.friend_reward_claimed = friend_reward_granted

        # Atomically claim the PENDING→QUALIFIED transition. Two concurrent
        # qualify calls for the same referral both read status=PENDING above
        # (across the slow HTTP checks), so without this claim both would
        # increment the referrer's count and could double-fire the same
        # milestone reward. Only the call whose conditional UPDATE actually
        # changes a row (rowcount 1) proceeds to increment + reward.
        claimed = False
        if all_qualified:
            claim = await self.db.execute(
                update(Referral)
                .where(Referral.id == referral.id, Referral.status == ReferralStatus.PENDING)
                .values(status=ReferralStatus.QUALIFIED, qualified_at=datetime.now(timezone.utc))
            )
            claimed = claim.rowcount > 0

        if claimed:
            await self.db.refresh(referral)
            code_result = await self.db.execute(
                select(ReferralCode).where(ReferralCode.user_id == referral.referrer_id)
            )
            code_record = code_result.scalar_one_or_none()
            if code_record:
                # Atomic increment (matches the total_referrals fix in
                # register_referral above) — a plain `+= 1` here is a
                # read-modify-write race: two referrals qualifying
                # concurrently under the same referrer could lose an
                # increment or double-fire the same milestone reward.
                incr_result = await self.db.execute(
                    update(ReferralCode)
                    .where(ReferralCode.id == code_record.id)
                    .values(qualified_referrals=ReferralCode.qualified_referrals + 1)
                    .returning(ReferralCode.qualified_referrals)
                )
                count = incr_result.scalar_one()
                if count in REFERRAL_MILESTONES:
                    reward_type = REFERRAL_MILESTONES[count]
                    reward = ReferralReward(
                        user_id=referral.referrer_id,
                        milestone=count,
                        reward_type=reward_type,
                    )
                    self.db.add(reward)
                    await self.db.flush()  # need reward.id as the payout idempotency key
                    await self._payout_reward(reward)
                    rewards_granted.append(reward_type)

        await self.db.commit()
        return {
            "qualified": all_qualified,
            "rewards_granted": rewards_granted,
            "friend_reward_granted": friend_reward_granted,
        }

    # ── Reward payout ───────────────────────────────────────────────────────────

    _PREMIUM_DAY_REWARDS = {
        "7_days_premium": 7,
        "30_days_premium": 30,
    }

    async def _payout_reward(self, reward: ReferralReward) -> None:
        """Actually grant a reward that was just recorded, so it isn't just a
        DB row nothing ever consumes. Fails soft: a payout failure (target
        service down, network error) leaves is_claimed=False for the reward
        to be retried later — it must never look claimed without having
        actually granted the benefit."""
        if reward.reward_type in self._PREMIUM_DAY_REWARDS:
            await self._grant_premium_days(reward)
        elif reward.reward_type.startswith("xp_bonus_"):
            await self._grant_xp_bonus(reward)

    async def _grant_premium_days(self, reward: ReferralReward) -> None:
        days = self._PREMIUM_DAY_REWARDS[reward.reward_type]
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(
                    f"{settings.PAYMENT_SERVICE_URL}/api/v1/payments/subscription/internal/grant",
                    json={
                        "user_id": str(reward.user_id),
                        "days": days,
                        "plan_key": "referral_reward",
                        "grant_reference": str(reward.id),
                    },
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
            if resp.status_code == 200:
                reward.is_claimed = True
        except Exception as exc:
            logger.warning("payment_service reward payout failed for reward %s: %s", reward.id, exc)

    async def _grant_xp_bonus(self, reward: ReferralReward) -> None:
        """xp_bonus_N milestones grant the fixed REFERRAL_SUCCESS XP+EduPoints
        award via gamification_service. reference_id is the reward's own id,
        so a retried payout can never double-credit."""
        granted = await self._grant_referral_success(reward.user_id, str(reward.id))
        if granted:
            reward.is_claimed = True

    async def _grant_referral_success(self, user_id: uuid.UUID, reference_id: str) -> bool:
        """Call gamification_service's fixed REFERRAL_SUCCESS XP+EduPoints
        award for a user. Used both for the referrer's xp_bonus_N milestones
        and for the referred friend's one-time welcome bonus. Returns True
        only on a confirmed successful grant."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(
                    f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/internal/referral-reward",
                    json={"user_id": str(user_id), "reference_id": reference_id},
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
            return resp.status_code == 200
        except Exception as exc:
            logger.warning("gamification_service referral-reward grant failed for %s (%s): %s", user_id, reference_id, exc)
            return False
