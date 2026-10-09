"""Application settings loaded from environment variables and backend/.env.

When APP_ENV=test is set in the process environment, backend/.env is ignored so a developer's
local settings (database path, demo password) never leak into the test suite.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]

SQLITE_PREFIX = "sqlite:///"


def _split_csv(value: object) -> object:
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return value


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_ENV: Literal["development", "test", "production"] = "development"
    DATABASE_URL: str = "sqlite:///./data/fiftythree.db"

    SESSION_COOKIE_NAME: str = "route53_session"
    SESSION_TTL_SECONDS: int = Field(default=43200, gt=0)
    SESSION_COOKIE_SECURE: bool = False

    DEMO_USER_EMAIL: str = "demo@example.test"
    DEMO_USER_DISPLAY_NAME: str = "Demo User"
    # Optional at load time; the seed command requires it. Never commit a real value.
    DEMO_USER_PASSWORD: str | None = None

    TRUSTED_ORIGINS: Annotated[list[str], NoDecode] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    CORS_ALLOWED_ORIGINS: Annotated[list[str], NoDecode] = []

    LOG_LEVEL: str = "INFO"
    # Defaults to True outside production (resolved in _apply_derived_defaults).
    ENABLE_DOCS: bool | None = None

    @field_validator("TRUSTED_ORIGINS", "CORS_ALLOWED_ORIGINS", mode="before")
    @classmethod
    def _parse_origin_list(cls, value: object) -> object:
        return _split_csv(value)

    @field_validator("CORS_ALLOWED_ORIGINS")
    @classmethod
    def _reject_wildcard_cors(cls, value: list[str]) -> list[str]:
        if "*" in value:
            raise ValueError("Wildcard CORS origins are not allowed with credentialed cookies.")
        return value

    @field_validator("LOG_LEVEL")
    @classmethod
    def _normalize_log_level(cls, value: str) -> str:
        return value.upper()

    @model_validator(mode="after")
    def _apply_derived_defaults(self) -> Settings:
        if self.ENABLE_DOCS is None:
            self.ENABLE_DOCS = self.APP_ENV != "production"
        self.DATABASE_URL = resolve_sqlite_url(self.DATABASE_URL)
        return self

    @property
    def docs_enabled(self) -> bool:
        return bool(self.ENABLE_DOCS)


def resolve_sqlite_url(url: str) -> str:
    """Make relative SQLite paths relative to backend/ instead of the process working directory."""
    if not url.startswith(SQLITE_PREFIX):
        return url
    raw_path = url[len(SQLITE_PREFIX) :]
    if raw_path in ("", ":memory:") or raw_path.startswith("file:"):
        return url
    path = Path(raw_path)
    if not path.is_absolute():
        path = (BACKEND_DIR / path).resolve()
    return f"{SQLITE_PREFIX}{path}"


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor. Tests call get_settings.cache_clear() or pass Settings."""
    if os.environ.get("APP_ENV") == "test":
        return Settings(_env_file=None)
    return Settings()
