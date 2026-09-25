#!/usr/bin/env bash
# =============================================================================
# EdTech Platform — STOP  (tear the whole stack down)
# =============================================================================
#   ./stop.sh           stop & remove all containers (keeps data volumes)
#   ./stop.sh --volumes  also remove data volumes (DESTROYS all DB/redis data)
# =============================================================================
set -uo pipefail

# Auto-elevate into the `docker` group for this invocation if needed. After
# `sudo usermod -aG docker $USER`, a shell needs a fresh login for the group
# to take effect — until then `docker` fails with "permission denied" even
# though the user IS in the group. Retry transparently via `sg docker` so
# ./stop.sh works right away instead of erroring in every existing terminal.
if command -v docker >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then
  if groups "$USER" 2>/dev/null | grep -qw docker && ! id -nG 2>/dev/null | grep -qw docker; then
    exec sg docker -c "$(printf '%q ' "$(readlink -f "$0")" "$@")"
  fi
fi

cd "$(dirname "$(readlink -f "$0")")"

ENVFILE="$PWD/.env"

SERVICES=(
  services/auth_service services/user_service services/content_service
  services/quiz_service services/ai_service services/payment_service
  services/notification_service services/analytics_service
  services/gamification_service services/referral_service
  services/battle_service services/career_service
  api_gateway
)
UIS=(frontend admin mobile)

DOWN_ARGS="--remove-orphans"
for a in "$@"; do
  case "$a" in
    --volumes|-v) DOWN_ARGS="--remove-orphans --volumes" ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

c_blue(){ printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

c_blue "Stopping UIs"
for u in "${UIS[@]}"; do docker compose --env-file "$ENVFILE" -f "$u/docker-compose.yml" down $DOWN_ARGS 2>/dev/null || true; done

c_blue "Stopping microservices + gateway"
for d in "${SERVICES[@]}"; do docker compose --env-file "$ENVFILE" -f "$d/docker-compose.yml" down $DOWN_ARGS 2>/dev/null || true; done

c_blue "Stopping infrastructure"
docker compose --env-file "$ENVFILE" -f infra/docker-compose.yml down $DOWN_ARGS 2>/dev/null || true

c_blue "All stopped."
