#
# zapbot - build/deploy shortcuts. Run "make help" to see the targets.
#
# Each command passes the context explicitly (docker --context ...), so
# the global Docker context is never changed: if something fails midway, you
# does not get "stuck" pointing to the remote server.
#

COMPOSE_FILE := docker/docker-compose.yml

# Local
LOCAL_CONTEXT := default
DOCKER        := docker --context $(LOCAL_CONTEXT)
COMPOSE       := $(DOCKER) compose -f $(COMPOSE_FILE)

# Homeserver (everything running on a Docker server on my network. use with care.)
DOCKER_REMOTE_SERVER := ssh://root@itacoatiara.local
REMOTE_CONTEXT       := homelab
RDOCKER              := docker --context $(REMOTE_CONTEXT)
RCOMPOSE             := $(RDOCKER) compose -f $(COMPOSE_FILE)

DEV_SERVICE  := zapbot-dev
PROD_SERVICE := zapbot
VOLUMES      := zapbot_app_cache zapbot_wwebjs_auth
# Compose marks with this label everything it creates (containers and images of the project)
PROJECT_LABEL := label=com.docker.compose.project=zapbot
DEV_VOLUMES  := zapbot_app_cache_dev zapbot_wwebjs_auth_dev

# Documentation (MkDocs) in a local virtualenv, outside Docker. Python 3.12, the
# same as the CI (on 3.14 the "mkdocs serve" watchdog does not have a ready package yet)
DOCS_PYTHON ?= $(shell command -v python3.12 || command -v python3)
DOCS_VENV := .venv-docs
DOCS_HOST ?= 127.0.0.1
DOCS_PORT ?= 8000
# "mkdocs serve" uses the site_url path (https://jpereira.github.io/zapbot/ → /zapbot/)
DOCS_PATH := $(shell sed -nE 's|^site_url: *https?://[^/]+||p' mkdocs.yml)

.DEFAULT_GOAL := build

.PHONY: help all build shell clean destroy prune docs \
	deploy.context deploy.up deploy.logs deploy.ps deploy.shell deploy.images \
	deploy.volume deploy.prune deploy.clean deploy.destroy

help: ## Shows this help
	@grep -hE '^[a-zA-Z_.-]+:.*## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

#
# Development
#
all: build

build: ## Builds the zapbot-dev image
	$(COMPOSE) build $(OPTS) $(DEV_SERVICE)

shell: ## Shell inside the dev container
	$(COMPOSE) run --rm --entrypoint "bash -l" $(DEV_SERVICE)

clean: ## Removes the zapbot-dev image
	$(DOCKER) rmi -f $(DEV_SERVICE)

destroy: ## clean + deletes the dev volumes (session and cache!)
	-$(DOCKER) rm -f $(DEV_SERVICE)
	-$(MAKE) clean
	-$(DOCKER) volume rm -f $(DEV_VOLUMES)

# The virtualenv is recreated from scratch when docs/requirements.txt changes
$(DOCS_VENV)/.instalado: docs/requirements.txt
	rm -rf $(DOCS_VENV)
	$(DOCS_PYTHON) -m venv $(DOCS_VENV)
	$(DOCS_VENV)/bin/pip install -q -r docs/requirements.txt
	@touch $@

docs: $(DOCS_VENV)/.instalado ## Local documentation site (HEAD), reloading on save
	@echo "📖 Documentação em http://$(DOCS_HOST):$(DOCS_PORT)$(DOCS_PATH)  (Ctrl+C para parar)"
	@NO_MKDOCS_2_WARNING=1 $(DOCS_VENV)/bin/mkdocs serve -q -a $(DOCS_HOST):$(DOCS_PORT)

prune: ## Deletes media and messages from the local cache
	rm -rf cache/media/
	sqlite3 cache/bot_database.db "DELETE FROM messages"

#
# Homeserver
#
deploy.context: ## Creates the remote Docker context (if it does not exist)
	@$(DOCKER) context inspect $(REMOTE_CONTEXT) >/dev/null 2>&1 || \
		docker context create $(REMOTE_CONTEXT) --docker "host=$(DOCKER_REMOTE_SERVER)"

deploy.up: deploy.context ## Build + (re)creates zapbot on the server
	$(RDOCKER) image prune -f
	$(RCOMPOSE) build $(OPTS) $(PROD_SERVICE)
	$(RCOMPOSE) up -d --force-recreate $(PROD_SERVICE)

deploy.logs: deploy.context ## Follows zapbot's logs
	$(RDOCKER) logs -f $(PROD_SERVICE)

deploy.ps: deploy.context ## Lists containers on the server
	$(RDOCKER) ps

deploy.shell: deploy.context ## Shell inside zapbot
	$(RDOCKER) exec -it $(PROD_SERVICE) /bin/bash -l

deploy.images: deploy.context ## Lists images on the server
	$(RDOCKER) images -a

deploy.volume: deploy.context ## Creates/inspects the production volumes
	@for v in $(VOLUMES); do $(RDOCKER) volume create $$v >/dev/null || true; done
	$(RDOCKER) volume inspect $(VOLUMES)

deploy.prune: deploy.context ## Deletes media and messages from the cache in production
	$(RDOCKER) exec -it $(PROD_SERVICE) rm -rf cache/tmp cache/media
	$(RDOCKER) exec -it $(PROD_SERVICE) sqlite3 cache/bot_database.db "DELETE FROM messages"

deploy.clean: deploy.context ## Removes the production container, image and build cache
	-$(RDOCKER) rm -f $(PROD_SERVICE)
	-$(RDOCKER) rmi -f $(PROD_SERVICE)
	$(RDOCKER) builder prune -a -f

deploy.destroy: deploy.clean ## Removes zapbot's containers, images and volumes (session and cache!)
	ids=$$($(RDOCKER) ps -aq --filter $(PROJECT_LABEL)); [ -z "$$ids" ] || $(RDOCKER) rm -f $$ids
	ids=$$($(RDOCKER) images -q --filter $(PROJECT_LABEL) | sort -u); [ -z "$$ids" ] || $(RDOCKER) rmi -f $$ids
	$(RDOCKER) image prune -f
	-$(RDOCKER) volume rm -f $(VOLUMES)
