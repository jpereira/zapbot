#
# zapbot - atalhos de desenvolvimento, testes e deploy. Rode "make help".
#
# Cada comando passa o contexto explicitamente (docker --context ...), então
# o contexto global do Docker nunca é alterado: se algo falhar no meio, você
# não fica "preso" apontando para o servidor remoto.
#
# Os comandos das receitas ficam ocultos; para depurar, mostre todos com
# "make Q= <alvo>" (ou "make V=1 <alvo>"), inclusive nos $(MAKE) recursivos.
#

V ?= 0
ifeq ($(V),1)
Q :=
else
Q ?= @
endif

# Quieto, o make também não anuncia a entrada nos $(MAKE) recursivos
ifeq ($(Q),@)
MAKEFLAGS += --no-print-directory
endif

COMPOSE_FILE := docker/docker-compose.yml
NPM ?= npm
# Flags extras do node:test, por exemplo: TEST_ARGS=--test-name-pattern=mask
TEST_ARGS ?=
NPM_TEST = $(NPM) test

# DOCK_REMOTE=1 seleciona o homelab; definir só o endereço não muda o destino.
DOCK_REMOTE ?= 0
LOCAL_CONTEXT ?= default
DOCKER_REMOTE_SERVER ?= ssh://root@homelab.local
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

.DEFAULT_GOAL := help

.PHONY: help all context build up logs ps shell images volume clean recreate destroy prune \
    deps test test.coverage lint check docs docs.deps docs.build

help: ## Mostra esta ajuda
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
		"OPTS" "flags extras do docker compose build (ex.: OPTS=--no-cache)" \
		"TEST_ARGS" "flags extras do node:test (ex.: TEST_ARGS=--test-name-pattern=mask)" \
		"NPM" "comando do npm · atual: $(NPM)" \
		"V / Q" "V=1 (ou Q=) mostra cada comando executado · atual: V=$(V)" \
		"DOCS_HOST" "endereço do make docs · atual: $(DOCS_HOST)" \
		"DOCS_PORT" "porta do make docs · atual: $(DOCS_PORT)" \
		"DOCS_PYTHON" "Python do virtualenv da documentação · atual: $(DOCS_PYTHON)"

#
# Development
#
all: build ## Alias de build

deps: ## Instala dependências do lock, incluindo as de dev, sem baixar Chromium
	$(Q)PUPPETEER_SKIP_DOWNLOAD=true $(NPM) ci --include=dev --no-audit --no-fund

test: $(if $(filter 1,$(DOCK_REMOTE)),context) ## Testes locais ou no container remoto
	$(Q)$(RUN_TEST)

test.coverage: ## Testes no destino selecionado com cobertura de src/
	$(Q)$(MAKE) test \
		TEST_ARGS="$(TEST_ARGS) --experimental-test-coverage --test-coverage-include=src/**"

lint: ## Confere o checkout local com ESLint
	$(Q)$(NPM) run lint

check: ## Lint + testes + documentação do checkout local; para na primeira falha
	$(Q)$(MAKE) DOCK_REMOTE=0 lint
	$(Q)$(MAKE) DOCK_REMOTE=0 test
	$(Q)$(MAKE) DOCK_REMOTE=0 docs.build

# O contexto global fica quieto no canto dele; cada comando leva o seu.
context: ## Prepara o contexto Docker selecionado
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

build: context ## Build da imagem de dev local ou de produção remota
	$(Q)$(COMPOSE) build $(OPTS) $(SERVICE)

up: context ## Build + (re)cria o serviço no destino selecionado
	$(Q)$(MAKE) build
	$(Q)$(COMPOSE) up -d --force-recreate $(SERVICE)

logs: context ## Segue os logs do serviço selecionado
	$(Q)$(DOCKER) logs -f $(SERVICE)

ps: context ## Lista containers do destino selecionado
	$(Q)$(DOCKER) ps

shell: context ## Shell de dev local ou dentro do bot remoto
ifeq ($(DOCK_REMOTE),1)
	$(Q)$(DOCKER) exec -it $(SERVICE) /bin/bash -l
else
	$(Q)$(COMPOSE) run --rm --entrypoint "bash -l" $(SERVICE)
endif

images: context ## Lista imagens do destino selecionado
	$(Q)$(DOCKER) images -a

volume: context ## Cria/inspeciona os volumes do ambiente selecionado
	$(Q)set -e; for v in $(VOLUMES); do $(DOCKER) volume create $$v >/dev/null; done
	$(Q)$(DOCKER) volume inspect $(VOLUMES)

clean: context ## Remove container e imagem do ambiente selecionado, preservando os volumes
	-$(Q)$(DOCKER) rm -f $(SERVICE)
	-$(Q)$(DOCKER) rmi -f $(SERVICE)
	-$(Q)$(DOCKER) builder prune -f -a

# O clean tira container e imagem (e o cache do builder); o up então builda sem cache e recria o
# serviço. Os volumes (sessão do WhatsApp e cache) nem são tocados: só o destroy os remove.
recreate: clean ## Recria imagem (sem cache) e container do zero no destino selecionado, preservando os volumes
	$(Q)$(MAKE) up OPTS="--no-cache --pull"

destroy: clean ## Remove também os volumes do ambiente selecionado (sessão e cache!)
	$(Q)$(DOCKER) volume rm -f $(VOLUMES)

# O virtualenv é recriado do zero quando o docs/requirements.txt muda
$(DOCS_VENV)/.instalado: docs/requirements.txt
	$(Q)rm -rf $(DOCS_VENV)
	$(Q)$(DOCS_PYTHON) -m venv $(DOCS_VENV)
	$(Q)$(DOCS_VENV)/bin/pip install -q -r docs/requirements.txt
	$(Q)touch $@

docs: $(DOCS_VENV)/.instalado ## Site da documentação (o HEAD) local, recarregando ao salvar
	@echo "📖 Documentação em http://$(DOCS_HOST):$(DOCS_PORT)$(DOCS_PATH)  (Ctrl+C para parar)"
	$(Q)NO_MKDOCS_2_WARNING=1 $(DOCS_VENV)/bin/mkdocs serve -q -a $(DOCS_HOST):$(DOCS_PORT)

docs.deps: $(DOCS_VENV)/.instalado ## Prepara as dependências da documentação

docs.build: $(DOCS_VENV)/.instalado ## Gera o site e valida links e âncoras (modo estrito)
	$(Q)NO_MKDOCS_2_WARNING=1 $(DOCS_VENV)/bin/mkdocs build --strict

prune: $(if $(filter 1,$(DOCK_REMOTE)),context) ## Apaga mídia e mensagens do cache selecionado
ifeq ($(DOCK_REMOTE),1)
	$(Q)$(DOCKER) exec -w /app $(SERVICE) rm -rf cache/tmp cache/media
	$(Q)$(DOCKER) exec -w /app $(SERVICE) sqlite3 cache/bot_database.db "DELETE FROM messages"
else
	$(Q)rm -rf cache/media/
	$(Q)sqlite3 cache/bot_database.db "DELETE FROM messages"
endif
