#
# zapbot - atalhos de desenvolvimento, testes e deploy. Rode "make help".
#
# Cada comando passa o contexto explicitamente (docker --context ...), então
# o contexto global do Docker nunca é alterado: se algo falhar no meio, você
# não fica "preso" apontando para o servidor remoto.
#

COMPOSE_FILE := docker/docker-compose.yml
NPM ?= npm
# Flags extras do node:test, por exemplo: TEST_ARGS=--test-name-pattern=mask
TEST_ARGS ?=
NPM_TEST = $(NPM) test

# DOCK_REMOTE=1 seleciona o homelab; definir só o endereço não muda o destino.
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

# Documentação (MkDocs) num virtualenv local, fora do Docker. Python 3.12, o
# mesmo do CI (no 3.14 o watchdog do "mkdocs serve" ainda não tem pacote pronto)
DOCS_PYTHON ?= $(shell command -v python3.12 || command -v python3)
DOCS_VENV := .venv-docs
DOCS_HOST ?= 127.0.0.1
DOCS_PORT ?= 8000
# O "mkdocs serve" usa o caminho do site_url (https://jpereira.github.io/zapbot/ → /zapbot/)
DOCS_PATH := $(shell sed -nE 's|^site_url: *https?://[^/]+||p' mkdocs.yml)

.DEFAULT_GOAL := build

.PHONY: help all context build up logs ps shell images volume clean destroy prune \
    deps test test.coverage lint check docs docs.deps docs.build

help: ## Mostra esta ajuda
	@echo "Destino: $(if $(filter 1,$(DOCK_REMOTE)),remoto,local) · $(DOCKER_CONTEXT) · $(SERVICE)"
	@grep -hE '^[a-zA-Z_.-]+:.*## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

#
# Development
#
all: build

deps: ## Instala dependências do lock, incluindo as de dev, sem baixar Chromium
	PUPPETEER_SKIP_DOWNLOAD=true $(NPM) ci --include=dev --no-audit --no-fund

test: $(if $(filter 1,$(DOCK_REMOTE)),context) ## Testes locais ou no container remoto
	$(RUN_TEST)

test.coverage: ## Testes no destino selecionado com cobertura de src/
	$(MAKE) test \
		TEST_ARGS="$(TEST_ARGS) --experimental-test-coverage --test-coverage-include=src/**"

lint: ## Confere o checkout local com ESLint
	$(NPM) run lint

check: ## Lint + testes + documentação do checkout local; para na primeira falha
	$(MAKE) DOCK_REMOTE=0 lint
	$(MAKE) DOCK_REMOTE=0 test
	$(MAKE) DOCK_REMOTE=0 docs.build

# O contexto global fica quieto no canto dele; cada comando leva o seu.
context: ## Prepara o contexto Docker selecionado
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

build: context ## Build da imagem de dev local ou de produção remota
	$(COMPOSE) build $(OPTS) $(SERVICE)

up: context ## Build + (re)cria o serviço no destino selecionado
	$(MAKE) build
	$(COMPOSE) up -d --force-recreate $(SERVICE)

logs: context ## Segue os logs do serviço selecionado
	$(DOCKER) logs -f $(SERVICE)

ps: context ## Lista containers do destino selecionado
	$(DOCKER) ps

shell: context ## Shell de dev local ou dentro do bot remoto
ifeq ($(DOCK_REMOTE),1)
	$(DOCKER) exec -it $(SERVICE) /bin/bash -l
else
	$(COMPOSE) run --rm --entrypoint "bash -l" $(SERVICE)
endif

images: context ## Lista imagens do destino selecionado
	$(DOCKER) images -a

volume: context ## Cria/inspeciona os volumes do ambiente selecionado
	@set -e; for v in $(VOLUMES); do $(DOCKER) volume create $$v >/dev/null; done
	$(DOCKER) volume inspect $(VOLUMES)

clean: context ## Remove container e imagem do ambiente selecionado, preservando os volumes
	-$(DOCKER) rm -f $(SERVICE)
	-$(DOCKER) rmi -f $(SERVICE)

destroy: clean ## Remove também os volumes do ambiente selecionado (sessão e cache!)
	$(DOCKER) volume rm -f $(VOLUMES)

# O virtualenv é recriado do zero quando o docs/requirements.txt muda
$(DOCS_VENV)/.instalado: docs/requirements.txt
	rm -rf $(DOCS_VENV)
	$(DOCS_PYTHON) -m venv $(DOCS_VENV)
	$(DOCS_VENV)/bin/pip install -q -r docs/requirements.txt
	@touch $@

docs: $(DOCS_VENV)/.instalado ## Site da documentação (o HEAD) local, recarregando ao salvar
	@echo "📖 Documentação em http://$(DOCS_HOST):$(DOCS_PORT)$(DOCS_PATH)  (Ctrl+C para parar)"
	@NO_MKDOCS_2_WARNING=1 $(DOCS_VENV)/bin/mkdocs serve -q -a $(DOCS_HOST):$(DOCS_PORT)

docs.deps: $(DOCS_VENV)/.instalado ## Prepara as dependências da documentação

docs.build: $(DOCS_VENV)/.instalado ## Gera o site e valida links e âncoras (modo estrito)
	NO_MKDOCS_2_WARNING=1 $(DOCS_VENV)/bin/mkdocs build --strict

prune: $(if $(filter 1,$(DOCK_REMOTE)),context) ## Apaga mídia e mensagens do cache selecionado
ifeq ($(DOCK_REMOTE),1)
	$(DOCKER) exec -w /app $(SERVICE) rm -rf cache/tmp cache/media
	$(DOCKER) exec -w /app $(SERVICE) sqlite3 cache/bot_database.db "DELETE FROM messages"
else
	rm -rf cache/media/
	sqlite3 cache/bot_database.db "DELETE FROM messages"
endif
