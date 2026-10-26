# Usage: make container-up | container-down | container-destroy [YES=1] | container-replace SERVICE=<name>
#
# Starts and removes the containers (db, backend, frontend) defined in docker-compose.yml.
# container-destroy asks for confirmation first (default: no). It also deletes the db data.
# container-replace rebuilds and recreates one container; the db data is kept.

# help に出す、変数と例の説明(`make help` が読む)
#@vars container-*
#@var YES Set to 1 to skip the confirmation prompt (container-destroy; command line only)
#@var SERVICE Name of the service to replace (container-replace; required; command line only)
#@example make container-up
#@example make container-destroy YES=1
#@example make container-replace SERVICE=frontend

# Ignore YES from the environment; accept it only on the command line.
# A stray YES in the environment must not skip the prompt that guards the db data.
ifneq ($(origin YES),command line)
YES :=
endif

# Same for SERVICE: a stray SERVICE in the environment must not pick the container to replace.
ifneq ($(origin SERVICE),command line)
SERVICE :=
endif

.PHONY: container-up container-down container-destroy container-replace

container-up: ## Start the containers (db, backend, frontend)
	@docker compose up -d --build
	@echo "Containers are up."
	@echo "  frontend: http://localhost:5173"
	@echo "  backend:  http://localhost:8000"
	@echo "  db:       localhost:3307"

container-down: ## Stop and remove the containers (the db data is kept)
	@docker compose down

container-destroy: ## Stop and remove the containers and DELETE the db data
	@if [ -z "$(YES)" ]; then \
	  read -r -p "Delete the containers and ALL the db data? [y/N] " ans; \
	  case "$$ans" in [Yy]|[Yy][Ee][Ss]) ;; *) echo "Aborted."; exit 1;; esac; \
	fi
	@docker compose down -v

container-replace: ## Rebuild and recreate one container (SERVICE=<name>; the db data is kept)
	@if [ -z "$(SERVICE)" ]; then \
	  echo "SERVICE is required. Example: make container-replace SERVICE=frontend"; \
	  exit 1; \
	fi
	@docker compose up -d --build --force-recreate $(SERVICE)
	@echo "Replaced: $(SERVICE)"
