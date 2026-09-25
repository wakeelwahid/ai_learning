"""
Paper Generator — uses local Ollama LLM to generate structured quiz/revision papers.

Output schema (JSON):
{
  "title": str,
  "paper_type": "quiz_paper" | "revision_paper" | "practice_paper" | "mock_test",
  "board": str,
  "class_num": int,
  "subject": str,
  "chapter": str,
  "topic": str | null,
  "difficulty": "easy" | "medium" | "hard",
  "total_marks": int,
  "duration_min": int,
  "content": {
    "sections": [
      {
        "section_name": str,
        "marks_per_question": int,
        "questions": [
          {
            "q_no": int,
            "question": str,
            "options": ["A) ...", "B) ...", "C) ...", "D) ..."],  // MCQ only
            "answer": str,
            "explanation": str | null
          }
        ]
      }
    ]
  }
}
"""
import json
import logging
import re
from typing import Any

import httpx

from config import GENERATION_MODEL, OLLAMA_URL

logger = logging.getLogger(__name__)

_GENERATE_URL = f"{OLLAMA_URL}/api/generate"


async def _llm(prompt: str, max_tokens: int = 4096) -> str:
    payload = {
        "model":  GENERATION_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "num_predict": max_tokens,
            "temperature": 0.3,
            "top_p": 0.9,
        },
    }
    async with httpx.AsyncClient(timeout=300) as client:
        r = await client.post(_GENERATE_URL, json=payload)
        r.raise_for_status()
        return r.json()["response"]


def _extract_json(raw: str) -> dict[str, Any]:
    # Try direct parse first
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    # Try code block extraction
    m = re.search(r"```(?:json)?\s*([\s\S]+?)```", raw)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    # Last-ditch: find first { … } block
    m = re.search(r"\{[\s\S]+\}", raw)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    raise ValueError(f"No valid JSON found in LLM response:\n{raw[:500]}")


def _quiz_prompt(meta: dict[str, Any], difficulty: str, context: str) -> str:
    return f"""You are an expert {meta['board']} curriculum question setter for Class {meta['class_num']}.

Generate a {difficulty} difficulty QUIZ PAPER for:
Subject : {meta['subject']}
Chapter : {meta['chapter']}
Topic   : {meta.get('topic') or 'All topics in chapter'}

Use the following syllabus content as the primary source:
---
{context[:3000]}
---

Return ONLY valid JSON (no extra text) matching this schema:
{{
  "title": "<descriptive title>",
  "paper_type": "quiz_paper",
  "board": "{meta['board']}",
  "class_num": {meta['class_num']},
  "subject": "{meta['subject']}",
  "chapter": "{meta['chapter']}",
  "topic": {json.dumps(meta.get('topic'))},
  "difficulty": "{difficulty}",
  "total_marks": 20,
  "duration_min": 30,
  "content": {{
    "sections": [
      {{
        "section_name": "Multiple Choice Questions",
        "marks_per_question": 1,
        "questions": [
          {{
            "q_no": 1,
            "question": "...",
            "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
            "answer": "A",
            "explanation": "..."
          }}
        ]
      }},
      {{
        "section_name": "Short Answer Questions",
        "marks_per_question": 3,
        "questions": [
          {{
            "q_no": 1,
            "question": "...",
            "answer": "...",
            "explanation": null
          }}
        ]
      }}
    ]
  }}
}}

Generate 10 MCQs (1 mark each) and 3 short-answer questions (3 marks each) = 19 marks total. Be accurate."""


def _revision_prompt(meta: dict[str, Any], context: str) -> str:
    return f"""You are an expert {meta['board']} curriculum educator for Class {meta['class_num']}.

Generate a comprehensive REVISION PAPER for:
Subject : {meta['subject']}
Chapter : {meta['chapter']}
Topic   : {meta.get('topic') or 'Complete chapter'}

Syllabus content:
---
{context[:3000]}
---

Return ONLY valid JSON matching this schema:
{{
  "title": "Revision Notes – {meta['chapter']}",
  "paper_type": "revision_paper",
  "board": "{meta['board']}",
  "class_num": {meta['class_num']},
  "subject": "{meta['subject']}",
  "chapter": "{meta['chapter']}",
  "topic": {json.dumps(meta.get('topic'))},
  "difficulty": "medium",
  "total_marks": 0,
  "duration_min": 0,
  "content": {{
    "sections": [
      {{
        "section_name": "Key Concepts",
        "marks_per_question": 0,
        "questions": [
          {{
            "q_no": 1,
            "question": "<concept name>",
            "answer": "<clear explanation>",
            "explanation": null
          }}
        ]
      }},
      {{
        "section_name": "Important Formulas / Definitions",
        "marks_per_question": 0,
        "questions": []
      }},
      {{
        "section_name": "Practice Questions",
        "marks_per_question": 0,
        "questions": []
      }}
    ]
  }}
}}

Include 8-10 key concepts, 5 formulas/definitions, 5 practice questions. Be thorough and accurate."""


async def generate_quiz_paper(
    meta: dict[str, Any],
    context: str,
    difficulty: str = "medium",
) -> dict[str, Any]:
    """Generate a quiz paper. Returns parsed JSON dict."""
    prompt = _quiz_prompt(meta, difficulty, context)
    raw    = await _llm(prompt, max_tokens=4096)
    paper  = _extract_json(raw)
    paper.setdefault("generated_by", GENERATION_MODEL)
    return paper


async def generate_revision_paper(
    meta: dict[str, Any],
    context: str,
) -> dict[str, Any]:
    """Generate a revision/notes paper. Returns parsed JSON dict."""
    prompt = _revision_prompt(meta, context)
    raw    = await _llm(prompt, max_tokens=6144)
    paper  = _extract_json(raw)
    paper.setdefault("generated_by", GENERATION_MODEL)
    return paper


async def generate_all_papers(
    meta: dict[str, Any],
    context: str,
    difficulties: list[str] | None = None,
    make_revision: bool = True,
) -> list[dict[str, Any]]:
    """
    Generate multiple papers for a single job's context:
    - One quiz paper per requested difficulty
    - One revision paper (optional)
    """
    if difficulties is None:
        difficulties = ["medium"]

    papers: list[dict[str, Any]] = []

    for diff in difficulties:
        try:
            p = await generate_quiz_paper(meta, context, diff)
            papers.append(p)
            logger.info("Generated %s quiz paper (%s)", diff, meta.get("chapter"))
        except Exception as exc:
            logger.error("Failed quiz paper [%s]: %s", diff, exc)

    if make_revision:
        try:
            p = await generate_revision_paper(meta, context)
            papers.append(p)
            logger.info("Generated revision paper (%s)", meta.get("chapter"))
        except Exception as exc:
            logger.error("Failed revision paper: %s", exc)

    return papers
