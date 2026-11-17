#
# zapbot - build, test and deploy shortcuts. Run "make help".
#
# Each command passes the context explicitly (docker --context ...), so
# the global Docker context is never changed: if something fails midway, you
# does not get "stuck" pointing to the remote server.
#
# The recipe commands stay hidden; to debug, show them all with
# "make Q= <target>" (or "make V=1 <target>"), including in the recursive $(MAKE)s.
#

V ?= 0
ifeq ($(V),1)
Q :=
else
Q ?= @
endif

# Quiet, make also does not announce entering the recursive $(MAKE)s
ifeq ($(Q),@)
MAKEFLAGS += --no-print-directory
endif

COMPOSE_FILE := docker/docker-compose.yml
NPM ?= npm
# Cookie file (./scripts/get-cookie.sh) that "make cookies" copies into the container
FILE ?= cookies.txt
# Extra node:test flags, for example: TEST_ARGS=--test-name-pattern=mask
TEST_ARGS ?=
NPM_TEST = $(NPM) test

# DOCK_REMOTE=1 selects the homelab; setting only the address does not change the target.
DOCK_REMOTE ?= 0
LOCAL_CONTEXT ?= default
DOCKER_REMOTE_SERVER ?= ssh://root@homelab.local
REMOTE_CONTEXT ?= homelab
SERVICE := zapbot
# Seconds "make smoke" waits for the bot to come up (and connect to WhatsApp)
SMOKE_PRAZO ?= 120
COOKIES_DEST := /app/cache/cookies.txt
VOLUMES := zapbot_app_cache zapbot_wwebjs_auth

ifeq ($(DOCK_REMOTE),1)
DOCKER_CONTEXT := $(REMOTE_CONTEXT)
RUN_TEST = $(DOCKER) exec -w /app $(SERVICE) env \
    TEST_ARGS="$(TEST_ARGS)" DEBUG_TESTES="$(DEBUG_TESTES)" $(NPM_TEST)
else ifeq ($(DOCK_REMOTE),0)
DOCKER_CONTEXT := $(LOCAL_CONTEXT)
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

.DEFAULT_GOAL := help

.PHONY: help all context build deploy smoke logs ps shell images volume cookies clean recreate destroy prune \
    deps test test.coverage lint check docs docs.deps docs.build

help: ## Shows this help
	@echo "Destino: $(if $(filter 1,$(DOCK_REMOTE)),remoto,local) · $(DOCKER_CONTEXT) · $(SERVICE)"
	$(Q)grep -hE '^[a-zA-Z_.-]+:.*## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo ""
	@echo "Variáveis (use: make VAR=valor <alvo>):"
	@printf "  \033[33m%-22s\033[0m %s\n" \
		"DOCK_REMOTE" "0 = local (padrão), 1 = servidor remoto · atual: $(DOCK_REMOTE)" \
		"DOCKER_REMOTE_SERVER" "endereço SSH do servidor remoto · atual: $(DOCKER_REMOTE_SERVER)" \
		"REMOTE_CONTEXT" "nome do contexto Docker remoto · atual: $(REMOTE_CONTEXT)" \
		"LOCAL_CONTEXT" "nome do contexto Docker local · atual: $(LOCAL_CONTEXT)" \
		"FILE" "arquivo de cookies do make cookies · atual: $(FILE)" \
		"OPTS" "flags extras do docker compose build (ex.: OPTS=--no-cache)" \
		"TEST_ARGS" "flags extras do node:test (ex.: TEST_ARGS=--test-name-pattern=mask)" \
		"NPM" "comando do npm · atual: $(NPM)" \
		"V / Q" "V=1 (ou Q=) mostra cada comando executado · atual: V=$(V)" \
		"DOCS_HOST" "endereço do make docs · atual: $(DOCS_HOST)" \
		"DOCS_PORT" "porta do make docs · atual: $(DOCS_PORT)" \
		"DOCS_PYTHON" "Python do virtualenv da documentação · atual: $(DOCS_PYTHON)"

#
# Code
#
all: build ## Alias for build

deps: ## Installs the lock's dependencies, including npm's development ones (ESLint), without downloading Chromium
	$(Q)PUPPETEER_SKIP_DOWNLOAD=true $(NPM) ci --include=dev --no-audit --no-fund

test: $(if $(filter 1,$(DOCK_REMOTE)),context) ## Local tests or in the remote container
	$(Q)$(RUN_TEST)

test.coverage: ## Tests on the selected target with src/ coverage
	$(Q)$(MAKE) test \
		TEST_ARGS="$(TEST_ARGS) --experimental-test-coverage --test-coverage-include=src/**"

lint: ## Checks the local checkout with ESLint
	$(Q)$(NPM) run lint

check: ## Lint + tests + documentation of the local checkout; stops at the first failure
	$(Q)$(MAKE) DOCK_REMOTE=0 lint
	$(Q)$(MAKE) DOCK_REMOTE=0 test
	$(Q)$(MAKE) DOCK_REMOTE=0 docs.build

