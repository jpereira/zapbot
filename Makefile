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
PROD_SERVICE := zapbot-prod
VOLUMES      := zapbot_app_cache zapbot_wwebjs_auth

.DEFAULT_GOAL := build

.PHONY: help all build shell clean prune \
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

prune: ## Deletes media and messages from the local cache
	rm -rf cache/media/
	sqlite3 cache/bot_database.db "DELETE FROM messages"

#
# Homeserver
#
deploy.context: ## Creates the remote Docker context (if it does not exist)
	@$(DOCKER) context inspect $(REMOTE_CONTEXT) >/dev/null 2>&1 || \
		docker context create $(REMOTE_CONTEXT) --docker "host=$(DOCKER_REMOTE_SERVER)"

deploy.up: deploy.context ## Build + (re)creates zapbot-prod on the server
	$(RDOCKER) image prune -f
	$(RCOMPOSE) build $(OPTS) $(PROD_SERVICE)
	$(RCOMPOSE) up -d --force-recreate $(PROD_SERVICE)

deploy.logs: deploy.context ## Follows zapbot-prod's logs
	$(RDOCKER) logs -f $(PROD_SERVICE)

deploy.ps: deploy.context ## Lists containers on the server
	$(RDOCKER) ps

deploy.shell: deploy.context ## Shell inside zapbot-prod
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

deploy.destroy: deploy.clean ## deploy.clean + deletes the volumes (session and cache!)
	-$(RDOCKER) volume rm -f $(VOLUMES)
