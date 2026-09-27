"""
Provider-agnostic LLM text generation with graceful fallback.

Order: Groq → Anthropic (Claude) → OpenAI → local Ollama.
Raises NoLLMAvailable if none can produce text (e.g. no keys and no Ollama),
so callers can degrade cleanly (ingest still works; generation is skipped).
"""
from typing import AsyncIterator

from app.core.config import settings


class NoLLMAvailable(Exception):
    pass


async def generate(
    system: str, user: str, max_tokens: int = 1800, temperature: float = 0.4,
    json_mode: bool = False,
) -> tuple[str, str]:
    """Return (text, provider_name).

    json_mode should be True only for callers that parse the reply as JSON
    (question/paper generation, mistake-analysis, flashcards, revision-plan).
    It enables Ollama's grammar-constrained decoding (see _ollama) — turning
    it on unconditionally for every caller, including plain free-form chat
    (e.g. the parent/general chat route), forced Ollama to emit syntactically
    "valid JSON" for a prompt that never asked for any, which in practice
    meant it just emitted "{}" — confirmed live as the parent AI chat
    endpoint's entire reply after the subscription-gate fix let the request
    through for the first time.
    """
    errors = []

    if settings.GROQ_API_KEY:
        try:
            return await _groq(system, user, max_tokens, temperature), "groq"
        except Exception as e:  # noqa
            errors.append(f"groq:{e}")

    if settings.ANTHROPIC_API_KEY:
        try:
            return await _anthropic(system, user, max_tokens, temperature), "claude"
        except Exception as e:  # noqa
            errors.append(f"claude:{e}")

    if settings.OPENAI_API_KEY:
        try:
            return await _openai(system, user, max_tokens, temperature), "openai"
        except Exception as e:  # noqa
            errors.append(f"openai:{e}")

    # Local Ollama (no key) — last resort
    try:
        return await _ollama(system, user, max_tokens, temperature, json_mode), "ollama"
    except Exception as e:  # noqa
        errors.append(f"ollama:{e}")

    raise NoLLMAvailable("No LLM available. " + " | ".join(errors)[:400])


async def generate_stream(
    system: str, user: str, max_tokens: int = 1800, temperature: float = 0.4,
) -> AsyncIterator[str]:
    """Yield answer text incrementally. Same provider fallback order as generate().

    Yields plain text chunks — callers format SSE frames themselves. Never sets
    json_mode: this path is free-form chat, and the grammar-constrained decoding
    described in generate()'s docstring reduces such replies to "{}".

    A provider is only "failed over" if it raises before its first chunk; once
    text has been yielded we cannot un-yield it, so a mid-stream error propagates.
    """
    errors = []

    for enabled, name, streamer in (
        (settings.GROQ_API_KEY, "groq", _groq_stream),
        (settings.ANTHROPIC_API_KEY, "claude", _anthropic_stream),
        (settings.OPENAI_API_KEY, "openai", _openai_stream),
        (True, "ollama", _ollama_stream),  # local, no key — last resort
    ):
        if not enabled:
            continue
        started = False
        try:
            async for chunk in streamer(system, user, max_tokens, temperature):
                started = True
                yield chunk
            return
        except Exception as e:  # noqa
            if started:
                raise
            errors.append(f"{name}:{e}")

    raise NoLLMAvailable("No LLM available. " + " | ".join(errors)[:400])


async def _groq_stream(system, user, max_tokens, temperature):
    from groq import AsyncGroq
    client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    stream = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        max_tokens=max_tokens, temperature=temperature, stream=True,
    )
    async for event in stream:
        text = event.choices[0].delta.content
        if text:
            yield text


async def _anthropic_stream(system, user, max_tokens, temperature):
    from anthropic import AsyncAnthropic
    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    async with client.messages.stream(
        model=settings.CHAT_MODEL,
        system=system,
        messages=[{"role": "user", "content": user}],
        max_tokens=max_tokens, temperature=temperature,
    ) as stream:
        async for text in stream.text_stream:
            yield text


async def _openai_stream(system, user, max_tokens, temperature):
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    stream = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        max_tokens=max_tokens, temperature=temperature, stream=True,
    )
    async for event in stream:
        text = event.choices[0].delta.content
        if text:
            yield text


async def _ollama_stream(system, user, max_tokens, temperature):
    import httpx
    import json
    # Same timeouts as _ollama: fail fast on connect, allow slow generation.
    timeout = httpx.Timeout(connect=5.0, read=300.0, write=15.0, pool=5.0)
    payload = {
        "model": settings.LLM_MODEL,
        "prompt": f"{system}\n\n{user}",
        "stream": True,
        "options": {"temperature": temperature, "num_predict": max_tokens},
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        url = f"{settings.OLLAMA_HOST.rstrip('/')}/api/generate"
        async with client.stream("POST", url, json=payload) as r:
            r.raise_for_status()
            async for line in r.aiter_lines():
                if not line:
                    continue
                event = json.loads(line)
                text = event.get("response", "")
                if text:
                    yield text
                if event.get("done"):
                    return


async def _groq(system, user, max_tokens, temperature):
    from groq import AsyncGroq
    client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    resp = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        max_tokens=max_tokens, temperature=temperature,
    )
    return resp.choices[0].message.content or ""


async def _anthropic(system, user, max_tokens, temperature):
    from anthropic import AsyncAnthropic
    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    resp = await client.messages.create(
        model=settings.CHAT_MODEL,
        system=system,
        messages=[{"role": "user", "content": user}],
        max_tokens=max_tokens, temperature=temperature,
    )
    return "".join(block.text for block in resp.content if getattr(block, "type", "") == "text")


async def _openai(system, user, max_tokens, temperature):
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    resp = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        max_tokens=max_tokens, temperature=temperature,
    )
    return resp.choices[0].message.content or ""


async def _ollama(system, user, max_tokens, temperature, json_mode: bool = False):
    import httpx
    # Fail fast if Ollama is unreachable (connect=5s); allow long generation (read=300s)
    timeout = httpx.Timeout(connect=5.0, read=300.0, write=15.0, pool=5.0)
    payload = {
        "model": settings.LLM_MODEL,
        "prompt": f"{system}\n\n{user}",
        "stream": False,
        "options": {"temperature": temperature, "num_predict": max_tokens},
    }
    if json_mode:
        # format="json" turns on Ollama's grammar-constrained decoding — the
        # server rejects any token that would break JSON syntax, so the
        # reply is ALWAYS syntactically valid JSON (still not guaranteed to
        # match our schema/shape, e.g. it can legally emit `[...]` instead
        # of `{...}`, but "Extra data" / markdown-fence / truncation parse
        # errors are eliminated at the source). Only set for callers that
        # actually parse the reply as JSON — forcing it on free-form chat
        # gives Ollama nothing structured to say and it just emits "{}".
        payload["format"] = "json"
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(f"{settings.OLLAMA_HOST.rstrip('/')}/api/generate", json=payload)
        r.raise_for_status()
        return r.json().get("response", "")