# The global context stays quiet in its corner; each command carries its own.
context: ## Prepares the selected Docker context
ifeq ($(DOCK_REMOTE),1)
	$(Q)set -e; if docker context inspect $(REMOTE_CONTEXT) >/dev/null 2>&1; then \
		host=$$(docker context inspect --format '{{.Endpoints.docker.Host}}' $(REMOTE_CONTEXT)); \
		if [ "$$host" != "$(DOCKER_REMOTE_SERVER)" ]; then \
			docker context update $(REMOTE_CONTEXT) --docker "host=$(DOCKER_REMOTE_SERVER)"; \
		fi; \
	else \
		docker context create $(REMOTE_CONTEXT) --docker "host=$(DOCKER_REMOTE_SERVER)"; \
	fi
else
	$(Q)$(DOCKER) context inspect $(LOCAL_CONTEXT) >/dev/null
endif

build: context ## Builds the image on the selected target
	$(Q)$(COMPOSE) build $(OPTS) $(SERVICE)

deploy: context ## Build + (re)creates the service on the selected target and checks that it came up
	$(Q)$(MAKE) build
	$(Q)$(COMPOSE) up -d --force-recreate $(SERVICE)
	$(Q)$(MAKE) smoke

smoke: context ## Checks that the selected target's bot came up (commands loaded, WhatsApp connected)
	$(Q)./scripts/smoke.sh "$(DOCKER)" $(SERVICE) $(SMOKE_PRAZO)

# A deploy's new container has another id: a plain `logs -f` dies on it. Here the loop reopens the log
# (without repeating what already came out) until you quit with Ctrl+C.
logs: context ## Follows the selected service's logs; keeps going after a deploy/restart
	$(Q)trap 'exit 0' INT; args="--tail 50"; while true; do \
		inicio=$$(date -u +%Y-%m-%dT%H:%M:%SZ); \
		$(DOCKER) logs -f $$args $(SERVICE) 2>&1 || true; \
		args="--since $$inicio"; \
		echo "[logs] $(SERVICE) parou ou foi recriado; esperando voltar..."; sleep 2; \
	done

ps: context ## Lists the selected target's containers
	$(Q)$(DOCKER) ps

shell: context ## Shell inside the bot on the selected target
	$(Q)$(DOCKER) exec -it $(SERVICE) /bin/bash -l

images: context ## Lists the selected target's images
	$(Q)$(DOCKER) images -a

volume: context ## Creates/inspects the selected environment's volumes
	$(Q)set -e; for v in $(VOLUMES); do $(DOCKER) volume create $$v >/dev/null; done
	$(Q)$(DOCKER) volume inspect $(VOLUMES)

cookies: context ## Copies FILE (cookies.txt, from ./scripts/get-cookie.sh) into the container cache; /get starts using it
	$(Q)test -f "$(FILE)" || { echo "Arquivo não encontrado: $(FILE) (gere com ./scripts/get-cookie.sh x.com twitter.com)"; exit 1; }
	$(Q)$(DOCKER) cp "$(FILE)" $(SERVICE):$(COOKIES_DEST)
	$(Q)$(DOCKER) exec $(SERVICE) chmod 600 $(COOKIES_DEST)
	@echo "🍪 $(FILE) -> $(SERVICE):$(COOKIES_DEST)"

clean: context ## Removes the selected environment's container and image, preserving the volumes
	-$(Q)$(DOCKER) rm -f $(SERVICE)
	-$(Q)$(DOCKER) rmi -f $(SERVICE)
	-$(Q)$(DOCKER) builder prune -f -a

# clean removes container and image (and the builder cache); deploy then builds without cache and recreates the
# service. The volumes (WhatsApp session and cache) are not even touched: only destroy removes them.
recreate: clean ## Recreates image (no cache) and container from scratch on the selected target, preserving the volumes
	$(Q)$(MAKE) deploy OPTS="--no-cache --pull"

destroy: clean ## Also removes the selected environment's volumes (session and cache!)
	$(Q)$(DOCKER) volume rm -f $(VOLUMES)

# The virtualenv is recreated from scratch when docs/requirements.txt changes
$(DOCS_VENV)/.instalado: docs/requirements.txt
	$(Q)rm -rf $(DOCS_VENV)
	$(Q)$(DOCS_PYTHON) -m venv $(DOCS_VENV)
	$(Q)$(DOCS_VENV)/bin/pip install -q -r docs/requirements.txt
	$(Q)touch $@

docs: $(DOCS_VENV)/.instalado ## Local documentation site (HEAD), reloading on save
	@echo "📖 Documentação em http://$(DOCS_HOST):$(DOCS_PORT)$(DOCS_PATH)  (Ctrl+C para parar)"
	$(Q)NO_MKDOCS_2_WARNING=1 $(DOCS_VENV)/bin/mkdocs serve -q -a $(DOCS_HOST):$(DOCS_PORT)

docs.deps: $(DOCS_VENV)/.instalado ## Prepares the documentation dependencies

docs.build: $(DOCS_VENV)/.instalado ## Builds the site and validates links and anchors (strict mode)
	$(Q)NO_MKDOCS_2_WARNING=1 $(DOCS_VENV)/bin/mkdocs build --strict

prune: context ## Deletes media and messages from the bot cache on the selected target
	$(Q)$(DOCKER) exec -w /app $(SERVICE) rm -rf cache/tmp cache/media
	$(Q)$(DOCKER) exec -w /app $(SERVICE) sqlite3 cache/zapbot.db "DELETE FROM messages"

