# Run battle_service locally (no Docker required)
# Prerequisites: Python 3.12+, PostgreSQL running on localhost:5450, Redis on localhost:6381

$env:DATABASE_URL = "postgresql+asyncpg://postgres:postgres@localhost:5450/edtech_battle"
$env:REDIS_URL = "redis://localhost:6381/11"
$env:GROQ_API_KEY = $env:GROQ_API_KEY ?? ""
$env:GROQ_MODEL = "llama-3.1-8b-instant"
$env:GAMIFICATION_SERVICE_URL = "http://localhost:8009"
$env:LOG_LEVEL = "info"

# Create venv if not exists
if (-not (Test-Path "venv")) {
    python -m venv venv
}

# Activate and install deps
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt --quiet

# Run
uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload
