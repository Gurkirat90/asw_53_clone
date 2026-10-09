"""Test configuration.

The environment is pointed at an isolated temporary SQLite file at import time, BEFORE any app
module reads settings (app.main builds a module-level app on import). APP_ENV=test also makes
Settings ignore backend/.env, so a developer's local values never leak into tests.
"""

from __future__ import annotations

import os
import shutil
import tempfile
from collections.abc import Iterator
from pathlib import Path

_TEST_DIR = Path(tempfile.mkdtemp(prefix="fiftythree-tests-"))
for _name in (
    "DATABASE_URL",
    "DEMO_USER_EMAIL",
    "DEMO_USER_DISPLAY_NAME",
    "DEMO_USER_PASSWORD",
    "TRUSTED_ORIGINS",
    "CORS_ALLOWED_ORIGINS",
    "SESSION_COOKIE_NAME",
    "SESSION_TTL_SECONDS",
    "SESSION_COOKIE_SECURE",
    "ENABLE_DOCS",
):
    os.environ.pop(_name, None)
os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DIR / 'test.db'}"

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import Engine  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.config import BACKEND_DIR, Settings, get_settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.migrations import alembic_config, sqlite_file_path  # noqa: E402
from app.db.session import build_engine, build_session_factory  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import User  # noqa: E402
from app.tests.helpers import DEFAULT_PASSWORD, UserFactory, login_client  # noqa: E402

DEVELOPER_DATA_DIR = (BACKEND_DIR / "data").resolve()
DEVELOPER_DB = DEVELOPER_DATA_DIR / "fiftythree.db"


def assert_not_developer_db(database_url: str) -> None:
    """Refuse any database in backend/data/ (the default fiftythree.db or a renamed local copy)."""
    path = sqlite_file_path(database_url)
    if path is None or path.resolve().is_relative_to(DEVELOPER_DATA_DIR):
        pytest.exit(
            f"Refusing to run tests against {database_url}: tests must use a temporary database.",
            returncode=2,
        )


@pytest.fixture(scope="session", autouse=True)
def test_database_url() -> Iterator[str]:
    """Migrate the session's temporary database once, and delete it at the end."""
    get_settings.cache_clear()
    url = get_settings().DATABASE_URL
    assert_not_developer_db(url)
    command.upgrade(alembic_config(url), "head")
    yield url
    shutil.rmtree(_TEST_DIR, ignore_errors=True)


@pytest.fixture(autouse=True)
def _reset_settings_cache() -> Iterator[None]:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def _clean_database(test_database_url: str) -> Iterator[None]:
    """Every test starts and ends with empty tables."""

    def wipe() -> None:
        engine = build_engine(test_database_url)
        try:
            with engine.begin() as connection:
                for table in reversed(Base.metadata.sorted_tables):
                    connection.execute(table.delete())
        finally:
            engine.dispose()

    wipe()
    yield
    wipe()


@pytest.fixture
def settings() -> Settings:
    current = get_settings()
    assert_not_developer_db(current.DATABASE_URL)
    return current


@pytest.fixture
def engine(test_database_url: str) -> Iterator[Engine]:
    test_engine = build_engine(test_database_url)
    yield test_engine
    test_engine.dispose()


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    with build_session_factory(engine)() as session:
        yield session


@pytest.fixture
def app(settings: Settings) -> FastAPI:
    return create_app(settings)


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    # The context manager runs the lifespan, including the database readiness check.
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def create_user(db: Session) -> UserFactory:
    def _create_user(
        email: str = "user@example.com",
        password: str = DEFAULT_PASSWORD,
        active: bool = True,
        display_name: str = "Test User",
    ) -> User:
        user = User(
            email=email.strip().lower(),
            display_name=display_name,
            password_hash=hash_password(password),
            is_active=active,
        )
        db.add(user)
        db.commit()
        return user

    return _create_user


@pytest.fixture
def auth_client(client: TestClient, create_user: UserFactory) -> TestClient:
    """The default client, signed in as user@example.com."""
    create_user("user@example.com")
    login_client(client, "user@example.com")
    return client


@pytest.fixture
def other_client(app: FastAPI, create_user: UserFactory) -> Iterator[TestClient]:
    """A second, independent client signed in as a different user."""
    create_user("other@example.com")
    with TestClient(app) as second:
        login_client(second, "other@example.com")
        yield second
