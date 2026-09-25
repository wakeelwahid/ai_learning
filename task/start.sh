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
NET="edtech_net"

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

# ── Network ───────────────────────────────────────────────────────────────────
c_blue "Ensuring shared network '$NET'"
docker network create "$NET" >/dev/null 2>&1 || true
c_ok "network ready"

# ── External volumes ─────────────────────────────────────────────────────────
# infra/docker-compose.yml declares these `external: true` (pre-provisioned in
# prod). On a fresh machine they don't exist yet, so create them idempotently.
c_blue "Ensuring external volumes referenced by infra/docker-compose.yml"
for v in task_postgres_data task_redis_data task_qdrant_data task_rabbitmq_data task_prometheus_data task_grafana_data; do
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
c_blue "Waiting ~20s for services to boot, then checking health"
sleep 20
declare -A NAMES=(
  [8001]=auth [8002]=user [8003]=content [8004]=quiz [8005]=payment
  [8006]=notification [8007]=analytics [8028]=gamification [8009]=referral
  [8010]=battle [8011]=career [8012]=ai [9000]=gateway
)
up=0; down=0
# NOTE: gamification is on 8028, not 8008 — host port 8008 is occupied by an
# unrelated local service on this dev machine.
for p in 8001 8002 8003 8004 8005 8006 8007 8028 8009 8010 8011 8012 9000; do
  code=$(curl -s -m 3 -o /dev/null -w '%{http_code}' "http://localhost:$p/health" 2>/dev/null || echo 000)
  if [ "$code" = "200" ]; then c_ok  "$(printf '%-13s' "${NAMES[$p]}") :$p  ($code)"; up=$((up+1))
  else                          c_warn "$(printf '%-13s' "${NAMES[$p]}") :$p  ($code) — still booting?"; down=$((down+1)); fi
done

cat <<EOF

======================================================================
  EdTech Platform is up   ($up/13 backend healthy)
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
[ "$down" -eq 0 ] || echo "Note: services showing non-200 may just need a few more seconds — re-check with ./start.sh or curl."
