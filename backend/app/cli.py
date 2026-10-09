"""Operator commands: `python -m app.cli <command>`."""

from __future__ import annotations

import argparse
import sys
from collections.abc import Callable, Sequence

from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.migrations import DatabaseNotReadyError, check_database_ready
from app.db.session import build_engine, build_session_factory
from app.models import User
from app.services.auth_service import normalize_email


def _not_implemented(command: str, phase: str) -> Callable[[argparse.Namespace], int]:
    def handler(_args: argparse.Namespace) -> int:
        print(f"{command}: not implemented yet (implemented in {phase})", file=sys.stderr)
        return 1

    return handler


def seed_demo_user(args: argparse.Namespace) -> int:
    """Create the demo user if missing. Never prints the password. Idempotent."""
    settings = get_settings()
    password = settings.DEMO_USER_PASSWORD
    if not password:
        print(
            "seed-demo-user: DEMO_USER_PASSWORD is not set. Set it in backend/.env "
            "(see backend/.env.example) or the environment.",
            file=sys.stderr,
        )
        return 1

    email = normalize_email(settings.DEMO_USER_EMAIL)
    engine = build_engine(settings.DATABASE_URL)
    try:
        try:
            check_database_ready(engine)
        except DatabaseNotReadyError as exc:
            print(f"seed-demo-user: {exc}", file=sys.stderr)
            return 1

        with build_session_factory(engine)() as db:
            user = db.scalar(select(User).where(User.email == email))
            if user is None:
                db.add(
                    User(
                        email=email,
                        display_name=settings.DEMO_USER_DISPLAY_NAME,
                        password_hash=hash_password(password),
                        is_active=True,
                    )
                )
                db.commit()
                print(f"Created demo user {email}.")
            elif args.reset_password:
                user.password_hash = hash_password(password)
                db.commit()
                print(f"Demo user {email} already exists; password reset from DEMO_USER_PASSWORD.")
            else:
                print(
                    f"Demo user {email} already exists; nothing changed "
                    "(use --reset-password to reset its password)."
                )
        return 0
    finally:
        engine.dispose()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    seed_user = subparsers.add_parser(
        "seed-demo-user", help="Create the demo user from DEMO_USER_* settings if missing."
    )
    seed_user.add_argument(
        "--reset-password",
        action="store_true",
        help="If the demo user exists, reset its password to DEMO_USER_PASSWORD.",
    )
    seed_user.set_defaults(handler=seed_demo_user)

    seed_data = subparsers.add_parser(
        "seed-demo-data", help="Load demo hosted zones and records for the demo user."
    )
    seed_data.set_defaults(handler=_not_implemented("seed-demo-data", "PROMPT 03"))

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.handler(args)


if __name__ == "__main__":
    sys.exit(main())
