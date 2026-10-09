"""Operator commands: `python -m app.cli <command>`."""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from typing import Any

from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.migrations import DatabaseNotReadyError, check_database_ready
from app.db.session import build_engine, build_session_factory
from app.models import HostedZone, User
from app.schemas.hosted_zones import ZoneCreate
from app.schemas.records import RecordCreate
from app.services import hosted_zone_service, record_service
from app.services.auth_service import normalize_email

# Demo content uses reserved documentation names and addresses only (RFC 2606 / 5737 / 3849).
DEMO_ZONES: list[dict[str, Any]] = [
    {
        "zone": {"name": "example.com", "zone_type": "PUBLIC", "comment": "Demo zone"},
        "records": [
            {
                "name": "www",
                "record_type": "A",
                "values": [{"value": "192.0.2.10"}, {"value": "192.0.2.11"}],
            },
            {"name": "@", "record_type": "AAAA", "values": [{"value": "2001:db8::10"}]},
            {"name": "app", "record_type": "CNAME", "values": [{"value": "www.example.com"}]},
            {
                "name": "@",
                "record_type": "TXT",
                "values": [{"value": "v=spf1 include:example.net -all"}],
            },
            {
                "name": "@",
                "record_type": "MX",
                "values": [
                    {"priority": 10, "exchange": "mail.example.com"},
                    {"priority": 20, "exchange": "mail2.example.com"},
                ],
            },
            {
                "name": "dev",
                "record_type": "NS",
                "values": [{"value": "ns1.example.net"}, {"value": "ns2.example.net"}],
            },
            {"name": "host-ptr", "record_type": "PTR", "values": [{"value": "host.example.net"}]},
            {
                "name": "_sip._tcp",
                "record_type": "SRV",
                "values": [
                    {"priority": 10, "weight": 5, "port": 5060, "target": "sip.example.com"}
                ],
            },
            {
                "name": "@",
                "record_type": "CAA",
                "values": [
                    {"flags": 0, "tag": "issue", "value": "letsencrypt.org"},
                    {"flags": 0, "tag": "iodef", "value": "mailto:security@example.com"},
                ],
            },
            *[
                {
                    "name": f"app-{n:02d}",
                    "record_type": "A",
                    "values": [{"value": f"198.51.100.{n}"}],
                }
                for n in range(1, 13)
            ],
        ],
    },
    {
        "zone": {"name": "example.net", "zone_type": "PUBLIC", "comment": "Secondary demo zone"},
        "records": [{"name": "www", "record_type": "A", "values": [{"value": "203.0.113.5"}]}],
    },
    {
        "zone": {
            "name": "internal.example.com",
            "zone_type": "PRIVATE",
            "comment": "Simulated private zone; no VPC is associated",
        },
        "records": [{"name": "db", "record_type": "A", "values": [{"value": "192.0.2.50"}]}],
    },
]


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


def seed_demo_data(_args: argparse.Namespace) -> int:
    """Create demo zones and records for the demo user. Skips if the user has any zones."""
    settings = get_settings()
    email = normalize_email(settings.DEMO_USER_EMAIL)
    engine = build_engine(settings.DATABASE_URL)
    try:
        try:
            check_database_ready(engine)
        except DatabaseNotReadyError as exc:
            print(f"seed-demo-data: {exc}", file=sys.stderr)
            return 1

        with build_session_factory(engine)() as db:
            user = db.scalar(select(User).where(User.email == email))
            if user is None:
                print(
                    f"seed-demo-data: demo user {email} does not exist; run `make seed` first.",
                    file=sys.stderr,
                )
                return 1
            existing = db.scalar(
                select(func.count(HostedZone.id)).where(HostedZone.user_id == user.id)
            )
            if existing:
                print(f"seed-demo-data: skipped ({email} already has {existing} hosted zone(s)).")
                return 0

            record_total = 0
            for spec in DEMO_ZONES:
                zone = hosted_zone_service.create_zone(db, user, ZoneCreate(**spec["zone"]))
                for record in spec["records"]:
                    record_service.create_record(db, zone, RecordCreate(**record))
                    record_total += 1
            print(
                f"seed-demo-data: created {len(DEMO_ZONES)} hosted zones and {record_total} "
                f"records for {email} (plus system NS/SOA records)."
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
    seed_data.set_defaults(handler=seed_demo_data)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.handler(args)


if __name__ == "__main__":
    sys.exit(main())
