
build:
	docker build -f docker/app/Dockerfile -t zapbot .

clean:
	docker rmi -f zapbot

shell:
	docker run --rm -it --env-file config/.env --hostname DOCKER:zapbot \
		-v $$PWD:/workspace -w /workspace  zapbot

prune:
	rm -rf cache/media/
	sqlite3 cache/bot_database.db "DELETE FROM messages"

compose:
	cd docker && docker compose up -d --build

deploy.up:
	docker context create qnap --docker "host=ssh://admin@capacete" || true
	docker context use qnap
	docker compose -f docker/docker-compose.yml up -d --build

deploy.logs:
	docker context create qnap --docker "host=ssh://admin@capacete" || true
	docker context use qnap
	docker logs -f zapbot

deploy.ps:
	docker context create qnap --docker "host=ssh://admin@capacete" || true
	docker context use qnap
	docker ps

deploy.rm:
	docker context create qnap --docker "host=ssh://admin@capacete" || true
	docker context use qnap
	docker rmi -f docker-zapbot

deploy.shell:
	docker context create qnap --docker "host=ssh://admin@capacete" || true
	docker context use qnap
	docker exec -it zapbot /bin/bash
