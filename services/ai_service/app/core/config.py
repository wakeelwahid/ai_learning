from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    APP_NAME: str = "EdTech AI Service"
    ENV:      str = "development"
    DEBUG:    bool = False

    # Error tracking — empty by default (no-op). Set to a real Sentry DSN
    # in production only; local/dev never sends events.
    SENTRY_DSN: str = ""

    REDIS_URL:        str
    # This service never verifies JWTs locally — it calls auth_service's
    # /api/v1/auth/verify API (the single authentication authority) and
    # holds no signing secret of its own.
    AUTH_SERVICE_URL: str = "http://auth_service:8000"

    QDRANT_URL:        str = "http://qdrant:6333"
    QDRANT_API_KEY:    str = ""
    QDRANT_COLLECTION_SYLLABUS:  str = "edtech_syllabus"
    QDRANT_COLLECTION_SUBJECTS:  str = "school_subjects"
    # Per-student activity fact cards backing the parent RAG chat. Separate
    # from the syllabus collections — different payload shape, and every
    # query filters it by student_id.
    QDRANT_COLLECTION_STUDENT:   str = "student_activity"

    OPENAI_API_KEY:    str = ""
    ANTHROPIC_API_KEY: str = ""

    EMBEDDING_MODEL: str = "text-embedding-3-small"
    CHAT_MODEL:      str = "claude-sonnet-4-6"

    # No-key local stack:
    #  - embeddings via sentence-transformers (downloads model on first use)
    #  - generation via the local Ollama server
    # 384-dim, CPU-friendly. Multilingual so Hinglish queries retrieve properly:
    # measured on real questions, same-meaning vs unrelated separation is 0.43
    # here against 0.27 for the English-only all-MiniLM-L6-v2, and English is
    # slightly better too (0.73 vs 0.68). Same dimension, so no Qdrant change.
    # Switching this model invalidates every stored vector — re-index after.
    LOCAL_EMBED_MODEL: str = "paraphrase-multilingual-MiniLM-L12-v2"
    # Default to the Docker host (reachable from containers). Override via OLLAMA_HOST
    # env if Ollama runs elsewhere. Ollama MUST listen on 0.0.0.0 (not 127.0.0.1).
    OLLAMA_HOST:       str = "http://host.docker.internal:11434"
    LLM_MODEL:         str = "llama3.1:8b"

    # Groq — primary LLM for student RAG (faster + cheaper); Claude is fallback
    GROQ_API_KEY: str = ""
    GROQ_MODEL:   str = "llama-3.1-8b-instant"

    DATABASE_URL: str = ""

    # Cache TTLs (seconds)
    RAG_CACHE_TTL:     int = 86400 * 7   # 7 days
    CHAPTER_CACHE_TTL: int = 86400 * 30  # 30 days
    # Parent RAG answers are about a student's own changing activity, so they
    # cannot share the syllabus TTL — a week-old answer would be wrong.
    PARENT_RAG_CACHE_TTL:      int = 900    # 15 minutes
    PARENT_RAG_REINDEX_SECONDS: int = 3600  # re-index a student at most hourly
    PARENT_RAG_CONTEXT_CARDS:  int = 10     # cards kept after reranking
    PARENT_RAG_FACTS_TTL:      int = 60     # per-student internal-API fan-out cache

    # Chat history and user memory. Kept on a DIFFERENT Redis db from the
    # caches above: the shared instance runs maxmemory-policy allkeys-lru, so
    # anything alongside the caches can be evicted without warning. Losing a
    # cached answer is fine; losing a parent's conversation is not. The memory
    # budget is still shared, so this is isolation by keyspace, not a hard
    # guarantee. Defaults to REDIS_URL with the db index swapped to 1.
    REDIS_CHAT_URL:          str = ""
    CHAT_HISTORY_EXCHANGES:  int = 10   # user+assistant pairs kept per thread
    CHAT_HISTORY_TTL_DAYS:   int = 30
    CHAT_SUMMARY_EVERY:      int = 5    # refresh the rolling summary every N exchanges

    MAX_CONTEXT_CHUNKS:   int = 5
    MAX_TOKENS_RESPONSE:  int = 1024

    RABBITMQ_URL: str = "amqp://edtech:edtech_rabbit@rabbitmq:5672//"

    PAYMENT_SERVICE_URL: str = "http://payment_service:8000"
    # Owner of parent_profiles — /ai/chat asks it whether a parent caller has
    # an APPROVED link to the student they're asking about.
    USER_SERVICE_URL: str = "http://user_service:8000"
    # Sources for the parent RAG index — each owns its own database, so the
    # student's activity is only reachable over their internal APIs.
    QUIZ_SERVICE_URL:         str = "http://quiz_service:8000"
    BATTLE_SERVICE_URL:       str = "http://battle_service:8000"
    GAMIFICATION_SERVICE_URL: str = "http://gamification_service:8000"
    ANALYTICS_SERVICE_URL:    str = "http://analytics_service:8000"
    CONTENT_SERVICE_URL:      str = "http://content_service:8000"
    CAREER_SERVICE_URL:       str = "http://career_service:8000"
    REFERRAL_SERVICE_URL:     str = "http://referral_service:8000"
    # This service's own address. Paper attempts live in ai_service's own DB,
    # but the indexer reaches them through the same internal HTTP contract as
    # every other domain rather than a second, in-process code path.
    AI_SELF_URL:              str = "http://ai_service:8000"
    # Same shared value as every other service's .env; user_service's
    # /internal/* routes reject calls without it.
    INTERNAL_SERVICE_SECRET: str = ""

    COHERE_API_KEY: str = ""

    PROMPT_STUDY_VERSION:   str = "v2"
    PROMPT_GENERAL_VERSION: str = "v2"

    # MinIO (for admin file uploads)
    MINIO_ENDPOINT:   str = "http://minio:9000"
    MINIO_ACCESS_KEY: str = "edtech"
    MINIO_SECRET_KEY: str = "edtech_minio_2024"
    MINIO_BUCKET:     str = "edtech-content"

    @property
    def chat_redis_url(self) -> str:
        """REDIS_CHAT_URL if set, else REDIS_URL with the db index swapped to 1."""
        if self.REDIS_CHAT_URL:
            return self.REDIS_CHAT_URL
        base, _, _ = self.REDIS_URL.rpartition("/")
        return f"{base}/1" if base else self.REDIS_URL


settings = Settings()
