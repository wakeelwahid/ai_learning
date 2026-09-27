"""
Deterministic, LLM-free question generator.

Used as a fallback when no LLM (Ollama / Groq / OpenAI / Anthropic) is reachable,
so the generation pipeline ALWAYS produces a usable, structurally-valid paper
instead of failing. When the LLM later becomes available it takes precedence.

Strategy:
  1. CLOZE from context — if RAG context (ingested syllabus) is available, build
     fill-in-the-blank MCQs from real sentences: blank a salient term, use it as
     the correct option, draw distractors from other salient terms in the corpus.
     These are genuinely grounded in the source material.
  2. CONCEPT fallback — when context is thin, emit a small set of structured
     conceptual prompts for the chapter so the paper is never empty.

Output shape matches generation_service.generate_mcqs():
  {question, options[], answer, explanation}
"""
import re

# Common words we never blank out or use as answer terms.
_STOP = {
    "the", "and", "for", "are", "but", "not", "you", "all", "any", "can", "her",
    "was", "one", "our", "out", "his", "has", "had", "him", "she", "this", "that",
    "with", "from", "they", "have", "been", "were", "their", "which", "while",
    "when", "what", "where", "there", "these", "those", "such", "into", "than",
    "then", "them", "also", "each", "other", "some", "most", "more", "very",
    "will", "would", "could", "should", "about", "between", "because", "during",
    "called", "known", "used", "using", "made", "many", "much", "both", "after",
    "before", "above", "below", "over", "under", "form", "forms", "type", "types",
}

_WORD = re.compile(r"[A-Za-z][A-Za-z\-]{3,}")


def _sentences(text: str) -> list[str]:
    # Drop the curriculum meta hint line ("Board: .., Class: .., Subject: ..")
    # and the "Reference material:" label that gather_context prepends.
    text = re.sub(r"Board:.*?Topic:[^.]*\.", " ", text or "")
    text = text.replace("Reference material:", " ")
    text = re.sub(r"\s+", " ", text).strip()
    parts = re.split(r"(?<=[.!?])\s+", text)
    out = []
    for p in parts:
        p = p.strip()
        if 40 <= len(p) <= 240 and " " in p and not p.lower().startswith(("board:", "class:", "subject:")):
            out.append(p)
    return out


def _salient_terms(text: str) -> list[str]:
    """Frequency-ranked informative terms across the whole corpus (for distractors)."""
    freq: dict[str, int] = {}
    for m in _WORD.finditer(text):
        w = m.group(0)
        lw = w.lower()
        if lw in _STOP:
            continue
        freq[w] = freq.get(w, 0) + 1
    # Prefer capitalised / longer / frequent terms.
    return sorted(freq, key=lambda w: (freq[w], len(w), w[:1].isupper()), reverse=True)


def _pick_term(sentence: str, used: set[str]) -> str | None:
    """Choose the most informative word in a sentence to blank out."""
    cands = [m.group(0) for m in _WORD.finditer(sentence) if m.group(0).lower() not in _STOP]
    cands = [c for c in cands if c.lower() not in used]
    if not cands:
        return None
    # Prefer capitalised terms (proper nouns / key concepts), then longer words.
    cands.sort(key=lambda w: (w[:1].isupper(), len(w)), reverse=True)
    return cands[0]


def _distractors(answer: str, pool: list[str], n: int = 3) -> list[str]:
    out: list[str] = []
    al = answer.lower()
    for w in pool:
        if w.lower() == al or w.lower() in {o.lower() for o in out}:
            continue
        # similar length makes plausible distractors
        if abs(len(w) - len(answer)) <= 4:
            out.append(w)
        if len(out) >= n:
            break
    # top up if not enough close-length terms
    for w in pool:
        if len(out) >= n:
            break
        if w.lower() != al and w.lower() not in {o.lower() for o in out}:
            out.append(w)
    return out[:n]


def _cloze_questions(context: str, count: int) -> list[dict]:
    sents = _sentences(context)
    pool = _salient_terms(context)
    if not sents or len(pool) < 4:
        return []

    out: list[dict] = []
    used: set[str] = set()
    for s in sents:
        if len(out) >= count:
            break
        term = _pick_term(s, used)
        if not term:
            continue
        used.add(term.lower())
        # blank the first occurrence of the term in the sentence
        blanked = re.sub(re.escape(term), "______", s, count=1)
        distract = _distractors(term, pool, n=3)
        if len(distract) < 3:
            continue
        options = distract + [term]
        # deterministic, non-trivial ordering: rotate by sentence length
        rot = len(s) % len(options)
        options = options[rot:] + options[:rot]
        out.append({
            "question": f"Fill in the blank: {blanked}",
            "options": options,
            "answer": term,
            "explanation": f"From the source material: \"{s}\"",
        })
    return out


def _concept_questions(meta: dict, count: int) -> list[dict]:
    chapter = meta.get("chapter") or meta.get("topic") or meta.get("subject") or "this chapter"
    subject = meta.get("subject") or "the subject"
    templates = [
        (f"Which of the following is a key topic covered in '{chapter}'?",
         [f"Core concepts of {chapter}", "An unrelated historical event",
          "A random geographical fact", "A topic from a different subject"],
         f"Core concepts of {chapter}",
         f"'{chapter}' focuses on its own core concepts within {subject}."),
        (f"To master '{chapter}', a student should primarily focus on:",
         ["Understanding definitions and solving practice problems",
          "Memorising unrelated trivia", "Skipping the fundamentals",
          "Only reading the chapter title"],
         "Understanding definitions and solving practice problems",
         "Concept clarity plus practice is the most effective study method."),
        (f"In the context of {subject}, '{chapter}' is best learned by:",
         ["Linking theory to worked examples", "Avoiding all examples",
          "Ignoring the textbook", "Guessing without study"],
         "Linking theory to worked examples",
         "Worked examples connect theory to application."),
    ]
    out: list[dict] = []
    i = 0
    while len(out) < count and templates:
        q, opts, ans, exp = templates[i % len(templates)]
        suffix = "" if i < len(templates) else f" (set {i // len(templates) + 1})"
        out.append({
            "question": q + suffix,
            "options": list(opts),
            "answer": ans,
            "explanation": exp,
        })
        i += 1
        if i > count + len(templates):
            break
    return out


def generate_offline(context: str, meta: dict, count: int = 8, difficulty: str = "medium") -> list[dict]:
    """Return up to `count` raw MCQs (no LLM). Always returns at least 1."""
    count = max(1, min(int(count), 30))
    items = _cloze_questions(context or "", count)
    if len(items) < count:
        items += _concept_questions(meta, count - len(items))
    return items[:count]
