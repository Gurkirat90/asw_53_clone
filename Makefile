# Root developer commands (DECISIONS D13). Targets call backend/.venv/bin/python directly,
# so no virtualenv activation is needed.

SHELL := /bin/bash

PYTHON ?= python3.12
BACKEND_DIR := $(CURDIR)/backend
FRONTEND_DIR := $(CURDIR)/frontend
BACKEND_PY := $(BACKEND_DIR)/.venv/bin/python

.DEFAULT_GOAL := help

.PHONY: help setup backend-setup frontend-setup migrate seed seed-demo-data \
	backend-run frontend-run backend-test backend-lint frontend-lint frontend-typecheck \
	frontend-test frontend-build e2e test check

help: ## List available targets
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

setup: backend-setup frontend-setup ## Create the backend venv, install all dependencies

backend-setup:
	@test -x "$(BACKEND_PY)" || $(PYTHON) -m venv "$(BACKEND_DIR)/.venv"
	"$(BACKEND_PY)" -m pip install --upgrade pip
	"$(BACKEND_PY)" -m pip install -r "$(BACKEND_DIR)/requirements-dev.txt"

frontend-setup:
	cd "$(FRONTEND_DIR)" && if [ -f package-lock.json ]; then npm ci; else npm install; fi

migrate: ## Apply Alembic migrations to DATABASE_URL
	mkdir -p "$(BACKEND_DIR)/data"
	cd "$(BACKEND_DIR)" && "$(BACKEND_PY)" -m alembic upgrade head

seed: ## Create the demo user if missing (SEED_ARGS=--reset-password to reset its password)
	cd "$(BACKEND_DIR)" && "$(BACKEND_PY)" -m app.cli seed-demo-user $(SEED_ARGS)

seed-demo-data: ## Load demo hosted zones and records for the demo user (skips if it has zones)
	cd "$(BACKEND_DIR)" && "$(BACKEND_PY)" -m app.cli seed-demo-data

backend-run: ## Run FastAPI on 127.0.0.1:8000 (single worker, auto-reload)
	cd "$(BACKEND_DIR)" && "$(BACKEND_PY)" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

frontend-run: ## Run Next.js dev server on port 3000
	cd "$(FRONTEND_DIR)" && npm run dev

backend-test: ## Run pytest
	cd "$(BACKEND_DIR)" && "$(BACKEND_PY)" -m pytest

backend-lint: ## Run ruff lint and format check
	cd "$(BACKEND_DIR)" && "$(BACKEND_PY)" -m ruff check . && "$(BACKEND_PY)" -m ruff format --check .

frontend-lint: ## Run ESLint
	cd "$(FRONTEND_DIR)" && npm run lint

frontend-typecheck: ## Run tsc --noEmit
	cd "$(FRONTEND_DIR)" && npm run typecheck

frontend-test: ## Run Vitest
	cd "$(FRONTEND_DIR)" && npm run test

frontend-build: ## Production build of the frontend
	cd "$(FRONTEND_DIR)" && npm run build

e2e: ## Playwright end-to-end tests (PROMPT 04)
	@echo "make e2e: not implemented until PROMPT 04" >&2; exit 1

test: backend-test frontend-test ## Backend and frontend unit tests

check: backend-lint frontend-lint frontend-typecheck backend-test frontend-test frontend-build ## All lint, typecheck, unit tests, and the frontend build
