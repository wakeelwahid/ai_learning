"""
Groq LLM service — fast inference for student RAG answers.

Used as primary LLM in study mode (lower latency than Claude for repeated queries).
Claude is used as fallback if Groq is unavailable or key not set.
"""
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


class GroqService:
    def __init__(self):
        self._client = None
        self._available = bool(settings.GROQ_API_KEY)

    def _get_client(self):
        if self._client is None:
            from groq import AsyncGroq
            self._client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        return self._client

    @property
    def available(self) -> bool:
        return self._available

    async def generate(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: int = 1024,
        temperature: float = 0.3,
    ) -> str:
        """Generate a response from Groq. Raises on failure."""
        client = self._get_client()
        response = await client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_message},
            ],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return response.choices[0].message.content

    async def generate_paper(
        self,
        prompt: str,
        max_tokens: int = 2048,
    ) -> str:
        """Generate a quiz/revision paper as structured JSON text."""
        client = self._get_client()
        response = await client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an expert Indian school teacher. "
                        "Generate structured educational content as valid JSON. "
                        "Respond ONLY with the JSON object, no other text."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=max_tokens,
            temperature=0.5,
        )
        return response.choices[0].message.content
