# EduLearn Backup & Restore

Backs up every microservice's own Postgres database (`pg_dump`, custom
format) plus a Redis RDB snapshot, and verifies restorability via a real
restore drill into disposable containers — never into the live services.

## Scope

Each of the 12 microservices owns its own Postgres + Redis container (see
`services/*/docker-compose.yml`) — there is no shared application database.
`backup.sh` dumps all 12 by default. It does **not** back up:

- `infra/docker-compose.yml`'s shared Postgres/Redis — as of this writing no
  service connects to it; it holds no application data.
- RabbitMQ — its queues hold transient in-flight work (Celery tasks, AI
  pipeline jobs), not durable state; a lost queue just means in-flight jobs
  re-run, not data loss. `infra/rabbitmq/definitions.json` (checked into the
  repo) is the actual durable artifact — the pre-declared queue/user/vhost
  topology — and is restored by simply restarting the container.
- Qdrant — its vector index is derived from `content_service`'s own source
  documents (in Postgres, which *is* backed up) and can be rebuilt from
  there; it is not an independent source of truth.

## Running a backup

```bash
tools/backup/backup.sh                        # all 12 services
tools/backup/backup.sh auth_service quiz_service   # just these
```

Writes to `backups/<UTC timestamp>/`:
- `<service>.pg.dump` — `pg_dump -Fc` (custom format, needed for
  `pg_restore`, not plain SQL)
- `<service>.redis.rdb` — a point-in-time RDB snapshot (via `BGSAVE`)
- `manifest.json` — per-service success/byte-size record
- `<service>.pg.dump.log` — pg_dump stderr, present even on success (empty)

Set `BACKUP_ROOT` to change the output location (default: `backups/` at the
repo root) and `RETENTION_DAYS` to change the prune window (default: 14 —
`backup.sh` deletes any backup directory older than this on every run).

**Backups are not committed to the repo** (add `backups/` to your local
ignore rules if you want) — they contain real seeded user data and are
meant to be rotated, not versioned.

## Running a restore drill

```bash
tools/backup/restore.sh <timestamp>                       # all services in that backup
tools/backup/restore.sh <timestamp> auth_service           # just one
```

This restores into **new, disposable** containers named
`restore-drill-<service>-pg` / `restore-drill-<service>-redis` on their own
`restore_drill_net` network — it never touches the real `<service>_postgres`
/ `<service>_redis` containers the platform actually runs on. That's the
point of a drill: proving a backup is usable without any risk to the
running platform (per the platform's own "do not modify or risk the
production database during testing" rule — the same principle applies to
the dev stack here).

Verify the restored data, e.g.:
```bash
docker exec restore-drill-auth_service-pg psql -U edtech_user -d edtech_user -c '\dt'
docker exec restore-drill-auth_service-redis redis-cli -a edtech_redis_2024 --no-auth-warning DBSIZE
```

Tear down when done — the script prints the exact commands, or:
```bash
docker ps -a --format '{{.Names}}' | grep '^restore-drill-' | xargs -r docker rm -f
docker volume ls --format '{{.Name}}' | grep '^restore-drill-.*-data$' | xargs -r docker volume rm
docker network rm restore_drill_net
```

## Verified restore drill (this session)

Ran a real drill against a real backup, comparing restored data to the live
source captured immediately before:

| Check | Live source | Restored |
|---|---|---|
| `auth_service.users` count | 627 | 627 |
| `auth_service.users` admin row (`seed.admin0@edulearn.test`, role) | present, `ADMIN` | present, `ADMIN` |
| `quiz_service.quiz_attempts` count | 2980 | 2980 |
| `quiz_service` Redis keys | question cache, per-student progress/weak-topics, leaderboard cache | same keys present, real values |

Both `pg_restore` runs completed with an empty error log (no warnings, no
"already exists" noise — clean restore into a freshly-created database).

## Scheduling

Not wired into cron/a scheduler in this dev environment — run manually or
wire `tools/backup/backup.sh` into your platform's job scheduler for a real
deployment. RPO is exactly "time since your last manual/scheduled run";
RTO is roughly the time to run `restore.sh` plus pointing a service's
`DATABASE_URL`/`REDIS_URL` at the restored container (a few minutes per
service, based on the dump sizes seen in this stack — well under a minute
of restore time for even the largest, `user_service`'s ~2.2MB dump).
