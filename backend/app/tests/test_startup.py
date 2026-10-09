from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.db.migrations import DatabaseNotReadyError
from app.db.session import build_engine
from app.main import create_app


def _settings_for(path: Path, settings: Settings) -> Settings:
    return settings.model_copy(update={"DATABASE_URL": f"sqlite:///{path}"})


def test_startup_refuses_missing_database_file_without_creating_it(
    tmp_path: Path, settings: Settings
) -> None:
    db_path = tmp_path / "missing.db"
    app = create_app(_settings_for(db_path, settings))

    with pytest.raises(DatabaseNotReadyError, match="Database not migrated"):
        with TestClient(app):
            pass
    assert not db_path.exists()


def test_startup_refuses_missing_directory(tmp_path: Path, settings: Settings) -> None:
    app = create_app(_settings_for(tmp_path / "no-such-dir" / "app.db", settings))

    with pytest.raises(DatabaseNotReadyError, match="directory does not exist"):
        with TestClient(app):
            pass


def test_startup_refuses_unmigrated_database(tmp_path: Path, settings: Settings) -> None:
    db_path = tmp_path / "empty.db"
    engine = build_engine(f"sqlite:///{db_path}")
    with engine.connect():
        pass  # creates an empty SQLite file with no tables
    engine.dispose()

    with pytest.raises(DatabaseNotReadyError, match="run `make migrate`"):
        with TestClient(create_app(_settings_for(db_path, settings))):
            pass
