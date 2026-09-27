"""Server-side grading of a paper attempt against the paper's content JSONB.

Real shape of generated_papers.content:
    {"sections": [{"questions": [{"correct_option": "a", "answer": "...",
                                  "options": ["a) 2", ...]}]}]}
The key is `correct_option` (a letter) when present, else `answer` — which is
sometimes a letter ("C") and sometimes the full answer text. Both are compared
leniently so a client may submit either the letter or the option text.
"""


def flatten_questions(content: dict | None) -> list[dict]:
    """All questions across all sections, in paper order — the index a client
    submits answers against."""
    return [
        q
        for section in (content or {}).get("sections", [])
        for q in section.get("questions", [])
    ]


def normalise(value) -> str:
    """Strip an "a) " / "A. " option prefix and casefold, so "a", "A) 2" and
    "2" all compare equal for the same option."""
    text = str(value or "").strip()
    if len(text) > 1 and text[0].isalpha() and text[1] in ").:-":
        text = text[2:]
    return text.strip().strip(".").casefold()


def is_correct(question: dict, given) -> bool:
    key = question.get("correct_option") or question.get("answer")
    if key is None or given is None:
        return False
    if normalise(key) == normalise(given):
        return True
    # The key may be a letter while the client sent the option text (or vice
    # versa) — resolve the letter to its option and compare that too.
    options = question.get("options") or []
    letter = str(key).strip().casefold()
    if len(letter) == 1 and letter.isalpha():
        index = ord(letter) - ord("a")
        if 0 <= index < len(options):
            return normalise(options[index]) == normalise(given)
    return False


def grade(content: dict | None, answers: dict | None) -> tuple[int, int, int]:
    """Return (correct_count, wrong_count, gradable_count). gradable_count is 0
    when the paper carries no machine-checkable key at all — the caller then
    falls back to the client-sent score."""
    questions = flatten_questions(content)
    gradable = [q for q in questions if q.get("correct_option") or q.get("answer")]
    if not gradable:
        return 0, 0, 0

    answers = answers or {}
    correct = 0
    for index, question in enumerate(questions):
        if not (question.get("correct_option") or question.get("answer")):
            continue
        if is_correct(question, answers.get(str(index), answers.get(index))):
            correct += 1
    return correct, len(gradable) - correct, len(gradable)
