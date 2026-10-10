#!/usr/bin/env bash
# =============================================================================
# EdTech Platform — START  (bring the whole stack up)
# =============================================================================
# Starts infra (PostgreSQL, Redis, Qdrant, RabbitMQ, monitoring) + all 12
# microservices + API gateway + UIs (frontend, admin, mobile).
#
#   ./start.sh              start everything
#   ./start.sh --no-ui      start infra + backend + gateway only
#   ./start.sh --infra-only just the infrastructure
#
# Assumes images are built (run ./setup.sh first). Safe to re-run — it just
# reconciles state. Stop everything with ./stop.sh.
#
# Linux/Ubuntu note: services talk to each other and to infra via
# host.docker.internal, which each compose maps to host-gateway (Docker Desktop
# provides this automatically on Windows/Mac; Linux needs the mapping we added).
# =============================================================================
set -uo pipefail

# Auto-elevate into the `docker` group for this invocation if needed. After
# `sudo usermod -aG docker $USER`, a shell needs a fresh login for the group
# to take effect — until then `docker` fails with "permission denied" even
# though the user IS in the group. Retry transparently via `sg docker` so
# ./start.sh works right away instead of erroring in every existing terminal.
if command -v docker >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then
  if groups "$USER" 2>/dev/null | grep -qw docker && ! id -nG 2>/dev/null | grep -qw docker; then
    exec sg docker -c "$(printf '%q ' "$(readlink -f "$0")" "$@")"
  fi
fi

cd "$(dirname "$(readlink -f "$0")")"

ENVFILE="$PWD/.env"
NETS=(edtech_net edulearn_net)

SERVICES=(
  services/auth_service services/user_service services/content_service
  services/quiz_service services/ai_service services/payment_service
  services/notification_service services/analytics_service
  services/gamification_service services/referral_service
  services/battle_service services/career_service
  api_gateway
)
UIS=(frontend admin mobile)

WITH_UI=1
INFRA_ONLY=0
for a in "$@"; do
  case "$a" in
    --no-ui)     WITH_UI=0 ;;
    --infra-only) INFRA_ONLY=1 ;;
    -h|--help)   sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

c_blue(){ printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
c_ok(){   printf '\033[0;32m    [OK]   %s\033[0m\n' "$*"; }
c_warn(){ printf '\033[0;33m    [WARN] %s\033[0m\n' "$*"; }
c_err(){  printf '\033[0;31m    [FAIL] %s\033[0m\n' "$*"; }

command -v docker >/dev/null 2>&1 || { echo "docker not found on PATH"; exit 1; }

dc(){ docker compose --env-file "$ENVFILE" -f "$1/docker-compose.yml" "${@:2}"; }

wait_healthy(){ # wait_healthy <infra-service-name> <timeout-sec>
  local svc="$1" timeout="${2:-90}" waited=0 cid status
  while :; do
    cid=$(docker compose --env-file "$ENVFILE" -f infra/docker-compose.yml ps -q "$svc" 2>/dev/null)
    status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo "")
    [ "$status" = "healthy" ] || [ "$status" = "running" ] && { c_ok "infra $svc ($status)"; return 0; }
    waited=$((waited+2)); [ "$waited" -ge "$timeout" ] && { c_warn "infra $svc not healthy after ${timeout}s (status=$status) — continuing"; return 1; }
    sleep 2
  done
}

# ── Networks ──────────────────────────────────────────────────────────────────
# Both networks are required on a fresh machine: edtech_net (infra + UIs) and
# edulearn_net (every backend microservice's inter-service network, joined by
# Prometheus too — see infra/docker-compose.yml's comment on that). Missing
# edulearn_net specifically makes every `docker compose up` below fail with
# "network ... declared as external, but could not be found".
c_blue "Ensuring shared networks: ${NETS[*]}"
for n in "${NETS[@]}"; do docker network create "$n" >/dev/null 2>&1 || true; done
c_ok "networks ready"

# ── External volumes ─────────────────────────────────────────────────────────
# infra/docker-compose.yml declares these `external: true` (pre-provisioned in
# prod). On a fresh machine they don't exist yet, so create them idempotently.
c_blue "Ensuring external volumes referenced by infra/docker-compose.yml"
for v in task_postgres_data task_redis_data task_qdrant_data task_rabbitmq_data task_prometheus_data task_grafana_data task_alertmanager_data; do
  docker volume create "$v" >/dev/null 2>&1 || true
done
c_ok "volumes ready"

# ── Infra ─────────────────────────────────────────────────────────────────────
c_blue "Starting infrastructure (PostgreSQL, Redis, Qdrant, RabbitMQ, monitoring)"
docker compose --env-file "$ENVFILE" -f infra/docker-compose.yml up -d
wait_healthy postgres 90
wait_healthy redis 60

if [ "$INFRA_ONLY" -eq 1 ]; then
  c_blue "Infra only — done."
  exit 0
fi

