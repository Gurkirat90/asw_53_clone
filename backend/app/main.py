"""FastAPI application factory."""

from __future__ import annotations

import logging

from fastapi import APIRouter, FastAPI

from app.core.config import Settings, get_settings
from app.core.logging import configure_logging

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.LOG_LEVEL)

    app = FastAPI(
        title="Route 53 Clone API",
        version="0.1.0",
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
    )

    # Feature routers (auth, hosted zones, records) are included here from PROMPT 02 onward.
    api_v1 = APIRouter(prefix="/api/v1")
    app.include_router(api_v1)

    @app.get("/healthz", tags=["health"])
    def healthz() -> dict[str, str]:
        # PROMPT 02 adds a database connectivity check.
        return {"status": "ok"}

    logger.info("Application created (env=%s)", settings.APP_ENV)
    return app


app = create_app()
