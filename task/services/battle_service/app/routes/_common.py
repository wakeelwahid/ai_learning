import uuid

from fastapi import HTTPException

from app.core.dependencies import ADMIN_ROLES


def require_self_or_admin(target_user_id: uuid.UUID, claims: dict) -> uuid.UUID:
    """Raise 403 unless the verified JWT belongs to target_user_id or an admin.

    Returns the caller's own id (from the token) on success.
    """
    caller_id = uuid.UUID(claims["sub"])
    if caller_id != target_user_id and claims.get("role") not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Not authorized to access this user's data")
    return caller_id


def strip_answers(questions: list[dict]) -> list[dict]:
    """Return questions without correct_answer field — send to client."""
    return [
        {
            "idx":     i,
            "text":    q.get("text", ""),
            "options": q.get("options", []),
            "subject": q.get("subject"),
            "topic":   q.get("topic"),
        }
        for i, q in enumerate(questions)
    ]


def client_question(q: dict, idx: int) -> dict:
    return {
        "idx":     idx,
        "text":    q.get("text", ""),
        "options": q.get("options", []),
        "subject": q.get("subject"),
        "topic":   q.get("topic"),
    }
