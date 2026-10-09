from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db.session import build_engine


def test_healthz_reports_database_ok(client: TestClient) -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}
    assert response.headers["X-Request-ID"]


def test_healthz_returns_503_without_internals_when_database_fails(
    app: FastAPI, client: TestClient, tmp_path
) -> None:
    original = app.state.engine
    broken_path = tmp_path / "missing-dir" / "nope.db"
    app.state.engine = build_engine(f"sqlite:///{broken_path}")
    try:
        response = client.get("/healthz")
    finally:
        app.state.engine.dispose()
        app.state.engine = original

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}
    assert "missing-dir" not in response.text


def test_openapi_docs_available_outside_production(client: TestClient) -> None:
    assert client.get("/docs").status_code == 200
