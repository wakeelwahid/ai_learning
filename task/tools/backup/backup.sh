#!/usr/bin/env bash
# EduLearn platform backup — dumps every microservice's own Postgres database
# (pg_dump, custom format) plus a Redis RDB snapshot, into a single
# timestamped directory, then prunes backups older than RETENTION_DAYS.
#
# Scope: this backs up the 12 per-service databases (each service owns its
# own Postgres + Redis container, per this platform's architecture — see
# services/*/docker-compose.yml). It does NOT touch infra/'s shared
# postgres/redis (that instance holds no application data as of this
# writing — nothing in services/* connects to it) or Qdrant/RabbitMQ, which
# hold no data that isn't reconstructible from the per-service databases
# (RabbitMQ queues are transient work items; Qdrant's vector index is
# rebuildable from content_service's source documents).
#
# Usage:
#   tools/backup/backup.sh                # backs up all services
#   tools/backup/backup.sh auth_service quiz_service   # just these
#
# Output layout:
#   BACKUP_ROOT/<timestamp>/<service>.pg.dump
#   BACKUP_ROOT/<timestamp>/<service>.redis.rdb
#   BACKUP_ROOT/<timestamp>/manifest.json
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-$SCRIPT_DIR/../../backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_ROOT/$TIMESTAMP"

ALL_SERVICES=(
  auth_service payment_service user_service content_service quiz_service
  gamification_service notification_service referral_service battle_service
  career_service analytics_service ai_service
)

SERVICES=("${@:-${ALL_SERVICES[@]}}")

mkdir -p "$DEST"
echo "Backing up to $DEST"

manifest_entries=()
overall_ok=true

for svc in "${SERVICES[@]}"; do
  pg_container="${svc}_postgres"
  redis_container="${svc}_redis"

  if ! docker ps --format '{{.Names}}' | grep -qx "$pg_container"; then
    echo "  [$svc] SKIP — $pg_container is not running"
    overall_ok=false
    continue
  fi

  echo "  [$svc] pg_dump..."
  pg_ok=true
  if ! docker exec "$pg_container" pg_dump -U edtech_user -d edtech_user -Fc \
        > "$DEST/${svc}.pg.dump" 2> "$DEST/${svc}.pg.dump.log"; then
    echo "  [$svc] pg_dump FAILED — see $DEST/${svc}.pg.dump.log"
    pg_ok=false
    overall_ok=false
  fi
  pg_size=$(stat -c%s "$DEST/${svc}.pg.dump" 2>/dev/null || echo 0)

  redis_ok=true
  redis_size=0
  if docker ps --format '{{.Names}}' | grep -qx "$redis_container"; then
    echo "  [$svc] redis BGSAVE..."
    # REDIS_PASSWORD is the same uniform dev value across every service's
    # .env (see e.g. services/auth_service/.env) — read it from there
    # rather than guessing from the container's process args.
    redis_pass=$(grep -m1 '^REDIS_PASSWORD=' "$SCRIPT_DIR/../../services/$svc/.env" 2>/dev/null | cut -d= -f2-)
    if [ -z "$redis_pass" ]; then
      echo "  [$svc] WARN — could not find REDIS_PASSWORD in services/$svc/.env, skipping redis"
      redis_ok=false
    elif ! docker exec "$redis_container" redis-cli -a "$redis_pass" --no-auth-warning PING >/dev/null 2>&1; then
      echo "  [$svc] WARN — redis auth failed with password from .env, skipping redis"
      redis_ok=false
    else
      docker exec "$redis_container" redis-cli -a "$redis_pass" --no-auth-warning BGSAVE >/dev/null
      # BGSAVE is async — poll rdb_bgsave_in_progress until it flips back to 0.
      for _ in $(seq 1 30); do
        in_progress=$(docker exec "$redis_container" redis-cli -a "$redis_pass" --no-auth-warning \
          INFO persistence 2>/dev/null | grep -o 'rdb_bgsave_in_progress:[0-9]' | cut -d: -f2)
        [ "$in_progress" = "0" ] && break
        sleep 1
      done
      if docker cp "$redis_container:/data/dump.rdb" "$DEST/${svc}.redis.rdb" 2>/dev/null; then
        redis_size=$(stat -c%s "$DEST/${svc}.redis.rdb" 2>/dev/null || echo 0)
      else
        echo "  [$svc] WARN — redis dump.rdb copy failed"
        redis_ok=false
      fi
    fi
  else
    redis_ok=false
  fi

  manifest_entries+=("{\"service\":\"$svc\",\"pg_ok\":$pg_ok,\"pg_bytes\":$pg_size,\"redis_ok\":$redis_ok,\"redis_bytes\":$redis_size}")
done

{
  echo "{"
  echo "  \"timestamp\": \"$TIMESTAMP\","
  echo "  \"services\": ["
  ( IFS=,; echo "    ${manifest_entries[*]}" )
  echo "  ]"
  echo "}"
} > "$DEST/manifest.json"

echo "Manifest: $DEST/manifest.json"

# ── Retention ────────────────────────────────────────────────────────────────
echo "Pruning backups older than $RETENTION_DAYS days in $BACKUP_ROOT"
find "$BACKUP_ROOT" -maxdepth 1 -mindepth 1 -type d -mtime "+$RETENTION_DAYS" -print -exec rm -rf {} \;

if [ "$overall_ok" = false ]; then
  echo "One or more services had a backup issue — see manifest.json / *.log above." >&2
  exit 1
fi
echo "Backup complete: $DEST"
