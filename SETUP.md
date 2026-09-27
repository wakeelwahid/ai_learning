# EduLearn — Setup Guide

## Prerequisites

- Docker + Docker Compose v2
- User in `docker` group (`sudo usermod -aG docker $USER`, then re-login)
- ~8GB free RAM

Everything runs in Docker — no Python/Node/Postgres needed on the host.

`.env` files are already committed with working dev values, so a fresh clone runs with zero config. Rotate them before going to production (see below).

## Quick setup

```bash
git clone <your-repo-url>
cd task
chmod +x setup.sh start.sh stop.sh
./setup.sh   # build everything
./start.sh   # start everything
```

Flags: `--no-ui` (skip frontend/admin/mobile), `--no-cache` (setup.sh, force rebuild), `--infra-only` (start.sh, infra only). Both scripts are safe to re-run.

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
for d in services/*/ api_gateway; do docker compose -f "$d/docker-compose.yml" down; done
docker compose -f infra/docker-compose.yml down
```

## Seed demo data

```bash
python3 tools/seed/seed.py --scale medium   # small | medium | full
```

All seeded accounts use password `Seed@123` (e.g. `seed.student0@edulearn.test`, `seed.parent0@edulearn.test`, `seed.admin0@edulearn.test`). Students/parents log in via phone OTP in the real app — this password is for admin/test tooling only.

## Verify

```bash
curl http://localhost:9000/health
curl http://localhost:9000/health/services
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

1. Rotate `SECRET_KEY`/`JWT_SECRET_KEY` (shared across all services), `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `ADMIN_PASSWORD`.
2. Set real `SENTRY_DSN` per service.
3. Fill in real SMTP creds in `monitoring/alertmanager/alertmanager.yml`.
4. Switch `payment_service`'s Cashfree config out of test mode.
5. Update `FRONTEND_URL` / `OAUTH_REDIRECT_BASE_URL` / CORS to your real domain.
6. Mobile store builds need `eas login` with a real Expo account.

## Troubleshooting

| Problem | Fix |
|---|---|
| Code changes don't take effect | Rebuild: `docker compose -f services/<name>/docker-compose.yml up -d --build` |
| Build hangs (often `ai_service`) | Usually low host RAM — check `free -h`, retry |
| Container name conflict | `docker rm -f <name>`, retry |
| Health check fails right after start | Wait 10–30s, recheck |
