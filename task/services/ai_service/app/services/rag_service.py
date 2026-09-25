"""
RAG Service — full production pipeline.

Study mode pipeline:
  safety_check → intent_classify → cache_check (Redis) →
  [single-flight lock if cache miss] →
  embed_query → qdrant_search (board/class/subject/chapter filters) →
  rerank → prompt_format → Groq/Claude → OpenAI → Ollama generate →
  safety_check_output → cache_store (7 days)

Phase 5: Thundering-herd protection via Redis SETNX single-flight.
  Only the first request for a cache-miss query calls the LLM.
  All other simultaneous requests poll the result key until populated.
  Key: rag_answer:{sha256(query+filters)}
  Lock key: rag_answer:{hash}:lock  (TTL 10s — auto-expires if holder crashes)

Phase 6: AI fallback chain: Cache → RAG → Groq → OpenAI → Ollama → Retrieval-only
"""
import asyncio
import hashlib
import json
import logging
import time

import anthropic
import httpx
import redis.asyncio as aioredis
from prometheus_client import Counter, Gauge, Histogram

from app.core.config import settings

# Phase 14: Custom RAG Prometheus metrics
_rag_cache_hits   = Counter("rag_cache_hits_total",   "RAG answers served from Redis cache")
_rag_cache_misses = Counter("rag_cache_misses_total",  "RAG cache misses — LLM pipeline invoked")
_rag_lock_waits   = Counter("rag_lock_waits_total",    "Requests that waited on single-flight lock")
_rag_lock_timeouts = Counter("rag_lock_timeouts_total", "Single-flight lock waits that timed out")
_rag_latency      = Histogram(
    "rag_pipeline_duration_seconds",
    "End-to-end RAG pipeline latency",
    buckets=[0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0],
)
_rag_queue_depth  = Gauge("rag_active_pipelines", "Number of RAG pipelines currently running")
from app.services.embedding_service import EmbeddingService
from app.services.groq_service import GroqService
from app.services.intent_service import IntentService, QueryIntent
from app.services.prompt_service import PromptService
from app.services.qdrant_service import QdrantService
from app.services.reranker_service import RerankerService
from app.services.safety_service import SafetyService
from app.services import llm_service

logger = logging.getLogger(__name__)

# Single-flight lock configuration
_LOCK_TTL_MS  = 10_000   # 10 s — auto-expires if the lock holder crashes
_LOCK_POLL_MS = 300       # poll every 300ms while waiting
_LOCK_TIMEOUT = 12        # give up waiting after 12s; fall through to own LLM call

# Heartbeat: the lock holder's own LLM fallback chain (Groq → Claude →
# OpenAI → Ollama, each with up to a ~300s read timeout) can easily outlast
# the 10s lock TTL above, which was sized for the fast/common case. Without
# a heartbeat, the lock silently expires mid-pipeline and every waiter times
# out and independently calls the LLM too — exactly the thundering herd
# this mechanism exists to prevent, and it happens precisely when the LLM
# is already slow/degraded. Re-extending the TTL periodically while the
# pipeline actually runs closes that gap without having to guess a single
# TTL large enough for every worst case up front.
_LOCK_HEARTBEAT_INTERVAL_S = 3


def _cache_key(query: str, filters: dict) -> str:
    """Build a filter-aware cache key so class-10/class-12 answers don't collide."""
    filter_str = json.dumps(filters, sort_keys=True)
    digest = hashlib.sha256(f"{query.strip().lower()}|{filter_str}".encode()).hexdigest()[:16]
    return f"rag_answer:{digest}"


