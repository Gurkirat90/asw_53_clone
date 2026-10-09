"""Mock authentication: credential checks and opaque, server-side, revocable sessions."""

from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.errors import AuthenticationFailed
from app.core.security import (
    dummy_password_hash,
    generate_session_token,
    hash_password,
    hash_session_token,
    password_needs_rehash,
    verify_password,
)
from app.db.types import utcnow
from app.models import AuthSession, User

logger = logging.getLogger(__name__)

LAST_SEEN_UPDATE_INTERVAL = timedelta(minutes=5)
EXPIRED_SESSION_RETENTION = timedelta(days=1)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def authenticate(db: Session, email: str, password: str) -> User:
    """Return the active user for these credentials or raise AuthenticationFailed.

    Unknown, inactive, and wrong-password cases all raise the same error, and unknown users
    still pay for one Argon2 verification so response timing stays similar.
    """
    user = db.scalar(select(User).where(User.email == normalize_email(email)))
    if user is None or not user.is_active:
        verify_password(dummy_password_hash(), password)
        logger.debug("Login rejected")
        raise AuthenticationFailed()
    if not verify_password(user.password_hash, password):
        logger.debug("Login rejected")
        raise AuthenticationFailed()
    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
        db.commit()
    return user


def create_session(db: Session, user: User, ttl_seconds: int) -> str:
    """Persist a new session and return the raw token (only its hash is stored)."""
    now = utcnow()
    token = generate_session_token()
    db.add(
        AuthSession(
            user_id=user.id,
            token_hash=hash_session_token(token),
            created_at=now,
            last_seen_at=now,
            expires_at=now + timedelta(seconds=ttl_seconds),
        )
    )
    # Opportunistic cleanup of long-expired sessions.
    db.execute(delete(AuthSession).where(AuthSession.expires_at < now - EXPIRED_SESSION_RETENTION))
    db.commit()
    return token


def resolve_session(db: Session, raw_token: str) -> User | None:
    """Return the user for a valid session token, or None if it is unknown, revoked, expired,
    or belongs to an inactive user."""
    session = db.scalar(
        select(AuthSession).where(AuthSession.token_hash == hash_session_token(raw_token))
    )
    now = utcnow()
    if session is None or session.revoked_at is not None or session.expires_at <= now:
        return None
    user = session.user
    if not user.is_active:
        return None
    if now - session.last_seen_at >= LAST_SEEN_UPDATE_INTERVAL:
        session.last_seen_at = now
        db.commit()
    return user


def revoke_session(db: Session, raw_token: str) -> bool:
    """Revoke the session for this token. Returns True if a session was revoked."""
    session = db.scalar(
        select(AuthSession).where(AuthSession.token_hash == hash_session_token(raw_token))
    )
    if session is None or session.revoked_at is not None:
        return False
    session.revoked_at = utcnow()
    db.commit()
    return True
