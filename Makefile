all: build

# Development
clean:
	docker context use default
	docker rmi -f zapbot-dev

build:
	docker context use default
	docker compose -f docker/docker-compose.yml build zapbot-dev

shell:
	docker context use default
	docker compose -f docker/docker-compose.yml run --rm --entrypoint "bash -l" zapbot-dev 

prune:
	rm -rf cache/media/
	sqlite3 cache/bot_database.db "DELETE FROM messages"

#
# Homeserver
#
# tudo rodando em um Docker server na minha rede. use com cuidado.
# Obs: fiz de qualquer jeito, se achou bagunçado? foda-se!
#
DOCKER_REMOTE_SERVER := ssh://root@itacoatiara.local

deploy.up: 
	docker context create homelab --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use homelab
	docker image prune -f
	docker compose -f docker/docker-compose.yml build $(OPTS) zapbot-prod
	docker compose -f docker/docker-compose.yml up -d --force-recreate zapbot-prod
	docker context use default

deploy.logs:
	docker context create homelab --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use homelab
	docker logs -f zapbot-prod
	docker context use default

deploy.ps:
	docker context create homelab --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use homelab
	docker ps
	docker context use default

deploy.clean:
	docker context create homelab --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use homelab
	docker rm -f zapbot-prod || true
	docker rmi -f zapbot-prod  || true
	yes | docker builder prune -a
	docker context use default

deploy.prune:
	docker context create homelab --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use homelab
	docker exec -it zapbot-prod rm -rf cache/tmp cache/media
	docker exec -it zapbot-prod sqlite3 cache/bot_database.db "DELETE FROM messages"
	docker context use default

deploy.images:
	docker context create homelab --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use homelab
	docker images -a
	docker context use default

deploy.shell:
	docker context create homelab --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use homelab
	docker exec -it zapbot-prod /bin/bash -l
	docker context use default

deploy.volume:
	docker context create homelab --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use homelab
	docker volume create zapbot_app_cache || true
	docker volume create zapbot_wwebjs_auth || true
	docker volume inspect zapbot_wwebjs_auth
	docker volume inspect zapbot_app_cache
	docker context use default

deploy.destroy: deploy.clean deploy.prune
	docker context create homelab --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use homelab
	docker volume rm -f zapbot_app_cache || true
	docker volume rm -f zapbot_wwebjs_auth || true
	docker context use default
