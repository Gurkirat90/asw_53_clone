import logging

import pytest
from fastapi import FastAPI, Query
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.tests.helpers import REQUEST_ID_PATTERN, assert_error


class _Value(BaseModel):
    value: str
    priority: int


class _Payload(BaseModel):
    values: list[_Value]


@pytest.fixture
def test_app(app: FastAPI) -> FastAPI:
    """The real app plus test-only routes."""

    @app.get("/__test/boom")
    def boom() -> None:
        raise RuntimeError("secret internal detail SELECT * FROM users")

    @app.post("/__test/nested")
    def nested(payload: _Payload, page: int = Query(1, ge=1)) -> dict:
        return {"ok": True}

    return app


@pytest.fixture
def test_client(test_app: FastAPI) -> TestClient:
    with TestClient(test_app) as client:
        yield client


def test_unknown_route_returns_not_found_envelope(client: TestClient) -> None:
    error = assert_error(client.get("/api/v1/does-not-exist"), 404, "NOT_FOUND")
    assert error["details"] == []


def test_wrong_method_returns_405_envelope(client: TestClient) -> None:
    response = client.get("/api/v1/auth/login")
    assert_error(response, 405, "BAD_REQUEST")
    assert "POST" in response.headers["allow"]


def test_unhandled_exception_returns_generic_500(
    test_client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.ERROR, logger="app.errors"):
        response = test_client.get("/__test/boom")

    error = assert_error(response, 500, "INTERNAL_ERROR")
    assert error["message"] == "An unexpected error occurred. Try again later."
    assert "secret internal detail" not in response.text
    assert "Traceback" not in response.text
    # The stack trace is logged server-side with the request ID.
    logged = [record for record in caplog.records if record.name == "app.errors"]
    assert logged and logged[0].exc_info is not None
    assert logged[0].request_id == error["request_id"]


def test_nested_validation_errors_use_dot_paths(test_client: TestClient) -> None:
    response = test_client.post(
        "/__test/nested?page=0",
        json={"values": [{"value": "192.0.2.10", "priority": 1}, {"value": "x", "priority": "a"}]},
    )
    error = assert_error(response, 422, "VALIDATION_ERROR")
    details = {detail["field"]: detail["message"] for detail in error["details"]}
    assert details == {
        "values.1.priority": "Enter a whole number.",
        "page": "Enter a value of at least 1.",
    }


def test_malformed_json_returns_validation_envelope(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/login",
        content=b"{not json",
        headers={"Content-Type": "application/json"},
    )
    error = assert_error(response, 422, "VALIDATION_ERROR")
    assert error["details"][0]["message"] == "The request body is not valid JSON."


def test_request_id_is_generated_on_success_and_error(client: TestClient) -> None:
    ok = client.get("/healthz")
    missing = client.get("/nope")
    assert REQUEST_ID_PATTERN.match(ok.headers["X-Request-ID"])
    assert REQUEST_ID_PATTERN.match(missing.headers["X-Request-ID"])
    assert ok.headers["X-Request-ID"] != missing.headers["X-Request-ID"]


def test_valid_incoming_request_id_is_echoed(client: TestClient) -> None:
    response = client.get("/api/v1/auth/me", headers={"X-Request-ID": "trace_ABC-123"})
    assert response.headers["X-Request-ID"] == "trace_ABC-123"
    assert response.json()["error"]["request_id"] == "trace_ABC-123"


@pytest.mark.parametrize("incoming", ["has spaces", "x" * 65, "semi;colon", ""])
def test_invalid_incoming_request_id_is_replaced(client: TestClient, incoming: str) -> None:
    response = client.get("/healthz", headers={"X-Request-ID": incoming})
    assert REQUEST_ID_PATTERN.match(response.headers["X-Request-ID"])


# --- Origin check -------------------------------------------------------------------------------


def test_untrusted_origin_is_forbidden_for_unsafe_methods(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "user@example.com", "password": "x"},
        headers={"Origin": "https://evil.example.com"},
    )
    assert_error(response, 403, "FORBIDDEN")


def test_trusted_origin_is_processed_normally(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "user@example.com", "password": "x"},
        headers={"Origin": "http://localhost:3000"},
    )
    assert_error(response, 401, "AUTHENTICATION_FAILED")


def test_safe_methods_ignore_origin(client: TestClient) -> None:
    response = client.get("/healthz", headers={"Origin": "https://evil.example.com"})
    assert response.status_code == 200


def test_logout_from_untrusted_origin_is_forbidden(client: TestClient) -> None:
    response = client.post("/api/v1/auth/logout", headers={"Origin": "https://evil.example.com"})
    assert_error(response, 403, "FORBIDDEN")
