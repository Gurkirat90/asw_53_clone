"""Alembic helpers and the startup check that refuses to serve an unmigrated database."""

from __future__ import annotations

from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine
from sqlalchemy.engine import make_url

from app.core.config import BACKEND_DIR
from app.db.session import is_sqlite_file_url

ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
MIGRATE_HINT = "run `make migrate`"


class DatabaseNotReadyError(RuntimeError):
    """The configured database is missing, unreachable, or not at the latest migration."""


def alembic_config(database_url: str | None = None) -> Config:
    """Alembic config for programmatic use (tests, checks). Does not reconfigure logging."""
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    if database_url is not None:
        config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    config.attributes["configure_logger"] = False
    return config


def head_revision() -> str | None:
    return ScriptDirectory.from_config(alembic_config()).get_current_head()


def sqlite_file_path(database_url: str) -> Path | None:
    if not is_sqlite_file_url(database_url):
        return None
    database = make_url(database_url).database
    return Path(database) if database else None


def check_database_ready(engine: Engine) -> None:
    """Raise DatabaseNotReadyError unless the database exists and is migrated to head.

    Never creates tables, and never lets SQLite silently create an empty file.
    """
    path = sqlite_file_path(engine.url.render_as_string(hide_password=False))
    if path is not None:
        if not path.parent.is_dir():
            raise DatabaseNotReadyError(
                f"Database directory does not exist: {path.parent}. Create it and {MIGRATE_HINT}."
            )
        if not path.is_file():
            raise DatabaseNotReadyError(
                f"Database not migrated: {path} is missing; {MIGRATE_HINT}."
            )

    expected = head_revision()
    try:
        with engine.connect() as connection:
            current = MigrationContext.configure(connection).get_current_revision()
    except Exception as exc:  # surface any connection failure as "not ready"
        reason = exc.__class__.__name__
        raise DatabaseNotReadyError(f"Database is not reachable ({reason}).") from exc

    if current is None:
        raise DatabaseNotReadyError(f"Database not migrated: {MIGRATE_HINT}.")
    if current != expected:
        raise DatabaseNotReadyError(
            f"Database not migrated: at revision {current}, expected {expected}; {MIGRATE_HINT}."
        )
