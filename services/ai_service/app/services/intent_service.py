"""Query intent classifier — routes queries to the right RAG handler."""
import re
from enum import Enum


class QueryIntent(str, Enum):
    FACTUAL = "factual"
    CONCEPTUAL = "conceptual"
    PROBLEM_SOLVING = "problem_solving"
    PRACTICE = "practice"
    DEFINITION = "definition"
    OUT_OF_SCOPE = "out_of_scope"


_PATTERNS: dict[QueryIntent, list[str]] = {
    QueryIntent.PROBLEM_SOLVING: [
        r"\bsolve\b", r"\bcalculate\b", r"\bfind\s+the\b", r"\bprove\b",
        r"\bcompute\b", r"\b\d+\s*[+\-*/^]\s*\d+\b", r"\bequation\b",
        r"\bderive\b", r"\bintegrate\b", r"\bdifferentiate\b",
    ],
    QueryIntent.PRACTICE: [
        r"\bpractice\b", r"\bquestions?\b", r"\btest\s+me\b",
        r"\bexercise[s]?\b", r"\bgive\s+me\s+(some\s+)?example[s]?\b",
        r"\bmore\s+problem[s]?\b", r"\bquiz\b",
    ],
    QueryIntent.DEFINITION: [
        r"\bdefine\b", r"\bdefinition\b", r"\bwhat\s+is\s+meant\b",
        r"\bmeaning\s+of\b", r"\bwhat\s+do\s+you\s+mean\s+by\b",
    ],
    QueryIntent.FACTUAL: [
        r"^what\s+is\b", r"^what\s+are\b", r"^who\s+(is|was|invented)\b",
        r"^where\b", r"^when\b", r"\bname\s+the\b", r"\blist\s+the\b",
        r"^how\s+many\b", r"^how\s+much\b",
    ],
    QueryIntent.CONCEPTUAL: [
        r"^why\b", r"^how\s+does\b", r"^how\s+do\b", r"\bexplain\b",
        r"\bdescribe\b", r"\bdifference\s+between\b", r"\bcompare\b",
        r"\bwhat\s+happens\b", r"\brelationship\b",
    ],
}

_OUT_OF_SCOPE = [
    r"\b(porn|sex(?:ual)?|nude|naked)\b",
    r"\b(kill|murder|suicide|self[\s-]?harm)\b",
    r"\b(drug[s]?|cocaine|heroin|meth(?:amphetamine)?)\b",
    r"\b(hack|exploit|malware|phishing|crack\s+password)\b",
    r"\b(terrorist|bomb|weapon[s]?)\b",
    r"\bcheat\s+(on\s+)?exam\b",
    r"\banswer\s+key\s+leak\b",
]


class IntentService:
    def classify(self, query: str) -> QueryIntent:
        q = query.lower().strip()
        for p in _OUT_OF_SCOPE:
            if re.search(p, q):
                return QueryIntent.OUT_OF_SCOPE
        scores: dict[QueryIntent, int] = {}
        for intent, patterns in _PATTERNS.items():
            scores[intent] = sum(1 for p in patterns if re.search(p, q))
        best = max(scores, key=lambda k: scores[k])
        return best if scores[best] > 0 else QueryIntent.FACTUAL

    def should_use_rag(self, intent: QueryIntent) -> bool:
        return intent not in (QueryIntent.PRACTICE, QueryIntent.OUT_OF_SCOPE)

    def intent_hint(self, intent: QueryIntent) -> str:
        hints = {
            QueryIntent.FACTUAL: "Answer factually and concisely.",
            QueryIntent.CONCEPTUAL: "Explain the concept clearly with an analogy if helpful.",
            QueryIntent.PROBLEM_SOLVING: "Show step-by-step working. Include units where applicable.",
            QueryIntent.PRACTICE: "Generate 3–5 practice questions based on the topic.",
            QueryIntent.DEFINITION: "State the formal definition, then give an example.",
            QueryIntent.OUT_OF_SCOPE: "",
        }
        return hints.get(intent, "")
