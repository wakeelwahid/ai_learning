<#
.SYNOPSIS
    Start the EdTech platform — per-service Docker Compose architecture.

.DESCRIPTION
    Every service has its OWN docker-compose.yml. They share one external
    Docker network (edtech_net) and read shared secrets from the root .env
    (passed via --env-file). This script:
      1. Creates the shared network
      2. Brings up infra (postgres, redis, qdrant, rabbitmq)
      3. Brings up every microservice + the API gateway
      4. Optionally the UIs (frontend + admin) with -Ui

.EXAMPLE
    .\start.ps1              # infra + all backend services + gateway
    .\start.ps1 -InfraOnly   # just infra
    .\start.ps1 -Ui          # also build + start frontend + admin
    .\start.ps1 -Down        # stop everything
#>
param(
    [switch]$InfraOnly,
    [switch]$Ui,
    [switch]$Down
)

$Root = $PSScriptRoot
$ENVFILE = Join-Path $Root ".env"
$NET = "edtech_net"

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function OK($m)   { Write-Host "    [OK] $m" -ForegroundColor Green }

$Services = @(
    "services/auth_service", "services/user_service", "services/content_service",
    "services/quiz_service", "services/ai_service", "services/payment_service",
    "services/notification_service", "services/analytics_service",
    "services/gamification_service", "services/referral_service",
    "services/battle_service", "services/career_service", "api_gateway"
)
$Uis = @("frontend", "admin")

function Compose($dir, [string[]]$cmd) {
    docker compose --env-file $ENVFILE -f (Join-Path $Root "$dir/docker-compose.yml") @cmd
}

# ── Teardown ──────────────────────────────────────────────────────────────────
if ($Down) {
    Step "Stopping all services + infra..."
    foreach ($s in $Services + $Uis) { Compose $s @("down") 2>$null }
    Compose "infra" @("down")
    OK "All stopped."
    exit 0
}

# ── Shared network ────────────────────────────────────────────────────────────
Step "Ensuring shared network '$NET'..."
docker network create $NET 2>$null | Out-Null
OK "Network ready."

# ── Infra ─────────────────────────────────────────────────────────────────────
Step "Starting infrastructure (PostgreSQL, Redis, Qdrant, RabbitMQ)..."
Compose "infra" @("up", "-d")
Step "Waiting for PostgreSQL to be healthy..."
$tries = 0
do {
    $tries++; Start-Sleep -Seconds 2
    $pg = docker ps --filter "name=postgres" --filter "health=healthy" -q 2>$null
} while (-not $pg -and $tries -lt 25)
if ($pg) { OK "PostgreSQL healthy." } else { Write-Host "    [WARN] PostgreSQL health not confirmed" -ForegroundColor Yellow }

if ($InfraOnly) { OK "Infra only — done."; exit 0 }

# ── Services + gateway ────────────────────────────────────────────────────────
Step "Starting microservices + API gateway..."
foreach ($s in $Services) {
    Compose $s @("up", "-d", "--build")
    OK $s
}

# ── UIs ───────────────────────────────────────────────────────────────────────
if ($Ui) {
    Step "Building + starting UIs (frontend + admin)..."
    foreach ($u in $Uis) { Compose $u @("up", "-d", "--build"); OK $u }
}

Write-Host "`n======================================================" -ForegroundColor Green
Write-Host "  EdTech Platform is running (per-service compose)" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host "  API Gateway   : http://localhost:9000"
Write-Host "  Health        : http://localhost:9000/health/services"
if ($Ui) {
    Write-Host "  Frontend      : http://localhost:3002"
    Write-Host "  Admin Panel   : http://localhost:3001"
} else {
    Write-Host "  Frontend/Admin: run dev servers, or  .\start.ps1 -Ui"
}
Write-Host "======================================================" -ForegroundColor Green
