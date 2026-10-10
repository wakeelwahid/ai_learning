# EduLearn — Setup Guide

## Prerequisites

- Docker + Docker Compose v2
- User in `docker` group (`sudo usermod -aG docker $USER`, then re-login)
- ~8GB free RAM for backend + infra; ~10–12GB if you also run the UIs and the AI service (it loads ML models)

Everything runs in Docker — no Python/Node/Postgres needed on the host.

`.env` files are already committed with working dev values, so a fresh clone runs with zero config. Rotate them before going to production (see below).

## Quick setup

```bash
git clone <your-repo-url>
cd ai_learning
chmod +x setup.sh start.sh stop.sh
./setup.sh   # build every image + create the shared networks/volumes
./start.sh   # start infra + all services + gateway + UIs, then print a health summary
```

`./setup.sh` creates both shared networks (`edtech_net`, `edulearn_net`) and the
seven external data volumes, builds all images, and pulls the infra images.
`./start.sh` brings everything up and ends with a per-service health summary
(it logs in as the admin to read the gateway's aggregate probe).

Flags: `--no-ui` (skip frontend/admin/mobile), `--no-cache` (setup.sh, force rebuild), `--infra-only` (start.sh, infra only). Both scripts are safe to re-run — unchanged images use cached layers, so a re-run is fast. If a build fails on a transient network timeout (pip/npm download), just re-run `./setup.sh`.

## Manual setup

```bash
# Networks
docker network create edtech_net
docker network create edulearn_net

# Volumes
docker volume create task_postgres_data
docker volume create task_redis_data
docker volume create task_qdrant_data
docker volume create task_rabbitmq_data
docker volume create task_prometheus_data
docker volume create task_grafana_data
docker volume create task_alertmanager_data

# Infra
docker compose --env-file .env -f infra/docker-compose.yml up -d --build

# Backend services + gateway (auth first, gateway last)
for d in services/auth_service services/user_service services/content_service \
         services/quiz_service services/ai_service services/payment_service \
         services/notification_service services/analytics_service \
         services/gamification_service services/referral_service \
         services/battle_service services/career_service api_gateway; do
  docker compose --env-file .env -f "$d/docker-compose.yml" up -d --build
done

# Frontend apps
for u in frontend admin mobile; do
  docker compose --env-file .env -f "$u/docker-compose.yml" up -d --build
done
```

Stop manually:
```bash
for u in frontend admin mobile; do docker compose -f "$u/docker-compose.yml" down; done
# only the dirs that actually have a compose file (manager/ and _shared_auth/ don't)
for d in services/*_service api_gateway; do docker compose -f "$d/docker-compose.yml" down; done
docker compose -f infra/docker-compose.yml down
```

## Seed demo data

```bash
python3 tools/seed/seed.py --scale medium   # small | medium | full
```

All seeded accounts use password `Seed@123` (e.g. `seed.student0@edulearn.test`, `seed.parent0@edulearn.test`, `seed.admin0@edulearn.test`).

**How to actually log in:**
- **Admin panel** (`:3001`) and **teacher/admin accounts**: email + password.
- **Students & parents** in the real app (`:3002` / mobile): **phone number + OTP only** — email+password login is intentionally blocked for them. Seeded students have no phone number, so they can't log into the student UI as-is; the email+password above is for the admin panel and API/test tooling. To log in as a student in the UI, register a fresh one through the app, or assign a phone to a seeded row and verify it.
- **Dev OTP:** while `APP_ENV=development` (the committed default), any phone-OTP verify accepts the code `000000`, so no real SMS is needed locally. This is disabled in production (see "Going to production").

## Verify

`./start.sh` already prints a per-service health summary at the end (it logs in
as the admin to read the gateway's aggregate probe). To check manually:

```bash
# Public gateway liveness (no auth):
curl http://localhost:9000/health

# All upstream services (admin-only — it exposes internal URLs). Log in first:
TOKEN=$(curl -s -X POST http://localhost:9000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"admin@edtech.com","password":"<ADMIN_PASSWORD from services/auth_service/.env>"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
curl http://localhost:9000/health/services -H "Authorization: Bearer $TOKEN"
```

| App | URL |
|---|---|
| Web frontend | http://localhost:3002 |
| Admin panel | http://localhost:3001 |
| Mobile (Expo) | http://localhost:19006 |
| RabbitMQ | http://localhost:15672 |
| Grafana | http://localhost:3100 |
| Prometheus | http://localhost:9090 |

## Stop

```bash
./stop.sh              # keep data
./stop.sh --volumes    # wipe all databases too (irreversible)
```

## Going to production

The committed `.env` files hold **dev-only** values so a fresh clone runs with
zero config. Before any public deployment:

1. **Stop committing secrets.** Uncomment the `.env` lines in `.gitignore`, run
   `git rm --cached` on every tracked `.env` (and the `backups/` dumps), and
   rotate every value so the old committed ones are useless.
2. **Rotate secrets:** `SECRET_KEY`/`JWT_SECRET_KEY` (shared across all services —
   use one strong value), `INTERNAL_SERVICE_SECRET`, `POSTGRES_PASSWORD`,
   `REDIS_PASSWORD`, `RABBITMQ_PASS`, `QDRANT_API_KEY`, `GRAFANA_PASSWORD`,
   `ADMIN_PASSWORD`.
3. **Turn off the OTP dev bypass:** in `services/auth_service/.env` set
   `APP_ENV=production` and leave `DEV_OTP_CODE` empty. (Any other `APP_ENV`
   value also disables it — the default fails safe.) Wire up a real SMS
   provider so OTPs actually send.
4. **Turn off debug:** set `DEBUG=false` everywhere. This also hides the
   gateway's `/docs`, `/openapi.json` and `/metrics` from the public internet.
5. **Don't bake secrets into images:** add a `.dockerignore` containing `.env*`
   to each service and the gateway so `COPY . .` doesn't embed them.
6. Set real `SENTRY_DSN` per service.
7. Fill in real SMTP creds in `monitoring/alertmanager/alertmanager.yml`.
8. Switch `payment_service`'s Cashfree config out of test mode and set
   `CASHFREE_WEBHOOK_SECRET`.
9. Update `FRONTEND_URL` / `OAUTH_REDIRECT_BASE_URL` / CORS to your real domain.
10. Mobile store builds need `eas login` with a real Expo account; don't deploy
    the mobile dev-server container (`mobile/docker-compose.yml`) publicly.

## Troubleshooting

| Problem | Fix |
|---|---|
| Code changes don't take effect | Rebuild: `docker compose -f services/<name>/docker-compose.yml up -d --build` |
| Build hangs (often `ai_service`) | Usually low host RAM — check `free -h`, retry |
| `pip`/`npm` "Read timed out" during build | Transient network hiccup — just re-run `./setup.sh` (cached layers make it fast) |
| `failed to bind host port 0.0.0.0:9000: address already in use` | Something else is on that port (e.g. an old gateway still running). Free it (`sudo ss -ltnp \| grep :9000`) or `./stop.sh` first |
| Container name conflict | `docker rm -f <name>`, retry |
| Health check fails right after start | Wait 10–30s, recheck (`ai_service` loads ML models and is slowest) |
| `/health/services` returns "Missing bearer token" | It's admin-only now — log in first (see **Verify**) |
| Seeded student can't log in to the web/mobile app | Expected — students use phone-OTP and seeded rows have no phone. Register a new student in the app instead |
