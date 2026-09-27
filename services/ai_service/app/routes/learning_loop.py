import logging
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id
from app.database.session import get_db
from app.schemas.ai import FlashcardsRequest, MistakeAnalysisRequest, MistakeAnalysisResponse, RevisionPlanRequest
from app.services import llm_service, usage_tracker
from app.services.generation_service import _parse_json

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["ai"])


async def _generate_json_with_retry(system: str, user_msg: str, *, max_tokens: int,
                                     temperature: float, required_keys: tuple[str, ...]) -> dict:
    """Generate + parse JSON, retrying once on a malformed/empty-shaped reply.

    llama3.1:8b occasionally returns syntactically-valid-but-wrong-shaped JSON
    (e.g. a per-item array instead of one combined object, or a required key
    present but an empty list) — live-observed maybe 1-in-3 on some prompts.
    A single independent resample very often lands on a well-shaped reply
    since it's a fresh, uncorrelated draw from the model. Nudging the
    temperature down on the retry favors the more literal/instruction-
    following mode over a repeat of whatever produced the bad shape.
    """
    last_exc: Exception | None = None
    for attempt, temp in enumerate((temperature, max(0.1, temperature - 0.2))):
        try:
            raw, _provider = await llm_service.generate(system, user_msg, max_tokens=max_tokens, temperature=temp, json_mode=True)
            data = _parse_json(raw)
            if isinstance(data, dict) and all(data.get(k) for k in required_keys):
                return data
            last_exc = ValueError(f"missing/empty required key(s) {required_keys} (attempt {attempt + 1})")
        except Exception as exc:  # noqa
            last_exc = exc
    raise last_exc or ValueError("generation failed")


# ── Learning Loop ─────────────────────────────────────────────────────────────

