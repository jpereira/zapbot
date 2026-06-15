
DOCKER_REMOTE_SERVER := ssh://admin@capacete

build:
	docker context use default
	docker build -f docker/app/Dockerfile -t zapbot .

clean:
	docker rmi -f zapbot

shell:
	docker context use default
	docker run --rm -it \
		--env-file config/.env \
		--hostname DOCKER:zapbot \
		--volume   "$(PWD):/workspace" \
		-w /workspace \
		--entrypoint /bin/bash \
		zapbot

prune:
	rm -rf cache/media/
	sqlite3 cache/bot_database.db "DELETE FROM messages"

compose:
	cd docker && docker compose up -d --build

deploy.up:
	docker context create qnap --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use qnap
	docker compose -f docker/docker-compose.yml up -d --build
	docker context use default

deploy.logs:
	docker context create qnap --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use qnap
	docker logs -f zapbot
	docker context use default

deploy.ps:
	docker context create qnap --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use qnap
	docker ps
	docker context use default

deploy.clean:
	docker context create qnap --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use qnap
	docker rm -f zapbot
	docker rmi -f docker-zapbot
	docker context use default

deploy.images:
	docker context create qnap --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use qnap
	docker images -a

deploy.shell:
	docker context create qnap --docker "host=$(DOCKER_REMOTE_SERVER)" || true
	docker context use qnap
	docker exec -it zapbot /bin/bash
	docker context use default
