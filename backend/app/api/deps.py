"""Shared FastAPI dependencies. Every non-auth route must depend on get_current_user."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import Unauthenticated
from app.db.session import get_db
from app.models import User
from app.services import auth_service

# Cookies are small; anything longer is not one of our tokens.
MAX_SESSION_TOKEN_LENGTH = 256


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


SettingsDep = Annotated[Settings, Depends(get_app_settings)]
DbSession = Annotated[Session, Depends(get_db)]


def get_session_token(request: Request, settings: SettingsDep) -> str | None:
    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if not token or len(token) > MAX_SESSION_TOKEN_LENGTH:
        return None
    return token


def get_current_user(
    db: DbSession, token: Annotated[str | None, Depends(get_session_token)]
) -> User:
    if token is None:
        raise Unauthenticated()
    user = auth_service.resolve_session(db, token)
    if user is None:
        raise Unauthenticated()
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
