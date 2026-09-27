.PHONY: help network infra up down build logs ui down-ui \
        up-auth up-user up-content up-quiz up-ai up-payment up-notification \
        up-analytics up-gamification up-referral up-battle up-career up-gateway down-all clean

# Every service has its OWN docker-compose.yml. They share one external network
# (edtech_net) and read shared secrets from the root .env via --env-file.
ENV  := --env-file .env
NET  := edtech_net

SERVICES := services/auth_service services/user_service services/content_service \
            services/quiz_service services/ai_service services/payment_service \
            services/notification_service services/analytics_service \
            services/gamification_service services/referral_service \
            services/battle_service services/career_service api_gateway

UIS := frontend admin

# ─── Help ─────────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "EdTech Platform — per-service Docker Compose"
	@echo ""
	@echo "  make network     Create the shared edtech_net network"
	@echo "  make infra       Start postgres, redis, qdrant, rabbitmq"
	@echo "  make up          Start infra + ALL services + gateway"
	@echo "  make ui          Start frontend + admin (nginx)"
	@echo "  make down        Stop all services + infra"
	@echo "  make logs s=auth_service   Follow one service's logs"
	@echo ""
	@echo "  Individual: make up-auth | up-content | up-ai | up-gateway | ..."
	@echo ""

# ─── Shared network + infra ───────────────────────────────────────────────────
network:
	@docker network create $(NET) 2>/dev/null || true

infra: network
	docker compose $(ENV) -f infra/docker-compose.yml up -d

# ─── Whole stack ──────────────────────────────────────────────────────────────
up: infra
	@for d in $(SERVICES); do echo ">> $$d"; docker compose $(ENV) -f $$d/docker-compose.yml up -d --build; done
	@echo "Gateway: http://localhost:9000  |  health: http://localhost:9000/health/services"

build: network
	@for d in $(SERVICES); do docker compose $(ENV) -f $$d/docker-compose.yml build; done

down:
	@for d in $(SERVICES); do docker compose $(ENV) -f $$d/docker-compose.yml down 2>/dev/null || true; done
	@for d in $(UIS); do docker compose $(ENV) -f $$d/docker-compose.yml down 2>/dev/null || true; done
	docker compose $(ENV) -f infra/docker-compose.yml down

down-all: down

logs:
	docker compose $(ENV) -f services/$(s)/docker-compose.yml logs -f

# ─── UIs (built + served by nginx; expo dev for mobile) ──────────────────────
ui: network
	docker compose $(ENV) -f frontend/docker-compose.yml up -d --build
	docker compose $(ENV) -f admin/docker-compose.yml up -d --build
	@echo "Frontend: http://localhost:3002  |  Admin: http://localhost:3001"

down-ui:
	docker compose $(ENV) -f frontend/docker-compose.yml down 2>/dev/null || true
	docker compose $(ENV) -f admin/docker-compose.yml down 2>/dev/null || true

# ─── Individual service targets ───────────────────────────────────────────────
up-auth:          network ; docker compose $(ENV) -f services/auth_service/docker-compose.yml up -d --build
up-user:          network ; docker compose $(ENV) -f services/user_service/docker-compose.yml up -d --build
up-content:       network ; docker compose $(ENV) -f services/content_service/docker-compose.yml up -d --build
up-quiz:          network ; docker compose $(ENV) -f services/quiz_service/docker-compose.yml up -d --build
up-ai:            network ; docker compose $(ENV) -f services/ai_service/docker-compose.yml up -d --build
up-payment:       network ; docker compose $(ENV) -f services/payment_service/docker-compose.yml up -d --build
up-notification:  network ; docker compose $(ENV) -f services/notification_service/docker-compose.yml up -d --build
up-analytics:     network ; docker compose $(ENV) -f services/analytics_service/docker-compose.yml up -d --build
up-gamification:  network ; docker compose $(ENV) -f services/gamification_service/docker-compose.yml up -d --build
up-referral:      network ; docker compose $(ENV) -f services/referral_service/docker-compose.yml up -d --build
up-battle:        network ; docker compose $(ENV) -f services/battle_service/docker-compose.yml up -d --build
up-career:        network ; docker compose $(ENV) -f services/career_service/docker-compose.yml up -d --build
up-gateway:       network ; docker compose $(ENV) -f api_gateway/docker-compose.yml up -d --build

clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