class RAGService:
    def __init__(self, redis: aioredis.Redis):
        self._redis    = redis
        self._embedder = EmbeddingService()
        self._qdrant   = QdrantService()
        self._groq     = GroqService()
        self._anthropic = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        self._intent   = IntentService()
        self._reranker = RerankerService()
        self._prompts  = PromptService(
            study_version=settings.PROMPT_STUDY_VERSION,
            general_version=settings.PROMPT_GENERAL_VERSION,
        )
        self._safety   = SafetyService()

    async def _heartbeat_lock(self, lock_key: str) -> None:
        """Re-extend the single-flight lock's TTL every few seconds for as
        long as this task runs. Cancelled (see the `finally` in
        answer_study_mode) the moment the pipeline finishes or raises —
        never left running past that, so a crash mid-pipeline still lets
        the lock expire on its own TTL rather than holding it forever."""
        try:
            while True:
                await asyncio.sleep(_LOCK_HEARTBEAT_INTERVAL_S)
                await self._redis.pexpire(lock_key, _LOCK_TTL_MS)
        except asyncio.CancelledError:
            pass

    async def answer_study_mode(
        self,
        query:      str,
        chapter_id: str | None = None,
        subject_id: str | None = None,
        board:      str | None = None,
        class_num:  int | None = None,
        subject:    str | None = None,
        chapter:    str | None = None,
        prompt_version: str | None = None,
    ) -> dict:
        # 1. Input safety gate
        is_safe, reason = self._safety.check_input(query)
        if not is_safe:
            return {"answer": reason, "sources": [], "from_cache": False, "blocked": True}

        # 2. Intent classification
        intent = self._intent.classify(query)
        self._safety.log_query(query, intent.value)

        if intent == QueryIntent.OUT_OF_SCOPE:
            return {
                "answer": "I can only help with educational topics. Please ask a question related to your syllabus.",
                "sources": [], "from_cache": False, "blocked": True,
            }

        # 3. Cache lookup — filter-aware key
        filters: dict = {}
        if chapter_id:
            filters["chapter_id"] = chapter_id
        if subject_id:
            filters["subject_id"] = subject_id
        if board:
            filters["board"]     = board.lower()
        if class_num:
            filters["class"]     = class_num
        if subject:
            filters["subject"]   = subject.lower()
        if chapter:
            filters["chapter"]   = chapter.lower()

        cache_key = _cache_key(query, filters)
        lock_key  = f"{cache_key}:lock"

        # 3a. Fast-path cache check (no lock needed)
        cached = await self._redis.get(cache_key)
        if cached:
            _rag_cache_hits.inc()
            data = json.loads(cached)
            data["from_cache"] = True
            return data

        _rag_cache_misses.inc()

        # 3b. Phase 5 — Single-flight thundering-herd protection.
        # Only one coroutine per unique query calls the LLM.
        # All others wait, then return from cache when the winner is done.
        acquired = await self._redis.set(lock_key, "1", nx=True, px=_LOCK_TTL_MS)
        if not acquired:
            _rag_lock_waits.inc()
            # Another request is already running the pipeline for this query.
            # Poll until the result appears or timeout expires.
            for _ in range(int(_LOCK_TIMEOUT * 1000 / _LOCK_POLL_MS)):
                await asyncio.sleep(_LOCK_POLL_MS / 1000)
                cached = await self._redis.get(cache_key)
                if cached:
                    _rag_cache_hits.inc()
                    data = json.loads(cached)
                    data["from_cache"] = True
                    return data
            # Timeout — fall through and call the LLM ourselves to avoid a total failure
            _rag_lock_timeouts.inc()
            logger.warning("RAG single-flight timeout for key %s — running pipeline independently", cache_key)

        # From here on, we hold (or are treating ourselves as holding) the
        # single-flight lock. A heartbeat keeps its TTL alive for as long as
        # the actual pipeline runs — the LLM fallback chain below can easily
        # outlast the lock's base TTL — and is always cancelled before this
        # method returns, on every exit path, so it never outlives the
        # pipeline it's guarding.
        heartbeat_task = asyncio.create_task(self._heartbeat_lock(lock_key))
        try:
            # 4. Embed + search Qdrant — Phase 14: track active pipelines + end-to-end latency
            _rag_queue_depth.inc()
            _t0 = time.monotonic()

            # Phase 23: Embedding cache — identical queries reuse vectors (30-day TTL).
            # Vectors are ~1.5 KB each; 10k cached embeddings ≈ 15 MB in Redis — negligible.
            _embed_key = f"embed:{hashlib.sha256(query.strip().lower().encode()).hexdigest()[:20]}"
            _cached_vec = await self._redis.get(_embed_key)
            if _cached_vec:
                query_vector = json.loads(_cached_vec)
            else:
                query_vector = await self._embedder.embed(query)
                try:
                    await self._redis.setex(_embed_key, 86400 * 30, json.dumps(query_vector))
                except Exception:
                    pass

            # Build Qdrant filter payload — supports both old chapter_id key and new structured keys
            qdrant_filters = {k: v for k, v in filters.items()}

            raw_chunks = await self._qdrant.search(
                query_vector=query_vector,
                filters=qdrant_filters or None,
                limit=settings.MAX_CONTEXT_CHUNKS * 2,
            )

            if not raw_chunks:
                _rag_queue_depth.dec()
                return {
                    "answer": "I don't have information about this topic in the syllabus. Please check your textbook.",
                    "sources": [], "from_cache": False,
                }

            # 5. Rerank
            reranked = await self._reranker.rerank(
                query=query,
                chunks=raw_chunks,
                top_n=settings.MAX_CONTEXT_CHUNKS,
            )

            # 6. Build context
            context = "\n\n".join(
                f"[CONTEXT {i+1}] {c['payload'].get('text', '')}"
                for i, c in enumerate(reranked)
            )

            # 7. Format system prompt
            intent_hint   = self._intent.intent_hint(intent)
            system_prompt = self._prompts.get_study_prompt(
                version=prompt_version,
                intent=intent.value,
                intent_hint=intent_hint,
            )
            user_message = f"{context}\n\nQuestion: {query}"

            # 8. Generate — Phase 6 fallback chain: Groq → Claude → OpenAI → Ollama → retrieval-only
            try:
                raw_answer, llm_used = await self._generate(system_prompt, user_message)
                # 9. Output safety check
                answer, safety_meta = self._safety.check_output(raw_answer, reranked)
            except RuntimeError:
                # All LLMs unavailable — retrieval-only fallback
                snippets = "\n\n".join(
                    f"• {c['payload'].get('text', '').strip()}" for c in reranked[:3]
                )
                answer = (
                    "Here is the most relevant material from your syllabus:\n\n"
                    f"{snippets}\n\n"
                    "(AI summarisation is offline — configure an LLM key or local Ollama for full answers.)"
                )
                safety_meta = {"grounded": True}
                llm_used = "retrieval-only"

            # Source citations — document name + page + syllabus location
            sources = [
                {
                    "document_name": c["payload"].get("document_name") or c["payload"].get("title"),
                    "document_type": c["payload"].get("document_type"),
                    "page":          c["payload"].get("page"),
                    "subject":       c["payload"].get("subject"),
                    "chapter":       c["payload"].get("chapter_title") or c["payload"].get("chapter"),
                    "chapter_id":    c["payload"].get("chapter_id"),
                    "score":         round(c.get("rerank_score", c.get("score", 0)), 4),
                }
                for c in reranked
            ]

            # Subject/chapter auto-detected from the best-matching chunk (when the
            # student did not pass them explicitly).
            top = reranked[0]["payload"] if reranked else {}

            result = {
                "answer":            answer,
                "sources":           sources,
                "detected_subject":  subject or top.get("subject"),
                "detected_chapter":  chapter or top.get("chapter_title") or top.get("chapter"),
                "from_cache":        False,
                "intent":            intent.value,
                "prompt_version":    prompt_version or settings.PROMPT_STUDY_VERSION,
                "grounded":          safety_meta.get("grounded", True),
                "llm":               llm_used,
            }

            # Cache result and release single-flight lock
            pipe = self._redis.pipeline()
            pipe.setex(cache_key, settings.RAG_CACHE_TTL, json.dumps(result))
            pipe.delete(lock_key)   # release lock so waiters can read from cache
            await pipe.execute()

            _rag_latency.observe(time.monotonic() - _t0)
            _rag_queue_depth.dec()
            return result
        finally:
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass

    async def _generate(self, system_prompt: str, user_message: str) -> tuple[str, str]:
        """
        Phase 6 — AI fallback chain. Returns (text, provider_name) — the
        caller previously guessed the provider from static config
        (`"groq" if self._groq.available else "claude"`), which reported
        the wrong provider whenever Claude/OpenAI/Ollama was what actually
        served the request (or whenever Groq was "available" — key
        configured — but failed and a later provider served it instead).
        1. Groq (fast, cheap)
        2. Claude / Anthropic (high quality)
        3. OpenAI (if configured)
        4. Local Ollama (last resort, no external dependency)
        5. Retrieval-only snippet (no LLM at all)
        """
        # 1. Groq
        if self._groq.available:
            try:
                text = await self._groq.generate(
                    system_prompt=system_prompt,
                    user_message=user_message,
                    max_tokens=settings.MAX_TOKENS_RESPONSE,
                )
                return text, "groq"
            except Exception as exc:
                logger.warning("Groq failed → trying Claude: %s", exc)

        # 2. Claude / Anthropic
        if settings.ANTHROPIC_API_KEY:
            try:
                message = await self._anthropic.messages.create(
                    model=settings.CHAT_MODEL,
                    max_tokens=settings.MAX_TOKENS_RESPONSE,
                    system=system_prompt,
                    messages=[{"role": "user", "content": user_message}],
                )
                return message.content[0].text, "claude"
            except Exception as exc:
                logger.warning("Claude failed → trying OpenAI: %s", exc)

        # 3. OpenAI
        if getattr(settings, "OPENAI_API_KEY", None):
            try:
                import openai
                client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
                resp = await client.chat.completions.create(
                    model="gpt-4o-mini",
                    max_tokens=settings.MAX_TOKENS_RESPONSE,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user",   "content": user_message},
                    ],
                )
                return resp.choices[0].message.content, "openai"
            except Exception as exc:
                logger.warning("OpenAI failed → trying Ollama: %s", exc)

        # 4. Local Ollama — settings.OLLAMA_HOST/LLM_MODEL (NOT OLLAMA_BASE_URL/
        # OLLAMA_MODEL, which don't exist on Settings — this branch used the
        # wrong attribute names and, via getattr's silent None default, was
        # permanently unreachable dead code; confirmed live before this fix,
        # every request fell straight through to the retrieval-only fallback
        # even with a real, reachable Ollama server configured).
        if settings.OLLAMA_HOST:
            try:
                timeout = httpx.Timeout(connect=5.0, read=300.0, write=15.0, pool=5.0)
                async with httpx.AsyncClient(timeout=timeout) as client:
                    resp = await client.post(
                        f"{settings.OLLAMA_HOST.rstrip('/')}/api/generate",
                        json={
                            "model":  settings.LLM_MODEL,
                            "prompt": f"{system_prompt}\n\n{user_message}",
                            "stream": False,
                        },
                    )
                    if resp.status_code == 200:
                        return resp.json().get("response", ""), "ollama"
            except Exception as exc:
                logger.warning("Ollama failed: %s", exc)

        # 5. Retrieval-only fallback — no LLM configured
        raise RuntimeError("All LLM providers unavailable")

    async def answer_general_mode(self, query: str, history: list[dict] | None = None,
                                  memory: str = "") -> str:
        """`memory` is the pre-rendered history + user summary from
        chat_memory; when given it replaces the raw history join."""
        is_safe, reason = self._safety.check_input(query)
        if not is_safe:
            return reason

        # The language is decided in code and stated outright — asked to infer
        # it, a small model copies the language of earlier turns instead.
        from app.services.parent_rag_service import _language_directive

        if memory:
            user = f"{memory}\n\nuser: {query}\n\n{_language_directive(query)}"
        else:
            convo = "\n".join(f"{m.get('role')}: {m.get('content')}" for m in (history or []))
            user = f"{convo}\nuser: {query}\n\n{_language_directive(query)}".strip()
        try:
            text, _ = await llm_service.generate(
                self._prompts.get_general_prompt(), user, max_tokens=settings.MAX_TOKENS_RESPONSE,
            )
            return text
        except llm_service.NoLLMAvailable:
            return ("The AI tutor is temporarily offline (no language model configured). "
                    "Try Study mode with a chapter selected, or set an LLM key / run Ollama.")

    async def ingest_content(self, chunks: list[dict]) -> int:
        texts      = [c["text"] for c in chunks]
        embeddings = await self._embedder.embed_batch(texts)
        await self._qdrant.ensure_collection(len(embeddings[0]))
        await self._qdrant.upsert_chunks(chunks, embeddings)
        return len(chunks)
