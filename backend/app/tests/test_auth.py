from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import hash_session_token
from app.db.types import utcnow
from app.models import AuthSession, User
from app.tests.helpers import DEFAULT_PASSWORD, UserFactory, assert_error, login_client

EMAIL = "user@example.com"


def _session_cookie_header(response, settings: Settings) -> str:
    headers = [
        header
        for header in response.headers.get_list("set-cookie")
        if header.startswith(f"{settings.SESSION_COOKIE_NAME}=")
    ]
    assert len(headers) == 1, response.headers
    return headers[0]


def _only_session(db: Session) -> AuthSession:
    db.expire_all()
    sessions = db.scalars(select(AuthSession)).all()
    assert len(sessions) == 1
    return sessions[0]


# --- Login ---------------------------------------------------------------------------------------


def test_login_success_sets_secure_session_cookie(
    client: TestClient, db: Session, settings: Settings, create_user: UserFactory
) -> None:
    user = create_user(EMAIL)

    response = client.post(
        "/api/v1/auth/login", json={"email": EMAIL, "password": DEFAULT_PASSWORD}
    )

    assert response.status_code == 200
    assert response.json() == {"id": user.id, "email": EMAIL, "display_name": "Test User"}
    assert "password" not in response.text and "hash" not in response.text

    cookie_header = _session_cookie_header(response, settings)
    attributes = [part.strip().lower() for part in cookie_header.split(";")]
    assert "httponly" in attributes
    assert "samesite=lax" in attributes
    assert "path=/" in attributes
    assert f"max-age={settings.SESSION_TTL_SECONDS}" in attributes
    assert "secure" not in attributes  # SESSION_COOKIE_SECURE defaults to false locally

    token = response.cookies[settings.SESSION_COOKIE_NAME]
    session = _only_session(db)
    assert session.token_hash == hash_session_token(token)
    assert session.token_hash != token
    assert session.user_id == user.id
    assert session.revoked_at is None
    expected_expiry = session.created_at + timedelta(seconds=settings.SESSION_TTL_SECONDS)
    assert abs(session.expires_at - expected_expiry) < timedelta(seconds=1)


def test_login_normalizes_email(client: TestClient, create_user: UserFactory) -> None:
    create_user(EMAIL)
    response = client.post(
        "/api/v1/auth/login", json={"email": "  User@Example.COM ", "password": DEFAULT_PASSWORD}
    )
    assert response.status_code == 200


def test_secure_cookie_flag_when_configured(settings: Settings, create_user: UserFactory) -> None:
    from app.main import create_app

    create_user(EMAIL)
    secure_settings = settings.model_copy(update={"SESSION_COOKIE_SECURE": True})
    with TestClient(create_app(secure_settings), base_url="https://testserver") as client:
        response = login_client(client, EMAIL)
    attributes = [
        part.strip().lower() for part in _session_cookie_header(response, settings).split(";")
    ]
    assert "secure" in attributes


def test_wrong_password_and_unknown_email_fail_identically(
    client: TestClient, create_user: UserFactory
) -> None:
    create_user(EMAIL)

    wrong_password = client.post("/api/v1/auth/login", json={"email": EMAIL, "password": "nope"})
    unknown_email = client.post(
        "/api/v1/auth/login", json={"email": "nobody@example.com", "password": DEFAULT_PASSWORD}
    )

    first = assert_error(wrong_password, 401, "AUTHENTICATION_FAILED")
    second = assert_error(unknown_email, 401, "AUTHENTICATION_FAILED")
    assert first["message"] == second["message"] == "Sign-in failed. Check your credentials."
    assert first["details"] == second["details"] == []
    assert "set-cookie" not in wrong_password.headers


def test_inactive_user_cannot_log_in(client: TestClient, create_user: UserFactory) -> None:
    create_user(EMAIL, active=False)
    response = client.post(
        "/api/v1/auth/login", json={"email": EMAIL, "password": DEFAULT_PASSWORD}
    )
    assert_error(response, 401, "AUTHENTICATION_FAILED")


def test_empty_credentials_return_field_details(client: TestClient) -> None:
    response = client.post("/api/v1/auth/login", json={"email": "   ", "password": ""})

    error = assert_error(response, 422, "VALIDATION_ERROR")
    assert error["message"] == "The request contains invalid fields."
    assert {detail["field"] for detail in error["details"]} == {"email", "password"}
    assert all(detail["message"] == "This field is required." for detail in error["details"])


def test_whitespace_password_is_rejected(client: TestClient) -> None:
    response = client.post("/api/v1/auth/login", json={"email": EMAIL, "password": "   "})
    error = assert_error(response, 422, "VALIDATION_ERROR")
    assert error["details"] == [{"field": "password", "message": "This field is required."}]


def test_missing_fields_return_field_details(client: TestClient) -> None:
    response = client.post("/api/v1/auth/login", json={})
    error = assert_error(response, 422, "VALIDATION_ERROR")
    assert {detail["field"] for detail in error["details"]} == {"email", "password"}


def test_overlong_credentials_are_rejected(client: TestClient) -> None:
    response = client.post("/api/v1/auth/login", json={"email": "a" * 255, "password": "p" * 1025})
    error = assert_error(response, 422, "VALIDATION_ERROR")
    messages = {detail["field"]: detail["message"] for detail in error["details"]}
    assert messages == {
        "email": "Enter no more than 254 characters.",
        "password": "Enter no more than 1024 characters.",
    }


def test_passwords_are_stored_as_argon2id(db: Session, create_user: UserFactory) -> None:
    user = create_user(EMAIL)
    stored = db.scalar(select(User.password_hash).where(User.id == user.id))
    assert stored is not None and stored.startswith("$argon2id$")
    assert DEFAULT_PASSWORD not in stored


