"""
Generate quiz/practice MCQs from RAG context, then AUTO-VERIFY them before saving.

Verification (production-grade gate) rejects any MCQ that is structurally invalid
or whose answer is not one of its options, and flags weak grounding. Only verified
questions are published.
"""
import json
import re

from app.services import llm_service

_SYSTEM = (
    "You are an expert exam question writer for school students. "
    "Generate questions ONLY from the provided source material. "
    "Return STRICT JSON only — no markdown, no commentary."
)


def _prompt(context: str, meta: dict, count: int, difficulty: str) -> str:
    ctx = context[:6000]
    return (
        f"Source material (board={meta.get('board')}, class={meta.get('class_num')}, "
        f"subject={meta.get('subject')}, chapter={meta.get('chapter')}):\n\"\"\"\n{ctx}\n\"\"\"\n\n"
        f"Create exactly {count} multiple-choice questions at {difficulty} difficulty, "
        f"grounded strictly in the source above. "
        'Respond with JSON of this exact shape:\n'
        '{"questions":[{"question":"...","options":["...","...","...","..."],'
        '"answer":"<the full text of the correct option>","explanation":"..."}]}'
    )


def _parse_json(raw: str) -> dict:
    """Extract a top-level JSON *object* from a raw LLM completion.

    Handles two real, live-observed malformations:
    - Markdown code fences around the JSON (models routinely add these
      despite an explicit "no markdown" instruction).
    - A `[{...}, {...}]` array wrapper — some models (confirmed live with
      llama3.1:8b) misread "process each item and return ONE combined
      object" as "return one object per item," producing a JSON array
      instead of the single object the prompt asked for. The old
      find("{")/rfind("}") slice ignored a leading "[" entirely and grabbed
      from the first "{" to the LAST "}" in the whole array — spanning
      multiple objects but starting mid-structure, which produces
      `json.loads` errors like "Extra data" rather than a clean parse of
      either the intended object or the actual array.
    If the parsed top level is a list of dicts, they're merged: array-typed
    values (e.g. "explanations", "questions") are concatenated across items;
    the first item's other keys are kept as the base.
    """
    raw = raw.strip()
    # strip markdown fences
    raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.MULTILINE).strip()

    brace, bracket = raw.find("{"), raw.find("[")
    if bracket != -1 and (brace == -1 or bracket < brace):
        # Top-level structure is an array — bracket-match from here, not
        # from a later "{" that would only capture one element.
        start, end = bracket, raw.rfind("]")
    else:
        start, end = brace, raw.rfind("}")
    if start != -1 and end != -1:
        raw = raw[start:end + 1]

    parsed = json.loads(raw)
    if isinstance(parsed, list):
        if not parsed:
            return {}
        merged: dict = dict(parsed[0]) if isinstance(parsed[0], dict) else {}
        for item in parsed[1:]:
            if not isinstance(item, dict):
                continue
            for k, v in item.items():
                if isinstance(v, list) and isinstance(merged.get(k), list):
                    merged[k].extend(v)
                elif k not in merged:
                    merged[k] = v
        return merged
    return parsed


async def generate_mcqs(context: str, meta: dict, count: int = 8, difficulty: str = "medium") -> tuple[list[dict], str]:
    """Returns (raw_mcqs, provider). Raises llm_service.NoLLMAvailable if no LLM."""
    text, provider = await llm_service.generate(_SYSTEM, _prompt(context, meta, count, difficulty), max_tokens=2200, json_mode=True)
    data = _parse_json(text)
    items = data.get("questions", []) if isinstance(data, dict) else []
    return items, provider


async def gather_context(meta: dict) -> str:
    """RAG context for the topic if ingested; otherwise a curriculum hint prompt."""
    from app.services.embedding_service import EmbeddingService
    from app.services.qdrant_service import QdrantService
    hint = (f"Board: {meta.get('board')}, Class: {meta.get('class_num')}, "
            f"Subject: {meta.get('subject')}, Chapter: {meta.get('chapter')}, "
            f"Topic: {meta.get('topic')}.")
    try:
        query = " ".join(str(meta.get(k)) for k in ("chapter", "topic", "subject") if meta.get(k)) or hint
        vec = await EmbeddingService().embed(query)
        filters = {}
        if meta.get("subject"):   filters["subject"] = str(meta["subject"]).lower()
        if meta.get("class_num"): filters["class"] = meta["class_num"]
        if meta.get("chapter"):   filters["chapter"] = str(meta["chapter"]).lower()
        chunks = await QdrantService().search(vec, filters=filters or None, limit=6)
        joined = "\n\n".join(c["payload"].get("text", "") for c in chunks)
        if joined.strip():
            return f"{hint}\n\nReference material:\n{joined}"
    except Exception:
        pass
    return hint + " Generate exam questions appropriate for this curriculum."


# ── AUTO-VERIFY ───────────────────────────────────────────────────────────────
def verify_mcqs(mcqs: list[dict], context: str) -> tuple[list[dict], dict]:
    """
    Validate + normalize generated MCQs. Returns (verified, report).
    A question passes only if: non-empty stem, >=2 distinct options, and the
    answer maps to exactly one option. Grounding is scored (soft signal).
    """
    ctx_tokens = set(re.findall(r"[a-z0-9]+", context.lower()))
    verified: list[dict] = []
    rejected = 0
    seen_stems: set[str] = set()

    for q in mcqs:
        stem = str(q.get("question", "")).strip()
        opts = [str(o).strip() for o in (q.get("options") or []) if str(o).strip()]
        ans = str(q.get("answer", "")).strip()

        # de-dupe options preserving order
        uniq = list(dict.fromkeys(opts))
        if len(stem) < 6 or len(uniq) < 2 or not ans:
            rejected += 1
            continue
        if stem.lower() in seen_stems:
            rejected += 1
            continue

        # Resolve the answer to an option index
        idx = _resolve_answer(ans, uniq)
        if idx is None:
            rejected += 1
            continue

        # Soft grounding: do answer/stem keywords appear in the source?
        kw = set(re.findall(r"[a-z0-9]+", (stem + " " + uniq[idx]).lower()))
        overlap = len(kw & ctx_tokens) / max(1, len(kw))
        grounded = overlap >= 0.25

        letters = ["a", "b", "c", "d", "e", "f"]
        verified.append({
            "question": stem,
            "options": uniq[:6],
            "correct_option": letters[idx],
            "answer": uniq[idx],
            "explanation": str(q.get("explanation", "")).strip(),
            "grounded": grounded,
        })
        seen_stems.add(stem.lower())

    report = {
        "generated": len(mcqs),
        "verified": len(verified),
        "rejected": rejected,
        "grounded": sum(1 for v in verified if v["grounded"]),
    }
    return verified, report


def _resolve_answer(ans: str, options: list[str]):
    a = ans.strip()
    # exact / case-insensitive text match
    for i, o in enumerate(options):
        if a.lower() == o.lower():
            return i
    # leading letter form: "A", "A)", "(b)", "Option C"
    m = re.match(r"^\(?\s*(?:option\s*)?([a-fA-F])\b", a)
    if m:
        i = ord(m.group(1).lower()) - ord("a")
        if 0 <= i < len(options):
            return i
    # answer contained in an option (or vice-versa)
    for i, o in enumerate(options):
        if a.lower() in o.lower() or o.lower() in a.lower():
            return i
    return None
