"""DNS records: owner-scoped CRUD within a hosted zone, with cross-record rules."""

from __future__ import annotations

from typing import Any

from sqlalchemy import asc, desc, exists, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.errors import NotFound, RecordConflict, SystemRecordProtected
from app.db.types import utcnow
from app.models import DnsRecord, HostedZone, RecordValue
from app.schemas.records import RecordCreate, RecordListQuery, RecordUpdate
from app.services import dns_validation
from app.services._query import LIKE_ESCAPE, contains_pattern
from app.services.hosted_zone_service import touch_zone

DUPLICATE_MESSAGE = "A record set with this name and type already exists."

_SORT_COLUMNS = {
    "name": DnsRecord.name,
    "record_type": DnsRecord.record_type,
    "ttl_seconds": DnsRecord.ttl_seconds,
    "updated_at": DnsRecord.updated_at,
}


def list_records(
    db: Session, zone: HostedZone, query: RecordListQuery
) -> tuple[list[DnsRecord], int]:
    conditions = [DnsRecord.hosted_zone_id == zone.id]
    if query.record_type:
        conditions.append(DnsRecord.record_type == query.record_type)
    if query.routing_policy:
        conditions.append(DnsRecord.routing_policy == query.routing_policy)
    if query.q:
        pattern = contains_pattern(query.q)
        value_match = exists(
            select(RecordValue.id).where(
                RecordValue.record_id == DnsRecord.id,
                func.lower(RecordValue.display_value).like(pattern, escape=LIKE_ESCAPE),
            )
        )
        conditions.append(
            or_(
                func.lower(DnsRecord.name).like(pattern, escape=LIKE_ESCAPE),
                func.lower(DnsRecord.record_type).like(pattern, escape=LIKE_ESCAPE),
                value_match,
            )
        )

    total = db.scalar(select(func.count(DnsRecord.id)).where(*conditions)) or 0
    direction = asc if query.sort_order == "asc" else desc
    stmt = (
        select(DnsRecord)
        .where(*conditions)
        .options(selectinload(DnsRecord.values))  # one extra query for all values, ordered
        .order_by(
            direction(_SORT_COLUMNS[query.sort_by]),
            direction(DnsRecord.record_type),
            direction(DnsRecord.id),
        )
        .limit(query.page_size)
        .offset((query.page - 1) * query.page_size)
    )
    return list(db.scalars(stmt).all()), total


def get_record(db: Session, zone: HostedZone, record_id: str) -> DnsRecord:
    """A record that belongs to this (already owner-checked) zone, or NotFound."""
    record = db.scalar(
        select(DnsRecord)
        .where(DnsRecord.id == record_id, DnsRecord.hosted_zone_id == zone.id)
        .options(selectinload(DnsRecord.values))
    )
    if record is None:
        raise NotFound("Record not found.")
    return record


def _check_conflicts(
    db: Session, zone: HostedZone, name: str, record_type: str, exclude_id: str | None
) -> None:
    stmt = select(DnsRecord.record_type).where(
        DnsRecord.hosted_zone_id == zone.id, DnsRecord.name == name
    )
    if exclude_id is not None:
        stmt = stmt.where(DnsRecord.id != exclude_id)
    existing = set(db.scalars(stmt).all())
    detail = [{"field": "name", "message": ""}]
    if record_type in existing:
        detail[0]["message"] = DUPLICATE_MESSAGE
        raise RecordConflict(DUPLICATE_MESSAGE, detail)
    if record_type == "CNAME" and existing:
        message = (
            f"A CNAME record can't share the name {name} with other records "
            f"(found: {', '.join(sorted(existing))})."
        )
        detail[0]["message"] = message
        raise RecordConflict(message, detail)
    if "CNAME" in existing:
        message = f"{name} already has a CNAME record, so no other record type can use that name."
        detail[0]["message"] = message
        raise RecordConflict(message, detail)


def _replace_values(
    db: Session, record: DnsRecord, validated: dns_validation.ValidatedRecord
) -> None:
    if record.values:
        record.values.clear()
        db.flush()  # delete old rows first so (record_id, position) stays unique
    for position, (value, display) in enumerate(
        zip(validated.values, validated.display_values, strict=True)
    ):
        record.values.append(
            RecordValue(position=position, value_json=value, display_value=display)
        )


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # The unique index caught a concurrent duplicate that passed the service check.
        raise RecordConflict(
            DUPLICATE_MESSAGE, [{"field": "name", "message": DUPLICATE_MESSAGE}]
        ) from exc


def create_record(db: Session, zone: HostedZone, data: RecordCreate) -> DnsRecord:
    validated = dns_validation.validate_record(
        zone.name,
        name=data.name,
        record_type=data.record_type,
        routing_policy=data.routing_policy,
        ttl_seconds=data.ttl_seconds,
        values=data.values,
        comment=data.comment,
    )
    _check_conflicts(db, zone, validated.name, validated.record_type, exclude_id=None)
    now = utcnow()
    record = DnsRecord(
        hosted_zone_id=zone.id,
        created_at=now,
        updated_at=now,
        name=validated.name,
        record_type=validated.record_type,
        routing_policy=validated.routing_policy,
        ttl_seconds=validated.ttl_seconds,
        comment=validated.comment,
        is_system=False,
    )
    db.add(record)
    _replace_values(db, record, validated)
    touch_zone(zone)
    _commit(db)
    return record


def _current_values(record: DnsRecord) -> list[dict[str, Any]]:
    return [dict(value.value_json) for value in record.values]


def update_record(
    db: Session, zone: HostedZone, record: DnsRecord, data: RecordUpdate
) -> DnsRecord:
    if record.is_system:
        raise SystemRecordProtected()
    provided = data.model_fields_set
    new_type = data.record_type if "record_type" in provided else record.record_type
    if new_type != record.record_type and "values" not in provided:
        raise dns_validation.DnsFieldErrors(
            [{"field": "values", "message": "Provide values for the new record type."}]
        )

    validated = dns_validation.validate_record(
        zone.name,
        name=data.name if "name" in provided else record.name,
        record_type=new_type,
        routing_policy=data.routing_policy
        if "routing_policy" in provided
        else record.routing_policy,
        ttl_seconds=data.ttl_seconds if "ttl_seconds" in provided else record.ttl_seconds,
        values=data.values if "values" in provided else _current_values(record),
        comment=data.comment if "comment" in provided else record.comment,
    )
    _check_conflicts(db, zone, validated.name, validated.record_type, exclude_id=record.id)

    record.name = validated.name
    record.record_type = validated.record_type
    record.routing_policy = validated.routing_policy
    record.ttl_seconds = validated.ttl_seconds
    record.comment = validated.comment
    # Set explicitly: a values-only edit changes no dns_records column, so onupdate won't fire.
    record.updated_at = utcnow()
    _replace_values(db, record, validated)
    touch_zone(zone)
    _commit(db)
    return record


def delete_record(db: Session, zone: HostedZone, record: DnsRecord) -> None:
    if record.is_system:
        raise SystemRecordProtected()
    db.delete(record)
    touch_zone(zone)
    db.commit()
