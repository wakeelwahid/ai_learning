#!/usr/bin/env bash
# =============================================================================
# EdTech Platform — SETUP  (build every Docker image)
# =============================================================================
# Builds all backend microservices + API gateway + UIs (frontend, admin, mobile)
# and pulls the shared infra images. Run this ONCE (and again after code changes)
# before ./start.sh.
#
#   ./setup.sh              build everything (backend + gateway + UIs)
#   ./setup.sh --no-ui      build backend + gateway only
#   ./setup.sh --no-cache   force a clean rebuild
#
# Linux/Ubuntu. Requires: docker + docker compose v2, and your user in the
# `docker` group (log out/in once after `sudo usermod -aG docker $USER`).
# =============================================================================
set -uo pipefail

# Auto-elevate into the `docker` group for this invocation if needed. After
# `sudo usermod -aG docker $USER`, a shell needs a fresh login for the group
# to take effect — until then `docker` fails with "permission denied" even
# though the user IS in the group. Retry transparently via `sg docker` so
# ./setup.sh works right away instead of erroring in every existing terminal.
if command -v docker >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then
  if groups "$USER" 2>/dev/null | grep -qw docker && ! id -nG 2>/dev/null | grep -qw docker; then
    exec sg docker -c "$(printf '%q ' "$(readlink -f "$0")" "$@")"
  fi
fi

cd "$(dirname "$(readlink -f "$0")")"

ENVFILE="$PWD/.env"
NET="edtech_net"

# Build order: auth first (others call it), gateway last.
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
BUILD_ARGS=""
for a in "$@"; do
  case "$a" in
    --no-ui)    WITH_UI=0 ;;
    --no-cache) BUILD_ARGS="--no-cache" ;;
    -h|--help)  sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

c_blue(){ printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
c_ok(){   printf '\033[0;32m    [OK]   %s\033[0m\n' "$*"; }
c_err(){  printf '\033[0;31m    [FAIL] %s\033[0m\n' "$*"; }

command -v docker >/dev/null 2>&1 || { echo "docker not found on PATH"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "docker compose v2 is required"; exit 1; }

c_blue "Ensuring shared network '$NET'"
docker network create "$NET" >/dev/null 2>&1 || true
c_ok "network ready"

c_blue "Pulling infra images (postgres, redis, qdrant, rabbitmq, monitoring)"
docker compose --env-file "$ENVFILE" -f infra/docker-compose.yml pull || \
  c_err "some infra images failed to pull (will retry on start)"

FAILED=()
build_one(){
  local dir="$1"
  c_blue "Building $dir"
  if docker compose --env-file "$ENVFILE" -f "$dir/docker-compose.yml" build $BUILD_ARGS; then
    c_ok "$dir"
  else
    c_err "$dir"; FAILED+=("$dir")
  fi
}

for d in "${SERVICES[@]}"; do build_one "$d"; done
if [ "$WITH_UI" -eq 1 ]; then
  for u in "${UIS[@]}"; do build_one "$u"; done
fi

echo
if [ ${#FAILED[@]} -eq 0 ]; then
  c_blue "SETUP complete — all images built. Next: ./start.sh"
  exit 0
else
  c_blue "SETUP finished with ${#FAILED[@]} failure(s):"
  for f in "${FAILED[@]}"; do c_err "$f"; done
  echo "    Fix the errors above and re-run ./setup.sh (cached layers make it fast)."
  exit 1
fi
