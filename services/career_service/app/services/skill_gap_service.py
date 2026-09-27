"""Skill gap analysis — Groq-backed readiness scoring and learning paths."""
import json
import logging
import uuid
from datetime import datetime, timezone

from groq import AsyncGroq
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.career_catalog import Career
from app.models.career_goal import CareerGoal
from app.models.skill_assessment import SkillAssessment
from app.services import gamification_client
from app.services.career_catalog_service import CareerCatalogService

logger = logging.getLogger(__name__)


class SkillGapService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_career(self, career_id: uuid.UUID) -> Career | None:
        return await CareerCatalogService(self.db).get_career(career_id)

    async def analyse_skill_gap(
        self,
        user_id: uuid.UUID,
        career_id: uuid.UUID,
        student_scores: dict,  # {"mathematics": 78, "physics": 65}
        bearer_token: str | None = None,
    ) -> dict:
        career = await self.get_career(career_id)
        if not career:
            raise ValueError("Career not found")

        analysis = await self._groq_skill_gap(career, student_scores)

        # Persist assessment
        existing = await self.db.execute(
            select(SkillAssessment).where(
                SkillAssessment.user_id == user_id,
                SkillAssessment.career_id == career_id,
            )
        )
        assessment = existing.scalar_one_or_none()
        is_new = assessment is None
        if assessment:
            assessment.ready_score     = analysis["ready_score"]
            assessment.skill_scores    = analysis["skill_scores"]
            assessment.gaps            = analysis["gaps"]
            assessment.recommendations = analysis["recommendations"]
            assessment.learning_path   = analysis["learning_path"]
            assessment.assessed_at     = datetime.now(timezone.utc)
        else:
            assessment = SkillAssessment(
                user_id=user_id,
                career_id=career_id,
                ready_score=analysis["ready_score"],
                skill_scores=analysis["skill_scores"],
                gaps=analysis["gaps"],
                recommendations=analysis["recommendations"],
                learning_path=analysis["learning_path"],
            )
            self.db.add(assessment)

        await self.db.commit()

        # Update goal progress
        goal_res = await self.db.execute(
            select(CareerGoal).where(
                CareerGoal.user_id == user_id,
                CareerGoal.career_id == career_id,
            )
        )
        goal = goal_res.scalar_one_or_none()
        if goal:
            goal.progress = analysis["ready_score"]
            await self.db.commit()

        # XP is awarded only on the first-ever assessment for this (user,
        # career) pair — re-analysing (e.g. after updating scores) never
        # re-awards it, since the assessment is upserted, not append-only.
        if is_new and bearer_token:
            await gamification_client.award_xp(user_id, "skill_gap_done", bearer_token, str(assessment.id))

        return {
            "career_id":       str(career_id),
            "career_title":    career.title,
            "ready_score":     analysis["ready_score"],
            "skill_scores":    analysis["skill_scores"],
            "gaps":            analysis["gaps"],
            "recommendations": analysis["recommendations"],
            "learning_path":   analysis["learning_path"],
            "assessed_at":     datetime.now(timezone.utc).isoformat(),
        }

    async def get_latest_assessment(self, user_id: uuid.UUID, career_id: uuid.UUID) -> dict | None:
        res = await self.db.execute(
            select(SkillAssessment, Career)
            .join(Career, Career.id == SkillAssessment.career_id)
            .where(
                SkillAssessment.user_id == user_id,
                SkillAssessment.career_id == career_id,
            )
            .order_by(SkillAssessment.assessed_at.desc())
            .limit(1)
        )
        row = res.first()
        if not row:
            return None
        assessment, career = row
        return {
            "career_id":       str(assessment.career_id),
            "career_title":    career.title,
            "ready_score":     assessment.ready_score,
            "skill_scores":    assessment.skill_scores,
            "gaps":            assessment.gaps,
            "recommendations": assessment.recommendations,
            "learning_path":   assessment.learning_path,
            "assessed_at":     assessment.assessed_at.isoformat(),
        }

    # ── Private ────────────────────────────────────────────────────────────────

    async def _groq_skill_gap(self, career: Career, student_scores: dict) -> dict:
        """Use Groq to analyse skill gaps and generate learning path."""
        try:
            client = AsyncGroq(api_key=settings.GROQ_API_KEY)

            required = career.required_subjects
            scores_text = "\n".join(f"  - {subj}: {score}%" for subj, score in student_scores.items())
            required_text = ", ".join(required)

            prompt = (
                f"Career Goal: {career.title}\n"
                f"Required subjects: {required_text}\n"
                f"Student's current performance:\n{scores_text}\n\n"
                "Analyse the skill gap and return a JSON object with:\n"
                "- ready_score: float 0-100 (how ready student is)\n"
                "- skill_scores: dict of subject→score (fill in 0 for missing subjects)\n"
                "- gaps: array of {subject, current_score, target_score, gap_label} objects\n"
                "- recommendations: array of 3-5 actionable strings\n"
                "- learning_path: array of {step, title, description, duration, priority} objects\n"
                "Return ONLY valid JSON."
            )

            resp = await client.chat.completions.create(
                model=settings.GROQ_MODEL,
                messages=[
                    {"role": "system", "content": "You are a career guidance expert. Return only valid JSON."},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=2000,
                temperature=0.3,
            )
            raw = resp.choices[0].message.content.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            return json.loads(raw)

        except Exception as e:
            logger.warning("Groq skill gap analysis failed, using fallback: %s", e)
            return self._fallback_skill_gap(career, student_scores)

    @staticmethod
    def _fallback_skill_gap(career: Career, student_scores: dict) -> dict:
        required = career.required_subjects
        skill_scores = {}
        gaps = []
        total = 0
        for subj in required:
            subj_lower = subj.lower()
            score = next(
                (v for k, v in student_scores.items() if k.lower() in subj_lower or subj_lower in k.lower()),
                0
            )
            skill_scores[subj] = score
            total += score
            if score < 70:
                gaps.append({"subject": subj, "current_score": score, "target_score": 75, "gap_label": "Needs improvement"})

        ready_score = (total / len(required)) if required else 50.0
        return {
            "ready_score":     round(ready_score, 1),
            "skill_scores":    skill_scores,
            "gaps":            gaps,
            "recommendations": [
                f"Focus on improving {g['subject']}" for g in gaps[:3]
            ] or ["Keep up the great work!"],
            "learning_path": [
                {"step": i + 1, "title": f"Master {subj}", "description": f"Study {subj} fundamentals", "duration": "2 weeks", "priority": "high" if skill_scores.get(subj, 0) < 50 else "medium"}
                for i, subj in enumerate(required[:5])
            ],
        }
