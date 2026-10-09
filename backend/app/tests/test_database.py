import re
from datetime import UTC, datetime, timedelta, timezone

import pytest
from sqlalchemy import Engine, func, select, text
from sqlalchemy.exc import IntegrityError, StatementError
from sqlalchemy.orm import Session

from app.models import AuthSession, DnsRecord, HostedZone, RecordValue, User
from app.tests.helpers import UserFactory

ISO_UTC_TEXT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}\+00:00$")


def _zone(user: User, **overrides) -> HostedZone:
    fields = {"zone_id": "Z0123456789ABCDEFGHIJ", "name": "example.com", "zone_type": "PUBLIC"}
    fields.update(overrides)
    return HostedZone(user_id=user.id, **fields)


def test_foreign_keys_enabled_on_every_connection(engine: Engine) -> None:
    for _ in range(2):
        with engine.connect() as connection:
            assert connection.execute(text("PRAGMA foreign_keys")).scalar() == 1


def test_record_with_unknown_zone_violates_foreign_key(db: Session) -> None:
    db.add(DnsRecord(hosted_zone_id="does-not-exist", name="example.com", record_type="A"))
    with pytest.raises(IntegrityError):
        db.commit()


def test_deleting_user_cascades_through_all_children(
    db: Session, engine: Engine, create_user: UserFactory
) -> None:
    user = create_user()
    now = datetime.now(UTC)
    db.add(AuthSession(user_id=user.id, token_hash="a" * 64, expires_at=now + timedelta(hours=1)))
    zone = _zone(user)
    record = DnsRecord(name="www.example.com", record_type="A", ttl_seconds=300)
    record.values.append(
        RecordValue(position=0, value_json={"value": "192.0.2.10"}, display_value="192.0.2.10")
    )
    zone.records.append(record)
    db.add(zone)
    db.commit()

    # Raw SQL proves the cascade is enforced by the database, not the ORM.
    with engine.begin() as connection:
        connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": user.id})

    db.expire_all()
    for model in (AuthSession, HostedZone, DnsRecord, RecordValue):
        assert db.scalar(select(func.count()).select_from(model)) == 0


def test_check_constraints_reject_invalid_enum_values(
    db: Session, create_user: UserFactory
) -> None:
    user = create_user()
    db.add(_zone(user, zone_type="BOGUS"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    zone = _zone(user)
    db.add(zone)
    db.commit()
    db.add(DnsRecord(hosted_zone_id=zone.id, name="example.com", record_type="ALIAS"))
    with pytest.raises(IntegrityError):
        db.commit()


def test_record_set_is_unique_by_zone_name_and_type(db: Session, create_user: UserFactory) -> None:
    zone = _zone(create_user())
    db.add(zone)
    db.commit()
    db.add(DnsRecord(hosted_zone_id=zone.id, name="www.example.com", record_type="A"))
    db.commit()
    db.add(DnsRecord(hosted_zone_id=zone.id, name="www.example.com", record_type="A"))
    with pytest.raises(IntegrityError):
        db.commit()


def test_duplicate_zone_names_are_allowed(db: Session, create_user: UserFactory) -> None:
    user = create_user()
    db.add_all([_zone(user), _zone(user, zone_id="Z9999999999999999999A")])
    db.commit()
    assert db.scalar(select(func.count()).select_from(HostedZone)) == 2


def test_timestamps_round_trip_as_aware_utc(
    db: Session, engine: Engine, create_user: UserFactory
) -> None:
    user = create_user()
    db.expire_all()
    loaded = db.get(User, user.id)
    assert loaded is not None
    assert loaded.created_at.tzinfo is not None
    assert loaded.created_at.utcoffset() == timedelta(0)

    with engine.connect() as connection:
        stored = connection.execute(
            text("SELECT created_at FROM users WHERE id = :id"), {"id": user.id}
        ).scalar_one()
    assert ISO_UTC_TEXT.match(stored), stored


def test_non_utc_input_is_stored_as_utc(
    db: Session, engine: Engine, create_user: UserFactory
) -> None:
    user = create_user()
    ist = timezone(timedelta(hours=5, minutes=30))
    user.created_at = datetime(2026, 10, 9, 23, 30, tzinfo=ist)
    db.commit()
    with engine.connect() as connection:
        stored = connection.execute(
            text("SELECT created_at FROM users WHERE id = :id"), {"id": user.id}
        ).scalar_one()
    assert stored == "2026-10-09T18:00:00.000000+00:00"


def test_naive_datetimes_are_rejected(db: Session, create_user: UserFactory) -> None:
    user = create_user()
    user.created_at = datetime(2026, 10, 9, 12, 0)  # noqa: DTZ001 - deliberately naive
    with pytest.raises(StatementError):
        db.commit()


def test_record_values_are_ordered_by_position(db: Session, create_user: UserFactory) -> None:
    zone = _zone(create_user())
    record = DnsRecord(name="www.example.com", record_type="A", ttl_seconds=300)
    record.values.extend(
        [
            RecordValue(position=1, value_json={"value": "192.0.2.11"}, display_value="192.0.2.11"),
            RecordValue(position=0, value_json={"value": "192.0.2.10"}, display_value="192.0.2.10"),
        ]
    )
    zone.records.append(record)
    db.add(zone)
    db.commit()
    db.expire_all()

    loaded = db.get(DnsRecord, record.id)
    assert loaded is not None
    assert [value.value_json["value"] for value in loaded.values] == ["192.0.2.10", "192.0.2.11"]
