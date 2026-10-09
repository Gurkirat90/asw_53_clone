"""Hosted zones: owner-scoped CRUD, list queries, and system NS/SOA records."""

from __future__ import annotations

import secrets
import string
from dataclasses import dataclass

from sqlalchemy import Select, asc, desc, func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import NotFound
from app.db.types import utcnow
from app.models import DnsRecord, HostedZone, RecordValue, User
from app.schemas.hosted_zones import ZoneCreate, ZoneListQuery, ZoneUpdate
from app.services._query import LIKE_ESCAPE, contains_pattern
from app.services.dns_validation import format_display_value

ZONE_ID_ALPHABET = string.ascii_uppercase + string.digits
ZONE_ID_LENGTH = 20
SYSTEM_NS_TTL = 172800
SYSTEM_SOA_TTL = 900
SOA_RNAME = "awsdns-hostmaster.invalid"


@dataclass(frozen=True)
class ZoneWithCount:
    zone: HostedZone
    record_count: int


def generate_zone_id() -> str:
    return "Z" + "".join(secrets.choice(ZONE_ID_ALPHABET) for _ in range(ZONE_ID_LENGTH))


def _unique_zone_id(db: Session) -> str:
    while True:
        candidate = generate_zone_id()
        if db.scalar(select(HostedZone.id).where(HostedZone.zone_id == candidate)) is None:
            return candidate


def record_count_subquery():
    return (
        select(func.count(DnsRecord.id))
        .where(DnsRecord.hosted_zone_id == HostedZone.id)
        .correlate(HostedZone)
        .scalar_subquery()
    )


_SORT_COLUMNS = {
    "name": HostedZone.name,
    "zone_type": HostedZone.zone_type,
    "created_at": HostedZone.created_at,
    "updated_at": HostedZone.updated_at,
}


def list_zones(db: Session, user: User, query: ZoneListQuery) -> tuple[list[ZoneWithCount], int]:
    """One query for the page (record_count via correlated subquery) plus one count query."""
    conditions = [HostedZone.user_id == user.id]
    if query.zone_type:
        conditions.append(HostedZone.zone_type == query.zone_type)
    if query.q:
        pattern = contains_pattern(query.q)
        conditions.append(
            or_(
                func.lower(HostedZone.name).like(pattern, escape=LIKE_ESCAPE),
                func.lower(func.coalesce(HostedZone.comment, "")).like(pattern, escape=LIKE_ESCAPE),
            )
        )

    total = db.scalar(select(func.count(HostedZone.id)).where(*conditions)) or 0

    direction = asc if query.sort_order == "asc" else desc
    stmt: Select = (
        select(HostedZone, record_count_subquery().label("record_count"))
        .where(*conditions)
        .order_by(
            direction(_SORT_COLUMNS[query.sort_by]),
            direction(HostedZone.created_at),
            direction(HostedZone.zone_id),
        )
        .limit(query.page_size)
        .offset((query.page - 1) * query.page_size)
    )
    rows = db.execute(stmt).all()
    return [ZoneWithCount(zone=row[0], record_count=row[1]) for row in rows], total


def get_zone(db: Session, user: User, zone_id: str) -> HostedZone:
    """The caller's zone with this public zone_id, or NotFound (also for other users' zones)."""
    zone = db.scalar(
        select(HostedZone).where(HostedZone.zone_id == zone_id, HostedZone.user_id == user.id)
    )
    if zone is None:
        raise NotFound("Hosted zone not found.")
    return zone


def count_records(db: Session, zone: HostedZone) -> int:
    return (
        db.scalar(select(func.count(DnsRecord.id)).where(DnsRecord.hosted_zone_id == zone.id)) or 0
    )


def name_servers(db: Session, zone: HostedZone) -> list[str]:
    ns = db.scalar(
        select(DnsRecord).where(
            DnsRecord.hosted_zone_id == zone.id,
            DnsRecord.record_type == "NS",
            DnsRecord.name == zone.name,
            DnsRecord.is_system.is_(True),
        )
    )
    return [value.value_json["value"] for value in ns.values] if ns else []


def _synthetic_name_servers() -> list[str]:
    """Four distinct Route 53-style names under the reserved .invalid TLD (never resolvable)."""
    chosen: set[str] = set()
    while len(chosen) < 4:
        chosen.add(f"ns-{secrets.randbelow(2047) + 1}.awsdns-{secrets.randbelow(64):02d}.invalid")
    return sorted(chosen, key=lambda host: int(host.split(".")[0].removeprefix("ns-")))


def _system_record(zone: HostedZone, record_type: str, ttl: int, values: list[dict]) -> DnsRecord:
    record = DnsRecord(
        name=zone.name, record_type=record_type, ttl_seconds=ttl, is_system=True, comment=None
    )
    for position, value in enumerate(values):
        record.values.append(
            RecordValue(
                position=position,
                value_json=value,
                display_value=format_display_value(record_type, value),
            )
        )
    return record


def build_system_records(zone: HostedZone) -> list[DnsRecord]:
    servers = _synthetic_name_servers()
    soa = {
        "mname": servers[0],
        "rname": SOA_RNAME,
        "serial": 1,
        "refresh": 7200,
        "retry": 900,
        "expire": 1209600,
        "minimum": 86400,
    }
    return [
        _system_record(zone, "NS", SYSTEM_NS_TTL, [{"value": host} for host in servers]),
        _system_record(zone, "SOA", SYSTEM_SOA_TTL, [soa]),
    ]


def create_zone(db: Session, user: User, data: ZoneCreate) -> HostedZone:
    """Insert the zone and its system NS + SOA records in ONE transaction."""
    now = utcnow()
    zone = HostedZone(
        zone_id=_unique_zone_id(db),
        user_id=user.id,
        name=data.name,
        zone_type=data.zone_type,
        comment=data.comment,
        created_at=now,
        updated_at=now,
    )
    try:
        db.add(zone)
        db.flush()
        for record in build_system_records(zone):
            record.hosted_zone_id = zone.id
            db.add(record)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return zone


def update_zone(db: Session, zone: HostedZone, data: ZoneUpdate) -> HostedZone:
    if "comment" in data.model_fields_set:
        zone.comment = data.comment
    zone.updated_at = utcnow()
    db.commit()
    return zone


def delete_zone(db: Session, zone: HostedZone) -> None:
    """Records and values are removed by ON DELETE CASCADE in the same statement."""
    db.delete(zone)
    db.commit()


def touch_zone(zone: HostedZone) -> None:
    zone.updated_at = utcnow()
