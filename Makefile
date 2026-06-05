.PHONY: dev test build up down clean install

install:
	npm ci

build:
	npm run build --workspaces --if-present

test:
	npm test --workspaces --if-present

dev:
	node packages/cli/bin/penelope.mjs up

up:
	docker compose up -d

down:
	docker compose down

clean:
	find . -name node_modules -type d -prune -exec rm -rf {} +
	find . -name dist -type d -prune -exec rm -rf {} +
