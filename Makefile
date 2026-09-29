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
PROD_SERVICE := zapbot-prod
VOLUMES      := zapbot_app_cache zapbot_wwebjs_auth
DEV_VOLUMES  := zapbot_app_cache_dev zapbot_wwebjs_auth_dev

.DEFAULT_GOAL := build

.PHONY: help all build shell clean destroy prune \
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

prune: ## Apaga mídia e mensagens do cache local
	rm -rf cache/media/
	sqlite3 cache/bot_database.db "DELETE FROM messages"

#
# Homeserver
#
deploy.context: ## Cria o contexto Docker remoto (se não existir)
	@$(DOCKER) context inspect $(REMOTE_CONTEXT) >/dev/null 2>&1 || \
		docker context create $(REMOTE_CONTEXT) --docker "host=$(DOCKER_REMOTE_SERVER)"

deploy.up: deploy.context ## Build + (re)cria o zapbot-prod no servidor
	$(RDOCKER) image prune -f
	$(RCOMPOSE) build $(OPTS) $(PROD_SERVICE)
	$(RCOMPOSE) up -d --force-recreate $(PROD_SERVICE)

deploy.logs: deploy.context ## Segue os logs do zapbot-prod
	$(RDOCKER) logs -f $(PROD_SERVICE)

deploy.ps: deploy.context ## Lista containers no servidor
	$(RDOCKER) ps

deploy.shell: deploy.context ## Shell dentro do zapbot-prod
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

deploy.destroy: deploy.clean ## deploy.clean + apaga os volumes (sessão e cache!)
	-$(RDOCKER) volume rm -f $(VOLUMES)
