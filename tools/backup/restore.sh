#!/usr/bin/env bash
# EduLearn backup restore — for DRILLS ONLY. Restores a backup set into
# fresh, disposable Postgres/Redis containers on an isolated Docker network,
# never into the live per-service containers. This is deliberate: a restore
# drill's whole point is proving backups are usable WITHOUT touching
# anything the running platform depends on.
#
# Usage:
#   tools/backup/restore.sh <backup_timestamp> [service ...]
#   tools/backup/restore.sh 20260911T120000Z auth_service
#
# For each requested service, starts:
#   restore-drill-<service>-pg     (postgres:15-alpine, ephemeral)
#   restore-drill-<service>-redis  (redis:7-alpine, ephemeral)
# loads the matching dump/rdb into them, and leaves them running so the
# caller can verify the data, then prints the teardown command. Nothing
# about this script can write to a "*_postgres"/"*_redis" named container —
# it only ever creates new "restore-drill-*" ones.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-$SCRIPT_DIR/../../backups}"
NETWORK="restore_drill_net"

TIMESTAMP="${1:?Usage: restore.sh <backup_timestamp> [service ...]}"
shift || true
SRC="$BACKUP_ROOT/$TIMESTAMP"

if [ ! -d "$SRC" ]; then
  echo "No backup found at $SRC" >&2
  exit 1
fi

mapfile -t SERVICES < <(
  if [ "$#" -gt 0 ]; then printf '%s\n' "$@"
  else find "$SRC" -maxdepth 1 -name '*.pg.dump' -printf '%f\n' | sed 's/\.pg\.dump$//'
  fi
)

docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK" >/dev/null

for svc in "${SERVICES[@]}"; do
  dump="$SRC/${svc}.pg.dump"
  rdb="$SRC/${svc}.redis.rdb"
  pg_name="restore-drill-${svc}-pg"
  redis_name="restore-drill-${svc}-redis"

  if [ ! -f "$dump" ]; then
    echo "[$svc] no pg dump in this backup set — skipping"
    continue
  fi

  echo "[$svc] starting disposable postgres ($pg_name)..."
  docker rm -f "$pg_name" >/dev/null 2>&1 || true
  docker run -d --name "$pg_name" --network "$NETWORK" \
    -e POSTGRES_USER=edtech_user -e POSTGRES_PASSWORD=edtech_pass_2024 -e POSTGRES_DB=edtech_user \
    postgres:15-alpine >/dev/null

  echo "[$svc] waiting for it to accept connections..."
  # pg_isready can report ready slightly before the entrypoint's initial
  # database creation finishes — wait on an actual query against the
  # target database, not just server-level readiness.
  for i in $(seq 1 60); do
    if docker exec "$pg_name" psql -U edtech_user -d edtech_user -c 'SELECT 1' >/dev/null 2>&1; then break; fi
    if [ "$i" -eq 60 ]; then
      echo "[$svc] postgres never became queryable — aborting this service's restore" >&2
      docker rm -f "$pg_name" >/dev/null 2>&1 || true
      continue 2
    fi
    sleep 1
  done

  echo "[$svc] restoring pg_dump into $pg_name..."
  docker cp "$dump" "$pg_name:/tmp/restore.dump"
  docker exec "$pg_name" pg_restore -U edtech_user -d edtech_user --no-owner --no-privileges /tmp/restore.dump \
    > "$SRC/${svc}.restore.log" 2>&1 || {
      echo "[$svc] pg_restore reported errors — see $SRC/${svc}.restore.log (often just harmless 'already exists' on a fresh DB; check the log)"
    }

  if [ -f "$rdb" ]; then
    echo "[$svc] starting disposable redis ($redis_name) with the backed-up RDB..."
    docker rm -f "$redis_name" >/dev/null 2>&1 || true
    # Redis chown/writes its data dir on startup even just to load an
    # existing RDB, so the mount can't be :ro — use an anonymous volume and
    # copy the snapshot in before starting the server.
    docker volume rm -f "${redis_name}-data" >/dev/null 2>&1 || true
    docker volume create "${redis_name}-data" >/dev/null
    docker run --rm -v "${redis_name}-data:/data" -v "$rdb:/src/dump.rdb:ro" alpine \
      cp /src/dump.rdb /data/dump.rdb
    docker run -d --name "$redis_name" --network "$NETWORK" \
      -v "${redis_name}-data:/data" \
      redis:7-alpine redis-server --requirepass edtech_redis_2024 --dbfilename dump.rdb --dir /data >/dev/null
  fi

  echo "[$svc] restore drill containers ready: $pg_name (port via 'docker port $pg_name'), ${redis_name:-none}"
done

echo
echo "Verify with, e.g.:"
echo "  docker exec restore-drill-<service>-pg psql -U edtech_user -d edtech_user -c '\\dt'"
echo "  docker exec restore-drill-<service>-redis redis-cli -a edtech_redis_2024 --no-auth-warning DBSIZE"
echo
echo "Teardown when done:"
echo "  docker ps -a --format '{{.Names}}' | grep '^restore-drill-' | xargs -r docker rm -f"
echo "  docker volume ls --format '{{.Name}}' | grep '^restore-drill-.*-data$' | xargs -r docker volume rm"
echo "  docker network rm $NETWORK"
