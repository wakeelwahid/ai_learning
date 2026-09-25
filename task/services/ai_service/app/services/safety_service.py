"""Safety filter — input guardrails and hallucination detection."""
import logging
import re

logger = logging.getLogger(__name__)

_INPUT_BLOCKED = [
    r"\b(porn|sex(?:ual)?|nude|naked)\b",
    r"\b(kill|murder|suicide|self[\s-]?harm)\b",
    r"\b(drug[s]?|cocaine|heroin|meth)\b",
    r"\b(hack|exploit|malware|phishing)\b",
    r"\b(terrorist|bomb|weapon[s]?)\b",
    r"\bcheat\s+(on\s+)?exam\b",
]

_HALLUCINATION_SIGNALS = [
    "as of my knowledge cutoff",
    "according to recent studies",
    "research shows that",
    "scientists have recently",
    "in a 20",          # catches "in a 2023/2024 paper"
    "it has been proven",
    "new studies suggest",
]

_UNCERTAINTY_OK = [
    "i don't have information",
    "not in the syllabus",
    "not covered in",
    "this specific detail isn't",
    "the provided material doesn't",
]


class SafetyService:
    def check_input(self, query: str) -> tuple[bool, str]:
        """(is_safe, rejection_reason). Returns (True, '') if clean."""
        q = query.lower().strip()
        if len(q) < 3:
            return False, "Please ask a complete question."
        if len(query) > 4000:
            return False, "Your question is too long. Please be more concise."
        for pattern in _INPUT_BLOCKED:
            if re.search(pattern, q):
                logger.warning("Blocked input pattern: %s", pattern)
                return False, "This type of question cannot be processed."
        return True, ""

    def check_output(self, answer: str, context_chunks: list[dict]) -> tuple[str, dict]:
        """Validate answer, return (sanitized_answer, meta). meta includes grounding info."""
        meta: dict = {"grounded": True, "hallucination_warning": False, "truncated": False}

        if context_chunks:
            a_lower = answer.lower()
            signals = [s for s in _HALLUCINATION_SIGNALS if s in a_lower]
            any_uncertainty = any(p in a_lower for p in _UNCERTAINTY_OK)
            if signals and not any_uncertainty:
                logger.warning("Hallucination signals detected: %s", signals)
                meta["grounded"] = False
                meta["hallucination_warning"] = True
                answer += "\n\n*Note: Please verify this information against your textbook.*"

        if len(answer) > 3500:
            answer = answer[:3500] + "\n\n*[Response truncated for length.]*"
            meta["truncated"] = True

        return answer, meta

    def log_query(self, query: str, intent: str, service: str = "ai_service") -> None:
        logger.info(
            "AI query | service=%s intent=%s query_len=%d preview=%s",
            service, intent, len(query), query[:80].replace("\n", " "),
        )
