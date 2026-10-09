"""Alembic environment. The database URL comes from application settings, not alembic.ini."""

from logging.config import fileConfig
from typing import Any

from alembic import context
from sqlalchemy.types import TypeDecorator

# Importing app.models registers every model on Base.metadata for autogenerate.
import app.models  # noqa: F401
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import build_engine

config = context.config

# Programmatic callers (tests, startup checks) set configure_logger=False to keep their logging.
if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def _database_url() -> str:
    # A URL set programmatically (e.g. by tests via Config.set_main_option) wins over settings.
    return config.get_main_option("sqlalchemy.url") or get_settings().DATABASE_URL


def _render_item(type_: str, obj: Any, autogen_context: Any) -> str | bool:
    # App TypeDecorators (UTCDateTime, JSONText) are TEXT on disk; keep migrations app-free.
    if type_ == "type" and isinstance(obj, TypeDecorator):
        return "sa.Text()"
    return False


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
        render_item=_render_item,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # build_engine applies PRAGMA foreign_keys=ON (and WAL for files) on every connection.
    connectable = build_engine(_database_url())

    try:
        with connectable.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                render_as_batch=True,
                render_item=_render_item,
            )

            with context.begin_transaction():
                context.run_migrations()
    finally:
        connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
