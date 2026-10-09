"""FastAPI application factory."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.v1 import api_router
from app.core.config import Settings, get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import REQUEST_ID_HEADER, OriginCheckMiddleware, RequestIdMiddleware
from app.db.migrations import DatabaseNotReadyError, check_database_ready
from app.db.session import build_engine, build_session_factory

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    engine = app.state.engine
    try:
        check_database_ready(engine)
    except DatabaseNotReadyError as exc:
        logger.error("Startup aborted: %s", exc)
        raise
    logger.info("Database ready")
    try:
        yield
    finally:
        engine.dispose()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.LOG_LEVEL)

    app = FastAPI(
        title="Fiftythree API",
        version="0.1.0",
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
        lifespan=lifespan,
    )
    # Engines connect lazily; the lifespan startup check is the first real connection.
    engine = build_engine(settings.DATABASE_URL)
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = build_session_factory(engine)

    register_exception_handlers(app)

    # Middleware added last runs first: RequestId wraps everything (including CORS and the
    # Origin check) so every response, even a 403 or 500, carries X-Request-ID.
    app.add_middleware(OriginCheckMiddleware, trusted_origins=settings.TRUSTED_ORIGINS)
    if settings.CORS_ALLOWED_ORIGINS:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.CORS_ALLOWED_ORIGINS,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PATCH", "DELETE"],
            allow_headers=["Content-Type", REQUEST_ID_HEADER],
            expose_headers=[REQUEST_ID_HEADER],
        )
    app.add_middleware(RequestIdMiddleware)

    app.include_router(api_router)

    @app.get("/healthz", tags=["health"])
    def healthz(request: Request) -> JSONResponse:
        try:
            with request.app.state.engine.connect() as connection:
                connection.execute(text("SELECT 1"))
        except Exception:
            # Details stay in the server log; the response never exposes paths or internals.
            logger.exception("Health check database query failed")
            return JSONResponse(status_code=503, content={"status": "unavailable"})
        return JSONResponse(content={"status": "ok", "database": "ok"})

    logger.info("Application created (env=%s)", settings.APP_ENV)
    return app


app = create_app()
