#
# zapbot - development, test and deploy shortcuts. Run "make help".
#
# Each command passes the context explicitly (docker --context ...), so
# the global Docker context is never changed: if something fails midway, you
# does not get "stuck" pointing to the remote server.
#

COMPOSE_FILE := docker/docker-compose.yml
NPM ?= npm
# Extra node:test flags, for example: TEST_ARGS=--test-name-pattern=mask
TEST_ARGS ?=
NPM_TEST = $(NPM) test

# DOCK_REMOTE=1 selects the homelab; setting only the address does not change the target.
DOCK_REMOTE ?= 0
LOCAL_CONTEXT ?= default
DOCKER_REMOTE_SERVER ?= ssh://root@itacoatiara.local
REMOTE_CONTEXT ?= homelab
DEV_SERVICE := zapbot-dev
PROD_SERVICE := zapbot

ifeq ($(DOCK_REMOTE),1)
DOCKER_CONTEXT := $(REMOTE_CONTEXT)
SERVICE := $(PROD_SERVICE)
VOLUMES := zapbot_app_cache zapbot_wwebjs_auth
RUN_TEST = $(DOCKER) exec -w /app $(SERVICE) env \
    TEST_ARGS="$(TEST_ARGS)" DEBUG_TESTES="$(DEBUG_TESTES)" $(NPM_TEST)
else ifeq ($(DOCK_REMOTE),0)
DOCKER_CONTEXT := $(LOCAL_CONTEXT)
SERVICE := $(DEV_SERVICE)
VOLUMES := zapbot_app_cache_dev zapbot_wwebjs_auth_dev
RUN_TEST = TEST_ARGS="$(TEST_ARGS)" $(NPM_TEST)
else
$(error DOCK_REMOTE deve ser 0 (local) ou 1 (remoto))
endif

DOCKER := docker --context $(DOCKER_CONTEXT)
COMPOSE := $(DOCKER) compose -f $(COMPOSE_FILE)

# Documentation (MkDocs) in a local virtualenv, outside Docker. Python 3.12, the
# same as the CI (on 3.14 the "mkdocs serve" watchdog does not have a ready package yet)
DOCS_PYTHON ?= $(shell command -v python3.12 || command -v python3)
DOCS_VENV := .venv-docs
DOCS_HOST ?= 127.0.0.1
DOCS_PORT ?= 8000
# "mkdocs serve" uses the site_url path (https://jpereira.github.io/zapbot/ → /zapbot/)
DOCS_PATH := $(shell sed -nE 's|^site_url: *https?://[^/]+||p' mkdocs.yml)

.DEFAULT_GOAL := build

.PHONY: help all context build up logs ps shell images volume clean destroy prune \
    deps test test.coverage lint check docs docs.deps docs.build

help: ## Shows this help
	@echo "Destino: $(if $(filter 1,$(DOCK_REMOTE)),remoto,local) · $(DOCKER_CONTEXT) · $(SERVICE)"
	@grep -hE '^[a-zA-Z_.-]+:.*## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

#
# Development
#
all: build

deps: ## Installs the lock's dependencies, including the dev ones, without downloading Chromium
	PUPPETEER_SKIP_DOWNLOAD=true $(NPM) ci --include=dev --no-audit --no-fund

test: $(if $(filter 1,$(DOCK_REMOTE)),context) ## Local tests or in the remote container
	$(RUN_TEST)

test.coverage: ## Tests on the selected target with src/ coverage
	$(MAKE) test \
		TEST_ARGS="$(TEST_ARGS) --experimental-test-coverage --test-coverage-include=src/**"

lint: ## Checks the local checkout with ESLint
	$(NPM) run lint

check: ## Lint + tests + documentation of the local checkout; stops at the first failure
	$(MAKE) DOCK_REMOTE=0 lint
	$(MAKE) DOCK_REMOTE=0 test
	$(MAKE) DOCK_REMOTE=0 docs.build

# The global context stays quiet in its corner; each command carries its own.
context: ## Prepares the selected Docker context
ifeq ($(DOCK_REMOTE),1)
	@set -e; if docker context inspect $(REMOTE_CONTEXT) >/dev/null 2>&1; then \
		host=$$(docker context inspect --format '{{.Endpoints.docker.Host}}' $(REMOTE_CONTEXT)); \
		if [ "$$host" != "$(DOCKER_REMOTE_SERVER)" ]; then \
			docker context update $(REMOTE_CONTEXT) --docker "host=$(DOCKER_REMOTE_SERVER)"; \
		fi; \
	else \
		docker context create $(REMOTE_CONTEXT) --docker "host=$(DOCKER_REMOTE_SERVER)"; \
	fi
else
	@$(DOCKER) context inspect $(LOCAL_CONTEXT) >/dev/null
endif

build: context ## Builds the local dev or remote production image
	$(COMPOSE) build $(OPTS) $(SERVICE)

up: context ## Build + (re)creates the service on the selected target
	$(MAKE) build
	$(COMPOSE) up -d --force-recreate $(SERVICE)

logs: context ## Follows the selected service's logs
	$(DOCKER) logs -f $(SERVICE)

ps: context ## Lists the selected target's containers
	$(DOCKER) ps

shell: context ## Local dev shell or inside the remote bot
ifeq ($(DOCK_REMOTE),1)
	$(DOCKER) exec -it $(SERVICE) /bin/bash -l
else
	$(COMPOSE) run --rm --entrypoint "bash -l" $(SERVICE)
endif

images: context ## Lists the selected target's images
	$(DOCKER) images -a

volume: context ## Creates/inspects the selected environment's volumes
	@set -e; for v in $(VOLUMES); do $(DOCKER) volume create $$v >/dev/null; done
	$(DOCKER) volume inspect $(VOLUMES)

clean: context ## Removes the selected environment's container and image, preserving the volumes
	-$(DOCKER) rm -f $(SERVICE)
	-$(DOCKER) rmi -f $(SERVICE)

destroy: clean ## Also removes the selected environment's volumes (session and cache!)
	$(DOCKER) volume rm -f $(VOLUMES)

# The virtualenv is recreated from scratch when docs/requirements.txt changes
$(DOCS_VENV)/.instalado: docs/requirements.txt
	rm -rf $(DOCS_VENV)
	$(DOCS_PYTHON) -m venv $(DOCS_VENV)
	$(DOCS_VENV)/bin/pip install -q -r docs/requirements.txt
	@touch $@

docs: $(DOCS_VENV)/.instalado ## Local documentation site (HEAD), reloading on save
	@echo "📖 Documentação em http://$(DOCS_HOST):$(DOCS_PORT)$(DOCS_PATH)  (Ctrl+C para parar)"
	@NO_MKDOCS_2_WARNING=1 $(DOCS_VENV)/bin/mkdocs serve -q -a $(DOCS_HOST):$(DOCS_PORT)

docs.deps: $(DOCS_VENV)/.instalado ## Prepares the documentation dependencies

docs.build: $(DOCS_VENV)/.instalado ## Builds the site and validates links and anchors (strict mode)
	NO_MKDOCS_2_WARNING=1 $(DOCS_VENV)/bin/mkdocs build --strict

prune: $(if $(filter 1,$(DOCK_REMOTE)),context) ## Deletes media and messages from the selected cache
ifeq ($(DOCK_REMOTE),1)
	$(DOCKER) exec -w /app $(SERVICE) rm -rf cache/tmp cache/media
	$(DOCKER) exec -w /app $(SERVICE) sqlite3 cache/bot_database.db "DELETE FROM messages"
else
	rm -rf cache/media/
	sqlite3 cache/bot_database.db "DELETE FROM messages"
endif
