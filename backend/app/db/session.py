"""Engine and session construction. Every SQLite connection enforces foreign keys."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from fastapi import Request
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker


def is_sqlite_file_url(url: str) -> bool:
    parsed = make_url(url)
    return parsed.get_backend_name() == "sqlite" and parsed.database not in (None, "", ":memory:")


def build_engine(url: str) -> Engine:
    parsed = make_url(url)
    connect_args: dict[str, Any] = {}
    is_sqlite = parsed.get_backend_name() == "sqlite"
    if is_sqlite:
        connect_args["check_same_thread"] = False
    engine = create_engine(url, connect_args=connect_args)

    if is_sqlite:
        use_wal = is_sqlite_file_url(url)

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_connection: Any, _connection_record: Any) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            if use_wal:
                cursor.execute("PRAGMA journal_mode=WAL")
            cursor.close()

    return engine


def build_session_factory(engine: Engine) -> sessionmaker[Session]:
    # Services commit or roll back explicitly; objects stay usable after commit.
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db(request: Request) -> Iterator[Session]:
    """FastAPI dependency: one Session per request, closed (and rolled back if open) afterwards."""
    session: Session = request.app.state.session_factory()
    try:
        yield session
    finally:
        session.close()
