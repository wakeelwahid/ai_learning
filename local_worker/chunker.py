"""
Text chunker — splits text into overlapping token-aware chunks.

Target: 400–800 tokens per chunk, 50–80 token overlap.
We approximate 1 token ≈ 4 characters (conservative for English + technical text).
"""
import re

CHARS_PER_TOKEN = 4


def chunk_text(
    text:         str,
    chunk_tokens: int = 600,
    overlap:      int = 60,
) -> list[str]:
    """
    Split text into overlapping chunks.

    Args:
        text:         Input text (any length)
        chunk_tokens: Target chunk size in tokens (≈ chars * 4)
        overlap:      Overlap in tokens between consecutive chunks

    Returns:
        List of non-empty text chunks
    """
    text = _clean(text)
    if not text:
        return []

    chunk_chars   = chunk_tokens * CHARS_PER_TOKEN
    overlap_chars = overlap * CHARS_PER_TOKEN

    # Prefer sentence boundaries when possible
    sentences = _split_sentences(text)
    chunks:   list[str] = []
    buf:      list[str] = []
    buf_len   = 0

    for sent in sentences:
        sent_len = len(sent)
        if buf_len + sent_len > chunk_chars and buf:
            chunks.append(" ".join(buf).strip())
            # Keep last N chars for overlap
            tail = " ".join(buf).strip()[-overlap_chars:]
            buf     = [tail] if tail else []
            buf_len = len(tail)

        buf.append(sent)
        buf_len += sent_len + 1

    if buf:
        chunks.append(" ".join(buf).strip())

    return [c for c in chunks if len(c) > 30]


def _clean(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"[^\x20-\x7Eऀ-ॿ\n]", "", text)  # ASCII + Devanagari
    return text.strip()


def _split_sentences(text: str) -> list[str]:
    # Split on sentence endings, keeping the delimiter with the sentence
    parts = re.split(r"(?<=[.!?])\s+", text)
    return [p.strip() for p in parts if p.strip()]
