#
# zapbot - atalhos de build/deploy. Rode "make help" para ver os alvos.
#
# Cada comando passa o contexto explicitamente (docker --context ...), então
# o contexto global do Docker nunca é alterado: se algo falhar no meio, você
# não fica "preso" apontando para o servidor remoto.
#

COMPOSE_FILE := docker/docker-compose.yml

# Local
LOCAL_CONTEXT := default
DOCKER        := docker --context $(LOCAL_CONTEXT)
COMPOSE       := $(DOCKER) compose -f $(COMPOSE_FILE)

# Homeserver (tudo rodando em um Docker server na minha rede. use com cuidado.)
DOCKER_REMOTE_SERVER := ssh://root@itacoatiara.local
REMOTE_CONTEXT       := homelab
RDOCKER              := docker --context $(REMOTE_CONTEXT)
RCOMPOSE             := $(RDOCKER) compose -f $(COMPOSE_FILE)

DEV_SERVICE  := zapbot-dev
PROD_SERVICE := zapbot
VOLUMES      := zapbot_app_cache zapbot_wwebjs_auth
# O Compose marca com este rótulo tudo o que cria (containers e imagens do projeto)
PROJECT_LABEL := label=com.docker.compose.project=zapbot
DEV_VOLUMES  := zapbot_app_cache_dev zapbot_wwebjs_auth_dev

# Documentação (MkDocs) num virtualenv local, fora do Docker. Python 3.12, o
# mesmo do CI (no 3.14 o watchdog do "mkdocs serve" ainda não tem pacote pronto)
DOCS_PYTHON ?= $(shell command -v python3.12 || command -v python3)
DOCS_VENV := .venv-docs
DOCS_HOST ?= 127.0.0.1
DOCS_PORT ?= 8000
# O "mkdocs serve" usa o caminho do site_url (https://jpereira.github.io/zapbot/ → /zapbot/)
DOCS_PATH := $(shell sed -nE 's|^site_url: *https?://[^/]+||p' mkdocs.yml)

.DEFAULT_GOAL := build

.PHONY: help all build shell clean destroy prune docs \
	deploy.context deploy.up deploy.logs deploy.ps deploy.shell deploy.images \
	deploy.volume deploy.prune deploy.clean deploy.destroy

help: ## Mostra esta ajuda
	@grep -hE '^[a-zA-Z_.-]+:.*## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

#
# Development
#
all: build

build: ## Build da imagem zapbot-dev
	$(COMPOSE) build $(OPTS) $(DEV_SERVICE)

shell: ## Shell dentro do container de dev
	$(COMPOSE) run --rm --entrypoint "bash -l" $(DEV_SERVICE)

clean: ## Remove a imagem zapbot-dev
	$(DOCKER) rmi -f $(DEV_SERVICE)

destroy: ## clean + apaga os volumes de dev (sessão e cache!)
	-$(DOCKER) rm -f $(DEV_SERVICE)
	-$(MAKE) clean
	-$(DOCKER) volume rm -f $(DEV_VOLUMES)

# O virtualenv é recriado do zero quando o docs/requirements.txt muda
$(DOCS_VENV)/.instalado: docs/requirements.txt
	rm -rf $(DOCS_VENV)
	$(DOCS_PYTHON) -m venv $(DOCS_VENV)
	$(DOCS_VENV)/bin/pip install -q -r docs/requirements.txt
	@touch $@

docs: $(DOCS_VENV)/.instalado ## Site da documentação (o HEAD) local, recarregando ao salvar
	@echo "📖 Documentação em http://$(DOCS_HOST):$(DOCS_PORT)$(DOCS_PATH)  (Ctrl+C para parar)"
	@NO_MKDOCS_2_WARNING=1 $(DOCS_VENV)/bin/mkdocs serve -q -a $(DOCS_HOST):$(DOCS_PORT)

prune: ## Apaga mídia e mensagens do cache local
	rm -rf cache/media/
	sqlite3 cache/bot_database.db "DELETE FROM messages"

#
# Homeserver
#
deploy.context: ## Cria o contexto Docker remoto (se não existir)
	@$(DOCKER) context inspect $(REMOTE_CONTEXT) >/dev/null 2>&1 || \
		docker context create $(REMOTE_CONTEXT) --docker "host=$(DOCKER_REMOTE_SERVER)"

deploy.up: deploy.context ## Build + (re)cria o zapbot no servidor
	$(RDOCKER) image prune -f
	$(RCOMPOSE) build $(OPTS) $(PROD_SERVICE)
	$(RCOMPOSE) up -d --force-recreate $(PROD_SERVICE)

deploy.logs: deploy.context ## Segue os logs do zapbot
	$(RDOCKER) logs -f $(PROD_SERVICE)

deploy.ps: deploy.context ## Lista containers no servidor
	$(RDOCKER) ps

deploy.shell: deploy.context ## Shell dentro do zapbot
	$(RDOCKER) exec -it $(PROD_SERVICE) /bin/bash -l

deploy.images: deploy.context ## Lista imagens no servidor
	$(RDOCKER) images -a

deploy.volume: deploy.context ## Cria/inspeciona os volumes de produção
	@for v in $(VOLUMES); do $(RDOCKER) volume create $$v >/dev/null || true; done
	$(RDOCKER) volume inspect $(VOLUMES)

deploy.prune: deploy.context ## Apaga mídia e mensagens do cache em produção
	$(RDOCKER) exec -it $(PROD_SERVICE) rm -rf cache/tmp cache/media
	$(RDOCKER) exec -it $(PROD_SERVICE) sqlite3 cache/bot_database.db "DELETE FROM messages"

deploy.clean: deploy.context ## Remove container, imagem e build cache de produção
	-$(RDOCKER) rm -f $(PROD_SERVICE)
	-$(RDOCKER) rmi -f $(PROD_SERVICE)
	$(RDOCKER) builder prune -a -f

deploy.destroy: deploy.clean ## Remove containers, imagens e volumes do zapbot (sessão e cache!)
	ids=$$($(RDOCKER) ps -aq --filter $(PROJECT_LABEL)); [ -z "$$ids" ] || $(RDOCKER) rm -f $$ids
	ids=$$($(RDOCKER) images -q --filter $(PROJECT_LABEL) | sort -u); [ -z "$$ids" ] || $(RDOCKER) rmi -f $$ids
	$(RDOCKER) image prune -f
	-$(RDOCKER) volume rm -f $(VOLUMES)