@router.post("/mistake-analysis", response_model=MistakeAnalysisResponse)
async def mistake_analysis(
    body: MistakeAnalysisRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Analyse wrong quiz answers and return per-mistake explanations.
    Uses the shared Groq → Claude → OpenAI → Ollama fallback chain — this
    route previously called GroqService directly with no fallback at all,
    so with only a Groq key configured (or none), it always degraded to
    the canned per-mistake template below instead of ever trying Ollama.

    Was premium-plan-only (403 for everyone else); now admin-configurable
    daily quota via FeatureUsageService — free users get a limited number
    of uses/day (set from the admin panel) instead of zero."""
    await usage_tracker.check_and_log(db, str(user_id), "mistake_analysis")
    mistakes_text = "\n".join(
        f"{i+1}. Q: {m.question}\n   Student answered: {m.user_answer}\n   Correct answer: {m.correct_answer}"
        + (f"\n   Topic: {m.topic}" if m.topic else "")
        + (f"\n   Subject: {m.subject}" if m.subject else "")
        for i, m in enumerate(body.mistakes)
    )
    context = ""
    if body.board:     context += f"Board: {body.board}. "
    if body.class_num: context += f"Class: {body.class_num}."

    system = (
        "You are an expert Indian school teacher. Analyse each student mistake and return a JSON object "
        "with two keys: \"explanations\" (array) and \"weak_topics\" (array of unique topic strings). "
        "Each explanation object must have: question, correct_answer, explanation (2-3 sentences), "
        "tip (one actionable study tip), concept (the underlying concept name). "
        "Return ONLY valid JSON, no markdown fences."
    )
    user_msg = f"{context}\n\nStudent mistakes:\n{mistakes_text}"

    try:
        data = await _generate_json_with_retry(system, user_msg, max_tokens=2048, temperature=0.3,
                                                 required_keys=("explanations",))
        return MistakeAnalysisResponse(
            explanations=data.get("explanations", []),
            weak_topics=data.get("weak_topics", []),
        )
    except Exception as exc:
        logger.warning("mistake-analysis fallback: %s", exc)
        return MistakeAnalysisResponse(
            explanations=[
                {
                    "question":       m.question,
                    "correct_answer": m.correct_answer,
                    "explanation":    f"The correct answer is {m.correct_answer}. Review this concept carefully.",
                    "tip":            "Revisit your textbook notes on this topic.",
                    "concept":        m.topic or "General",
                }
                for m in body.mistakes
            ],
            weak_topics=list({m.topic for m in body.mistakes if m.topic}),
        )


@router.post("/flashcards")
async def generate_flashcards(
    body: FlashcardsRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Generate flashcard Q&A pairs for a topic (Groq → Claude → OpenAI → Ollama).

    Was basic-plan-only (403 for free users); now admin-configurable daily
    quota via FeatureUsageService."""
    await usage_tracker.check_and_log(db, str(user_id), "flashcards")
    topic     = body.topic
    subject   = body.subject or ""
    chapter   = body.chapter or ""
    board     = body.board or ""
    class_num = body.class_num
    count     = body.count

    context = " | ".join(filter(None, [
        f"Board: {board}" if board else "",
        f"Class: {class_num}" if class_num else "",
        f"Subject: {subject}" if subject else "",
        f"Chapter: {chapter}" if chapter else "",
    ]))
    system = (
        "You are an expert Indian school teacher. Generate exactly the requested number of flashcards for the given topic. "
        "Return ONLY a valid JSON object with key \"flashcards\" — an array where each item has: "
        "\"front\" (a concise question), \"back\" (the complete answer), \"hint\" (a one-line memory hint). "
        "No markdown fences, no extra keys."
    )
    user_msg = f"{context}\nTopic: {topic}\nGenerate {count} flashcards."

    try:
        data = await _generate_json_with_retry(system, user_msg, max_tokens=2048, temperature=0.4,
                                                 required_keys=("flashcards",))
        flashcards = data.get("flashcards", [])
        if not flashcards:
            raise ValueError("empty flashcards list")
    except Exception as exc:
        logger.warning("flashcards fallback: %s", exc)
        flashcards = [
            {"front": f"What is {topic}?", "back": f"{topic} is a key concept in {subject or 'this subject'}.", "hint": f"Think about {topic}."}
            for _ in range(min(count, 3))
        ]

    return {"flashcards": flashcards, "topic": topic}


@router.post("/revision-plan")
async def generate_revision_plan(
    body: RevisionPlanRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Generate a day-wise revision plan for weak topics (Groq → Claude → OpenAI → Ollama).

    Was premium-plan-only (403 for everyone else); now admin-configurable
    daily quota via FeatureUsageService."""
    await usage_tracker.check_and_log(db, str(user_id), "revision_plan")
    weak_topics = body.weak_topics
    board       = body.board or ""
    class_num   = body.class_num
    days        = body.days

    if not weak_topics:
        return {"plan": [], "summary": "No weak topics provided."}

    topics_text = "\n".join(
        f"- {t.get('topic', t) if isinstance(t, dict) else t}"
        + (f" ({t['subject']}, accuracy {t['accuracy']}%)" if isinstance(t, dict) and "accuracy" in t else "")
        for t in weak_topics
    )
    context = " | ".join(filter(None, [
        f"Board: {board}" if board else "",
        f"Class: {class_num}" if class_num else "",
    ]))
    system = (
        "You are an expert Indian school teacher creating a revision plan. "
        "Return ONLY valid JSON with keys: \"plan\" (array of day objects) and \"summary\" (string). "
        "Each day object: {\"day\": int, \"date_label\": string, \"topics\": [string], \"actions\": [string], \"focus\": string}. "
        "No markdown fences."
    )
    user_msg = f"{context}\nWeak topics:\n{topics_text}\nCreate a {days}-day revision plan."

    try:
        data = await _generate_json_with_retry(system, user_msg, max_tokens=3000, temperature=0.4,
                                                 required_keys=("plan",))
        if not data.get("plan"):
            raise ValueError("empty plan list")
        return data
    except Exception as exc:
        logger.warning("revision-plan fallback: %s", exc)
        return {
            "plan": [{"day": i + 1, "date_label": f"Day {i + 1}", "topics": [t.get("topic", str(t)) if isinstance(t, dict) else str(t) for t in weak_topics[:2]], "actions": ["Review notes", "Practice problems"], "focus": "Revision"} for i in range(min(days, 3))],
            "summary": f"Revision plan for {len(weak_topics)} weak topic(s) over {days} days.",
        }
