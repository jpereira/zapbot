
DOCKER_REMOTE_SERVER := ssh://admin@capacete

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
# 	docker run --rm -it \
# 		--env-file config/.env.dev \
# 		--hostname DOCKER:zapbot-dev \
# 		--volume "$(PWD):/workspace" \
# 		--volume wwebjs_auth:/workspace/.wwebjs_auth \
# 		-w /workspace \
# 		--entrypoint /bin/bash \
# 		zapbot-dev

prune:
	rm -rf cache/media/
	sqlite3 cache/bot_database.db "DELETE FROM messages"

# Production
#
# tudo rodando em um Docker server
# local em minha rede.
#
deploy.up: 
	docker context create qnap --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use qnap
	docker image prune -f
	docker compose -f docker/docker-compose.yml build $(OPTS) zapbot-prod
	docker compose -f docker/docker-compose.yml up -d --force-recreate zapbot-prod
	docker context use default

deploy.logs:
	docker context create qnap --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use qnap
	docker logs -f zapbot-prod
	docker context use default

deploy.ps:
	docker context create qnap --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use qnap
	docker ps
	docker context use default

deploy.clean:
	docker context create qnap --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use qnap
	docker rm -f zapbot-prod
	docker rmi -f zapbot-prod
	docker context use default

deploy.prune:
	docker context create qnap --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use qnap
	docker exec -it zapbot-prod rm -rf cache/tmp cache/media
	docker exec -it zapbot-prod sqlite3 cache/bot_database.db "DELETE FROM messages"
	docker context use default

deploy.images:
	docker context create qnap --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use qnap
	docker images -a
	docker context use default

deploy.shell:
	docker context create qnap --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use qnap
	docker exec -it zapbot-prod /bin/bash -l
	docker context use default

deploy.volume:
	docker context create qnap --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use qnap
	docker volume create app_cache || true
	docker volume create wwebjs_auth || true
	docker volume inspect wwebjs_auth
	docker volume inspect app_cache
	docker context use default
