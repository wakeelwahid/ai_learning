"""
Battle lifecycle — room creation, AI question generation (Groq), joining
and starting. Question generation lives here because it is tightly coupled
to battle creation (a battle is never created without its question set).
"""
import json
import logging
import random
import secrets
import string
import uuid
from datetime import datetime

from groq import AsyncGroq
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis_state import RedisBattleState
from app.crud import lifecycle_crud, query_crud
from app.models.battle import Battle, BattleStatus, BattleType
from app.models.participant import BattleParticipant, ParticipantStatus
from app.services._common import get_battle_or_raise
from app.services.battle_gamification_client import BattleGamificationClient

logger = logging.getLogger(__name__)


class BattleLifecycleService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.gamification = BattleGamificationClient(db)

    # ── Room Management ────────────────────────────────────────────────────────

    async def create_battle(
        self,
        host_user_id: uuid.UUID,
        battle_type: str,
        subject: str | None,
        topic: str | None,
        board: str | None,
        class_num: int | None,
        difficulty: str,
        question_count: int,
        time_limit_sec: int,
        max_players: int,
        display_name: str,
        avatar_url: str | None = None,
        team_a_name: str | None = None,
        team_b_name: str | None = None,
        class_a: str | None = None,
        class_b: str | None = None,
        school_a: str | None = None,
        school_b: str | None = None,
        scheduled_at: datetime | None = None,
        stake_xp: int = 0,
    ) -> Battle:
        # Generate invite code for non-solo, non-public battles
        invite_code = None
        private_types = ("1v1", "group", "class_battle", "school_battle", "team", "study_party")
        open_lobby_types = ("public", "subject", "chapter")
        if battle_type in private_types:
            invite_code = self._gen_invite_code()
        elif battle_type in open_lobby_types:
            # These battles are surfaced in the open lobby (GET /battles/open)
            # and must remain joinable via the invite-code-based join endpoints
            # (/{battle_id}/join, /{battle_id}/join-by-id, /join), which only
            # resolve battles by invite_code. Without this, an open battle has
            # a share_code but no working join path.
            invite_code = self._gen_invite_code()

        # Public/subject/chapter battles get a share_code for deep links
        share_code = self._gen_share_code() if battle_type in ("public", "subject", "chapter", "team") else None

        questions = await self._generate_questions(
            subject=subject, topic=topic, board=board,
            class_num=class_num, difficulty=difficulty, count=question_count,
        )

        battle = Battle(
            battle_type=BattleType(battle_type),
            host_user_id=host_user_id,
            subject=subject,
            topic=topic,
            board=board,
            class_num=class_num,
            difficulty=difficulty,
            question_count=question_count,
            time_limit_sec=time_limit_sec,
            max_players=max_players,
            invite_code=invite_code,
            share_code=share_code,
            questions=questions,
            team_a_name=team_a_name or "Team A",
            team_b_name=team_b_name or "Team B",
            class_a=class_a,
            class_b=class_b,
            school_a=school_a,
            school_b=school_b,
            scheduled_at=scheduled_at,
            stake_xp=stake_xp,
        )
        await lifecycle_crud.insert_battle(self.db, battle)

        host = BattleParticipant(
            battle_id=battle.id,
            user_id=host_user_id,
            display_name=display_name,
            avatar_url=avatar_url,
            status=ParticipantStatus.JOINED,
            team="A" if battle_type == "team" else None,
        )
        await lifecycle_crud.insert_participant(self.db, host)

        # For solo battles, add an AI opponent immediately
        if battle_type == "solo":
            ai = BattleParticipant(
                battle_id=battle.id,
                is_ai=True,
                display_name=f"AI ({difficulty.title()})",
                status=ParticipantStatus.READY,
            )
            await lifecycle_crud.insert_participant(self.db, ai)
            battle.status = BattleStatus.STARTING

        return await lifecycle_crud.commit_and_refresh(self.db, battle)

    async def seed_test_data(self, host_user_id: uuid.UUID, display_name: str) -> dict:
        """Create 7 sample battles covering key battle types for testing/demo."""
        created = []
        types = [
            ("solo",         "Physics",    "Mechanics",       "easy",   10),
            ("1v1",          "Chemistry",  "Periodic Table",  "hard",   10),
            ("group",        "Biology",    "Cell Biology",    "medium", 10),
            ("public",       "Mathematics","Algebra",         "medium", 15),
            ("team",         "History",    "World War 2",     "easy",   15),
            ("subject",      "Physics",    None,              "medium", 10),
            ("study_party",  "Science",    "General Science", "easy",   10),
        ]
        for b_type, subject, topic, diff, qcount in types:
            b = await self.create_battle(
                host_user_id=host_user_id,
                battle_type=b_type,
                subject=subject,
                topic=topic,
                board="CBSE",
                class_num=10,
                difficulty=diff,
                question_count=qcount,
                time_limit_sec=300,
                max_players=20 if b_type in ("public", "subject") else 10,
                display_name=display_name,
                team_a_name="Red Team" if b_type == "team" else None,
                team_b_name="Blue Team" if b_type == "team" else None,
            )
            created.append({"id": str(b.id), "type": b_type, "subject": subject})
        return {"seeded": len(created), "battles": created}

    async def join_battle(
        self,
        invite_code: str,
        user_id: uuid.UUID,
        display_name: str,
        avatar_url: str | None = None,
    ) -> Battle:
        battle = await lifecycle_crud.get_battle_by_invite_code(self.db, invite_code)
        if not battle:
            raise ValueError("Invalid invite code or battle already started")

        # Stake battles: the joiner must hold the stake, or they couldn't pay
        # on a loss. Enforced server-side so share-link deep joins can't skip it.
        if (battle.stake_xp or 0) > 0 and user_id != battle.host_user_id:
            xp = await self.gamification.get_user_xp(user_id)
            if xp is None:
                raise ValueError("XP check is temporarily unavailable — please try again in a moment")
            if xp < battle.stake_xp:
                raise ValueError(
                    f"You need at least {battle.stake_xp} XP to join this stake battle (you have {xp})"
                )

        existing = await lifecycle_crud.get_participant_by_battle_and_user(self.db, battle.id, user_id)
        if existing:
            raise ValueError("Already in this battle")

        current_count = await lifecycle_crud.count_participants(self.db, battle.id)
        if current_count >= battle.max_players:
            raise ValueError("Battle is full")

        participant = BattleParticipant(
            battle_id=battle.id,
            user_id=user_id,
            display_name=display_name,
            avatar_url=avatar_url,
            status=ParticipantStatus.JOINED,
        )
        await lifecycle_crud.insert_participant(self.db, participant)

        if current_count + 1 >= battle.max_players:
            battle.status = BattleStatus.STARTING

        return await lifecycle_crud.commit_and_refresh(self.db, battle)

    async def start_battle(self, battle_id: uuid.UUID) -> Battle:
        battle = await get_battle_or_raise(self.db, battle_id)
        battle = await lifecycle_crud.set_battle_active(self.db, battle)

        # Seed live state into Redis for zero-DB gameplay
        participants = await query_crud.get_participants_for_battle(self.db, battle_id)
        players = [
            {"user_id": str(p.user_id), "display_name": p.display_name, "avatar_url": p.avatar_url}
            for p in participants if p.user_id and not p.is_ai
        ]
        try:
            await RedisBattleState.init_battle(
                battle_id=str(battle_id),
                questions=battle.questions or [],
                time_limit_sec=battle.time_limit_sec,
                players=players,
            )
        except Exception as exc:
            logger.warning("Redis init_battle skipped (DB-only fallback): %s", exc)

        return battle

    # ── Question generation ────────────────────────────────────────────────────

    async def _generate_questions(
        self,
        subject: str | None,
        topic: str | None,
        board: str | None,
        class_num: int | None,
        difficulty: str,
        count: int,
    ) -> list[dict]:
        """Generate questions via Groq LLM; fallback to subject-specific defaults."""
        try:
            client = AsyncGroq(api_key=settings.GROQ_API_KEY)
            ctx_parts = []
            if board:     ctx_parts.append(f"Board: {board}")
            if class_num: ctx_parts.append(f"Class: {class_num}")
            if subject:   ctx_parts.append(f"Subject: {subject}")
            if topic:     ctx_parts.append(f"Topic: {topic}")
            ctx = ", ".join(ctx_parts) if ctx_parts else "General Knowledge"

            prompt = (
                f"{ctx}\n\nGenerate {count} multiple-choice questions ({difficulty} difficulty) "
                f"for a competitive quiz battle. Return ONLY a JSON array where each element has: "
                f"text (question), options (array of 4 strings), correct_answer (the exact correct option string), "
                f"subject (string), topic (string). No markdown fences."
            )
            resp = await client.chat.completions.create(
                model=settings.GROQ_MODEL,
                messages=[
                    {"role": "system", "content": "You are an Indian school quiz master. Generate competitive MCQ questions. Return only valid JSON array."},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=3000,
                temperature=0.6,
            )
            raw = resp.choices[0].message.content.strip()
            # Strip markdown fences if present
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            questions = json.loads(raw)
            if isinstance(questions, list) and len(questions) >= count:
                return questions[:count]
        except Exception as e:
            logger.warning("Groq question generation failed, using fallback: %s", e)

        return self._fallback_questions(subject, count)

    def _fallback_questions(self, subject: str | None, count: int) -> list[dict]:
        bank = [
            {"text": "What is the powerhouse of the cell?",         "options": ["Nucleus", "Mitochondria", "Ribosome", "Golgi body"],   "correct_answer": "Mitochondria",  "subject": "Biology", "topic": "Cell Structure"},
            {"text": "What is Newton's Second Law?",                 "options": ["F=ma", "E=mc²", "PV=nRT", "v=u+at"],                   "correct_answer": "F=ma",           "subject": "Physics",  "topic": "Laws of Motion"},
            {"text": "Which gas do plants absorb?",                  "options": ["Oxygen", "Nitrogen", "Carbon Dioxide", "Hydrogen"],    "correct_answer": "Carbon Dioxide", "subject": "Biology",  "topic": "Photosynthesis"},
            {"text": "What is the atomic number of Carbon?",         "options": ["4", "6", "8", "12"],                                   "correct_answer": "6",              "subject": "Chemistry","topic": "Periodic Table"},
            {"text": "Solve: If 2x + 3 = 11, then x = ?",          "options": ["3", "4", "5", "6"],                                    "correct_answer": "4",              "subject": "Math",     "topic": "Linear Equations"},
            {"text": "Speed of light in vacuum (approx)?",          "options": ["3×10⁸ m/s", "3×10⁶ m/s", "3×10¹⁰ m/s", "3×10⁴ m/s"],"correct_answer": "3×10⁸ m/s",     "subject": "Physics",  "topic": "Optics"},
            {"text": "Chemical formula of water?",                  "options": ["H₂O", "CO₂", "NaCl", "O₂"],                           "correct_answer": "H₂O",            "subject": "Chemistry","topic": "Basic Chemistry"},
            {"text": "Area of a circle with radius r?",             "options": ["πr²", "2πr", "πr", "2πr²"],                          "correct_answer": "πr²",            "subject": "Math",     "topic": "Geometry"},
            {"text": "Who discovered Penicillin?",                  "options": ["Marie Curie", "Louis Pasteur", "Alexander Fleming", "Edward Jenner"], "correct_answer": "Alexander Fleming", "subject": "Science", "topic": "Discoveries"},
            {"text": "Ohm's Law states V = ?",                      "options": ["IR", "P/I", "I/R", "P/R"],                            "correct_answer": "IR",             "subject": "Physics",  "topic": "Electricity"},
            {"text": "HCF of 12 and 18?",                          "options": ["2", "4", "6", "9"],                                    "correct_answer": "6",              "subject": "Math",     "topic": "HCF & LCM"},
            {"text": "In photosynthesis, what is produced?",        "options": ["CO₂ & H₂O", "O₂ & Glucose", "H₂ & O₂", "CO & H₂O"], "correct_answer": "O₂ & Glucose",   "subject": "Biology",  "topic": "Photosynthesis"},
            {"text": "Value of g (acceleration due to gravity)?",   "options": ["9.8 m/s²", "10 m/s²", "8 m/s²", "12 m/s²"],         "correct_answer": "9.8 m/s²",       "subject": "Physics",  "topic": "Gravitation"},
            {"text": "Molecular weight of CO₂?",                   "options": ["28", "44", "32", "40"],                               "correct_answer": "44",             "subject": "Chemistry","topic": "Molar Mass"},
            {"text": "√169 = ?",                                   "options": ["11", "12", "13", "14"],                               "correct_answer": "13",             "subject": "Math",     "topic": "Square Roots"},
        ]
        random.shuffle(bank)
        selected = bank[:count]
        while len(selected) < count:
            selected.extend(bank[:count - len(selected)])
        return selected[:count]

    # ── Code generation ────────────────────────────────────────────────────────

    @staticmethod
    def _gen_code(length: int) -> str:
        chars = string.ascii_uppercase + string.digits
        return "".join(secrets.choice(chars) for _ in range(length))

    @staticmethod
    def _gen_invite_code(length: int = 6) -> str:
        return BattleLifecycleService._gen_code(length)

    @staticmethod
    def _gen_share_code(length: int = 8) -> str:
        return BattleLifecycleService._gen_code(length)