# --- Session restore (/auth/me) ------------------------------------------------------------------


def test_me_returns_user_with_valid_session(client: TestClient, create_user: UserFactory) -> None:
    user = create_user(EMAIL)
    login_client(client, EMAIL)

    response = client.get("/api/v1/auth/me")

    assert response.status_code == 200
    assert response.json() == {"id": user.id, "email": EMAIL, "display_name": "Test User"}


def test_me_without_cookie_is_unauthenticated(client: TestClient) -> None:
    error = assert_error(client.get("/api/v1/auth/me"), 401, "UNAUTHENTICATED")
    assert error["message"] == "Your session has expired or is not valid. Sign in again."


def test_me_with_garbage_cookie_is_unauthenticated(client: TestClient, settings: Settings) -> None:
    client.cookies.set(settings.SESSION_COOKIE_NAME, "not-a-real-token")
    assert_error(client.get("/api/v1/auth/me"), 401, "UNAUTHENTICATED")


def test_me_with_expired_session_is_unauthenticated(
    client: TestClient, db: Session, create_user: UserFactory
) -> None:
    create_user(EMAIL)
    login_client(client, EMAIL)
    session = _only_session(db)
    session.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()

    assert_error(client.get("/api/v1/auth/me"), 401, "UNAUTHENTICATED")


def test_me_with_revoked_session_is_unauthenticated(
    client: TestClient, db: Session, create_user: UserFactory
) -> None:
    create_user(EMAIL)
    login_client(client, EMAIL)
    session = _only_session(db)
    session.revoked_at = utcnow()
    db.commit()

    assert_error(client.get("/api/v1/auth/me"), 401, "UNAUTHENTICATED")


def test_me_for_deactivated_user_is_unauthenticated(
    client: TestClient, db: Session, create_user: UserFactory
) -> None:
    user = create_user(EMAIL)
    login_client(client, EMAIL)
    db.get(User, user.id).is_active = False
    db.commit()

    assert_error(client.get("/api/v1/auth/me"), 401, "UNAUTHENTICATED")


def test_session_survives_a_new_app_instance(
    app, settings: Settings, create_user: UserFactory
) -> None:
    from app.main import create_app

    create_user(EMAIL)
    with TestClient(app) as first:
        token = login_client(first, EMAIL).cookies[settings.SESSION_COOKIE_NAME]

    # A fresh app (as after a backend restart) accepts the persisted session.
    with TestClient(create_app(settings)) as second:
        second.cookies.set(settings.SESSION_COOKIE_NAME, token)
        assert second.get("/api/v1/auth/me").status_code == 200


def test_last_seen_is_refreshed_only_when_stale(
    client: TestClient, db: Session, create_user: UserFactory
) -> None:
    create_user(EMAIL)
    login_client(client, EMAIL)
    session = _only_session(db)
    recent = session.last_seen_at

    assert client.get("/api/v1/auth/me").status_code == 200
    assert _only_session(db).last_seen_at == recent

    stale = utcnow() - timedelta(minutes=10)
    session = _only_session(db)
    session.last_seen_at = stale
    db.commit()
    assert client.get("/api/v1/auth/me").status_code == 200
    assert _only_session(db).last_seen_at > stale + timedelta(minutes=9)


def test_login_cleans_up_long_expired_sessions(
    client: TestClient, db: Session, create_user: UserFactory
) -> None:
    user = create_user(EMAIL)
    old = utcnow() - timedelta(days=3)
    db.add(
        AuthSession(
            user_id=user.id,
            token_hash="0" * 64,
            created_at=old,
            last_seen_at=old,
            expires_at=old + timedelta(hours=12),
        )
    )
    db.commit()

    login_client(client, EMAIL)

    db.expire_all()
    hashes = db.scalars(select(AuthSession.token_hash)).all()
    assert "0" * 64 not in hashes
    assert len(hashes) == 1


# --- Logout --------------------------------------------------------------------------------------


def test_logout_revokes_session_and_clears_cookie(
    client: TestClient, db: Session, settings: Settings, create_user: UserFactory
) -> None:
    create_user(EMAIL)
    token = login_client(client, EMAIL).cookies[settings.SESSION_COOKIE_NAME]

    response = client.post("/api/v1/auth/logout")

    assert response.status_code == 204
    assert response.content == b""
    attributes = [
        part.strip().lower() for part in _session_cookie_header(response, settings).split(";")
    ]
    assert "max-age=0" in attributes
    assert {"httponly", "path=/", "samesite=lax"} <= set(attributes)
    assert _only_session(db).revoked_at is not None

    # The client jar dropped the cookie; replaying the old token is rejected too.
    assert_error(client.get("/api/v1/auth/me"), 401, "UNAUTHENTICATED")
    client.cookies.set(settings.SESSION_COOKIE_NAME, token)
    assert_error(client.get("/api/v1/auth/me"), 401, "UNAUTHENTICATED")


def test_logout_without_cookie_still_succeeds(client: TestClient, settings: Settings) -> None:
    response = client.post("/api/v1/auth/logout")
    assert response.status_code == 204
    _session_cookie_header(response, settings)  # deletion header is always sent


def test_logout_twice_is_harmless(
    client: TestClient, settings: Settings, create_user: UserFactory
) -> None:
    create_user(EMAIL)
    token = login_client(client, EMAIL).cookies[settings.SESSION_COOKIE_NAME]
    assert client.post("/api/v1/auth/logout").status_code == 204
    client.cookies.set(settings.SESSION_COOKIE_NAME, token)
    assert client.post("/api/v1/auth/logout").status_code == 204
