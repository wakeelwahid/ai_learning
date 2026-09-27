"""
Local Ollama Worker — Configuration.

Copy this file to config_local.py and override values for your machine,
or set the equivalent environment variables.
"""
import os

# ── Live server ────────────────────────────────────────────────────────────────
LIVE_SERVER_URL = os.getenv("LIVE_SERVER_URL", "http://localhost:3002")
API_BASE        = f"{LIVE_SERVER_URL}/api/v1/ai"

# Bearer token sent as `Authorization: Bearer <API_TOKEN>` on every request.
# REQUIRED: the /jobs/*, /qdrant/batch-upsert, and /papers* endpoints this
# worker calls require an admin-role JWT (require_admin) — set this to a
# valid admin JWT issued by auth_service, or the worker's requests will be
# rejected with 401/403.
API_TOKEN = os.getenv("API_TOKEN", "")

# ── Ollama ────────────────────────────────────────────────────────────────────
OLLAMA_URL       = os.getenv("OLLAMA_URL", "http://localhost:11434")
EMBEDDING_MODEL  = os.getenv("OLLAMA_EMBED_MODEL", "mxbai-embed-large")
GENERATION_MODEL = os.getenv("OLLAMA_GEN_MODEL",   "llama3.1:8b")

# ── Qdrant (direct connection from local worker) ──────────────────────────────
# Set this to your Qdrant Cloud URL if you're using Qdrant Cloud
QDRANT_URL        = os.getenv("QDRANT_URL",        "http://localhost:6333")
QDRANT_API_KEY    = os.getenv("QDRANT_API_KEY",    "")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "school_subjects")

# Strategy: "direct" (push to Qdrant from local) or "server" (push via API endpoint)
QDRANT_STRATEGY   = os.getenv("QDRANT_STRATEGY",   "server")

# ── Chunking ──────────────────────────────────────────────────────────────────
CHUNK_SIZE_TOKENS = int(os.getenv("CHUNK_SIZE",    "600"))
CHUNK_OVERLAP     = int(os.getenv("CHUNK_OVERLAP", "60"))

# ── Worker behaviour ──────────────────────────────────────────────────────────
POLL_INTERVAL_SEC   = int(os.getenv("POLL_INTERVAL",   "15"))    # seconds between polls
MAX_JOBS_PER_POLL   = int(os.getenv("MAX_JOBS",        "3"))     # jobs grabbed per cycle
WORKER_ID           = os.getenv("WORKER_ID",           "ollama_worker_local")
GENERATE_PAPERS     = os.getenv("GENERATE_PAPERS",     "true").lower() == "true"
PAPER_DIFFICULTIES  = ["easy", "medium", "hard"]
DOWNLOAD_DIR        = os.getenv("DOWNLOAD_DIR",        "/tmp/edtech_worker")
