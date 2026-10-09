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


def create_zone(
    client: TestClient, name: str = "example.com", zone_type: str = "PUBLIC", comment=None
) -> dict:
    payload = {"name": name, "zone_type": zone_type}
    if comment is not None:
        payload["comment"] = comment
    response = client.post("/api/v1/hosted-zones", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def records_url(zone_id: str, record_id: str | None = None) -> str:
    base = f"/api/v1/hosted-zones/{zone_id}/records"
    return f"{base}/{record_id}" if record_id else base


def create_record(client: TestClient, zone_id: str, **payload) -> dict:
    response = client.post(records_url(zone_id), json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def details_by_field(error: dict) -> dict[str, str]:
    return {detail["field"]: detail["message"] for detail in error["details"]}


# One valid create payload and one valid replacement per user record type (zone example.com):
# (create payload, expected canonical name, expected display_values, update values,
#  expected display_values after update).
RECORD_TYPE_CASES = {
    "A": (
        {"name": "www", "values": [{"value": "192.0.2.10"}, {"value": "192.0.2.11"}]},
        "www.example.com",
        ["192.0.2.10", "192.0.2.11"],
        [{"value": "192.0.2.12"}, {"value": "192.0.2.10"}],
        ["192.0.2.12", "192.0.2.10"],
    ),
    "AAAA": (
        {"name": "@", "values": [{"value": "2001:DB8:0:0:0:0:0:10"}]},
        "example.com",
        ["2001:db8::10"],
        [{"value": "2001:db8::20"}, {"value": "2001:db8::10"}],
        ["2001:db8::20", "2001:db8::10"],
    ),
    "CNAME": (
        {"name": "app", "values": [{"value": "WWW.Example.NET."}]},
        "app.example.com",
        ["www.example.net"],
        [{"value": "app.example.net"}],
        ["app.example.net"],
    ),
    "TXT": (
        {"name": "@", "values": [{"value": "v=spf1 include:example.net -all"}]},
        "example.com",
        ['"v=spf1 include:example.net -all"'],
        [{"value": 'say "hi"'}, {"value": "back\\slash"}],
        ['"say \\"hi\\""', '"back\\\\slash"'],
    ),
    "MX": (
        {"name": "@", "values": [{"priority": 10, "exchange": "mail.example.com"}]},
        "example.com",
        ["10 mail.example.com"],
        [
            {"priority": 20, "exchange": "mail2.example.com"},
            {"priority": 5, "exchange": "mail.example.com"},
        ],
        ["20 mail2.example.com", "5 mail.example.com"],
    ),
    "NS": (
        {"name": "dev", "values": [{"value": "ns1.example.net"}, {"value": "ns2.example.net"}]},
        "dev.example.com",
        ["ns1.example.net", "ns2.example.net"],
        [{"value": "ns3.example.net"}],
        ["ns3.example.net"],
    ),
    "PTR": (
        {"name": "10", "values": [{"value": "host.example.net"}]},
        "10.example.com",
        ["host.example.net"],
        [{"value": "other.example.net"}],
        ["other.example.net"],
    ),
    "SRV": (
        {
            "name": "_sip._tcp",
            "values": [{"priority": 10, "weight": 5, "port": 443, "target": "service.example.net"}],
        },
        "_sip._tcp.example.com",
        ["10 5 443 service.example.net"],
        [
            {"priority": 0, "weight": 0, "port": 0, "target": "."},
            {"priority": 1, "weight": 2, "port": 5060, "target": "sip.example.net"},
        ],
        ["0 0 0 .", "1 2 5060 sip.example.net"],
    ),
    "CAA": (
        {"name": "@", "values": [{"flags": 0, "tag": "issue", "value": "letsencrypt.org"}]},
        "example.com",
        ['0 issue "letsencrypt.org"'],
        [
            {"flags": 0, "tag": "iodef", "value": "mailto:security@example.com"},
            {"flags": 128, "tag": "issuewild", "value": "example.net"},
        ],
        ['0 iodef "mailto:security@example.com"', '128 issuewild "example.net"'],
    ),
}