# ── Backend services + gateway ────────────────────────────────────────────────
c_blue "Starting microservices + API gateway"
for d in "${SERVICES[@]}"; do
  if dc "$d" up -d; then c_ok "$d"; else c_err "$d"; fi
done

# ── UIs ───────────────────────────────────────────────────────────────────────
if [ "$WITH_UI" -eq 1 ]; then
  c_blue "Starting UIs (frontend, admin, mobile)"
  for u in "${UIS[@]}"; do
    if dc "$u" up -d; then c_ok "$u"; else c_err "$u"; fi
  done
fi

# ── Health summary ────────────────────────────────────────────────────────────
# Backend microservices do NOT publish host ports (only the API gateway does),
# so each one is checked THROUGH the gateway's aggregate /health/services probe
# rather than curl'ing a per-service localhost port (which would always fail).
# That probe is admin-only (it exposes internal URLs), so we log in first with
# the ADMIN_EMAIL/ADMIN_PASSWORD from the committed dev .env. The gateway gets
# up to ~60s to come up and report every upstream healthy.
ADMIN_EMAIL=$(grep -E '^ADMIN_EMAIL=' services/auth_service/.env 2>/dev/null | cut -d= -f2-)
ADMIN_PASSWORD=$(grep -E '^ADMIN_PASSWORD=' services/auth_service/.env 2>/dev/null | cut -d= -f2-)

c_blue "Waiting for the API gateway and all backend services to report healthy"
up=0; total=12; gw_ok=0; body=""
for i in $(seq 1 30); do
  # Gateway reachable yet?
  curl -s -m 4 -o /dev/null "http://localhost:9000/health" 2>/dev/null || { sleep 2; continue; }
  gw_ok=1
  # Log in for an admin token (auth_service may still be booting on early tries).
  TOKEN=$(curl -s -m 5 -X POST "http://localhost:9000/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"identifier\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" 2>/dev/null \
    | sed -n 's/.*"access_token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  if [ -n "$TOKEN" ]; then
    body=$(curl -s -m 5 "http://localhost:9000/health/services" -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "")
    up=$(printf '%s' "$body" | grep -o '"status"[[:space:]]*:[[:space:]]*"up"' | wc -l | tr -d ' ')
    [ "$up" -ge "$total" ] && break
  fi
  sleep 2
done

if [ "$gw_ok" -eq 1 ] && [ -n "$body" ]; then
  # Print each service's status line from the gateway's own report.
  printf '%s' "$body" | grep -oE '"[A-Za-z ]+Service"[[:space:]]*:[[:space:]]*\{[^}]*\}' | while read -r line; do
    name=$(printf '%s' "$line" | sed -E 's/^"([^"]+)".*/\1/')
    st=$(printf '%s' "$line" | grep -oE '"status"[[:space:]]*:[[:space:]]*"[a-z]+"' | sed -E 's/.*"([a-z]+)"$/\1/')
    if [ "$st" = "up" ]; then c_ok "$(printf '%-22s' "$name") up"; else c_warn "$(printf '%-22s' "$name") $st"; fi
  done
elif [ "$gw_ok" -eq 1 ]; then
  c_warn "Gateway is up but couldn't read /health/services (admin login not ready?) — check: curl -s localhost:9000/api/v1/auth/login"
else
  c_err "API gateway not reachable on :9000 yet — services may still be booting"
fi

# UIs: checked on their own published host ports.
c_blue "Checking UIs"
for ui in "frontend|3002" "admin|3001" "mobile|8081"; do
  name=${ui%%|*}; port=${ui##*|}
  # curl's %{http_code} is already 000 when the connection fails, so no
  # `|| echo` fallback (which would produce "000000").
  code=$(curl -s -m 4 -o /dev/null -w '%{http_code}' "http://localhost:$port" 2>/dev/null)
  # Any HTTP answer (200, 301, 304, 426 for Expo's ws upgrade, …) means it's up.
  if [ -n "$code" ] && [ "$code" != "000" ]; then c_ok "$(printf '%-22s' "$name") :$port ($code)"; else c_warn "$(printf '%-22s' "$name") :$port — still booting?"; fi
done

cat <<EOF

======================================================================
  EdTech Platform is up   ($up/$total backend services healthy)
======================================================================
  API Gateway     : http://localhost:9000        (health: /health/services)
  Frontend        : http://localhost:3002
  Admin panel     : http://localhost:3001
  Mobile (Expo)   : http://localhost:19006       (Metro: 8081)
  RabbitMQ mgmt   : http://localhost:15672
  Grafana         : http://localhost:3100
  Prometheus      : http://localhost:9090
----------------------------------------------------------------------
  Logs:  docker compose -f services/<name>/docker-compose.yml logs -f
  Stop:  ./stop.sh
======================================================================
EOF
[ "$up" -ge "$total" ] || echo "Note: services showing non-'up' may just need a few more seconds — re-check with: curl -s localhost:9000/health/services"
