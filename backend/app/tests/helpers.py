"""Plain test helpers (fixtures live in conftest.py)."""

from __future__ import annotations

import re
from collections.abc import Callable

import httpx
from fastapi.testclient import TestClient

from app.models import User

DEFAULT_PASSWORD = "correct-horse-battery-staple"
REQUEST_ID_PATTERN = re.compile(r"^req_[0-9a-f]{16}$")

# Signature of the create_user fixture: create_user(email=..., password=..., active=True).
UserFactory = Callable[..., User]


def login_client(
    client: TestClient, email: str, password: str = DEFAULT_PASSWORD
) -> httpx.Response:
    """Log the TestClient in (its cookie jar keeps the session cookie) and return the response."""
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response


def assert_error(response: httpx.Response, status_code: int, code: str) -> dict:
    """Assert the D9 error envelope and return its "error" object."""
    assert response.status_code == status_code, response.text
    body = response.json()
    assert set(body) == {"error"}
    error = body["error"]
    assert set(error) == {"code", "message", "details", "request_id"}
    assert error["code"] == code
    assert isinstance(error["message"], str) and error["message"]
    assert isinstance(error["details"], list)
    assert error["request_id"] == response.headers["X-Request-ID"]
    return error
