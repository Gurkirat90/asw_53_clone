"""Authentication routes: login, logout, and current user."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.api.deps import CurrentUser, DbSession, SettingsDep, get_session_token
from app.core.config import Settings
from app.schemas.auth import LoginRequest, UserSummary
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session_cookie(response: Response, settings: Settings, token: str) -> None:
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=token,
        max_age=settings.SESSION_TTL_SECONDS,
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.SESSION_COOKIE_SECURE,
    )


def _clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.SESSION_COOKIE_SECURE,
    )


@router.post("/login", response_model=UserSummary)
def login(
    payload: LoginRequest, response: Response, db: DbSession, settings: SettingsDep
) -> UserSummary:
    user = auth_service.authenticate(db, payload.email, payload.password)
    token = auth_service.create_session(db, user, settings.SESSION_TTL_SECONDS)
    _set_session_cookie(response, settings, token)
    return UserSummary.model_validate(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def logout(
    db: DbSession,
    settings: SettingsDep,
    token: Annotated[str | None, Depends(get_session_token)],
) -> Response:
    if token is not None:
        auth_service.revoke_session(db, token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_session_cookie(response, settings)
    return response


@router.get("/me", response_model=UserSummary)
def me(user: CurrentUser) -> UserSummary:
    return UserSummary.model_validate(user)
