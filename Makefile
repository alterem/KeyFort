.PHONY: help init up up-build down restart logs ps pull build shell backup destroy

COMPOSE ?= docker compose
IMAGE ?= ghcr.io/alterem/keyfort:latest
PORT ?= 3001

help:
	@printf '%s\n' \
	  'KeyFort Docker commands:' \
	  '  make init       Create a production .env with a random encryption key' \
	  '  make up         Pull the configured image and start KeyFort' \
	  '  make up-build   Build the local image and start KeyFort' \
	  '  make down       Stop the Compose service' \
	  '  make restart    Restart the Compose service' \
	  '  make logs       Follow application logs' \
	  '  make ps         Show service status' \
	  '  make build      Build the local Docker image' \
	  '  make pull       Pull IMAGE and start it' \
	  '  make shell      Open a shell in the running container' \
	  '  make backup     Export the SQLite data volume' \
	  '  make destroy    Stop services and remove the data volume'

init:
	@if [ -f .env ]; then \
		echo '.env already exists'; \
	else \
		command -v openssl >/dev/null 2>&1 || { echo 'openssl is required to create the encryption key'; exit 1; }; \
		printf '%s\n' \
		  'NODE_ENV=production' \
		  'PORT=$(PORT)' \
		  'DATABASE_PATH=/app/data/keyfort.db' \
		  "TOTP_ENCRYPTION_KEY=$$(openssl rand -base64 32)" \
		  '# DEFAULT_TOTP_SECRET=optional-demo-secret' > .env; \
		chmod 600 .env; \
		echo 'Created .env with a random TOTP_ENCRYPTION_KEY'; \
	fi

up: init
	KEYFORT_IMAGE=$(IMAGE) $(COMPOSE) pull
	KEYFORT_IMAGE=$(IMAGE) $(COMPOSE) up -d

up-build: init build
	KEYFORT_IMAGE=$(IMAGE) $(COMPOSE) up -d

down:
	$(COMPOSE) down

restart: down up

logs:
	$(COMPOSE) logs -f --tail=200

ps:
	$(COMPOSE) ps

build:
	docker build --tag $(IMAGE) .

pull: init
	KEYFORT_IMAGE=$(IMAGE) $(COMPOSE) pull
	KEYFORT_IMAGE=$(IMAGE) $(COMPOSE) up -d

shell:
	$(COMPOSE) exec keyfort sh

backup:
	@mkdir -p backups
	@file="backups/keyfort-$$(date +%Y%m%d-%H%M%S).tar.gz"; \
	$(COMPOSE) exec -T keyfort tar -czf - -C /app/data . > "$$file"; \
	echo "Created $$file"

destroy:
	@echo 'This removes the KeyFort database volume.'
	@$(COMPOSE) down -v
