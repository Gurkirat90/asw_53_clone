import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cli import main
from app.core.security import hash_password, verify_password
from app.models import User

DEMO_EMAIL = "demo@example.test"
DEMO_PASSWORD = "local-demo-password"


@pytest.fixture
def demo_password(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setenv("DEMO_USER_PASSWORD", DEMO_PASSWORD)
    return DEMO_PASSWORD


def _demo_user(db: Session) -> User | None:
    db.expire_all()
    return db.scalar(select(User).where(User.email == DEMO_EMAIL))


def test_seed_creates_demo_user_once(
    db: Session, demo_password: str, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main(["seed-demo-user"]) == 0
    assert main(["seed-demo-user"]) == 0

    output = capsys.readouterr()
    assert "Created demo user demo@example.test." in output.out
    assert "already exists; nothing changed" in output.out
    assert demo_password not in output.out + output.err

    users = db.scalars(select(User)).all()
    assert len(users) == 1
    user = users[0]
    assert user.display_name == "Demo User"
    assert user.is_active
    assert user.password_hash.startswith("$argon2id$")
    assert verify_password(user.password_hash, demo_password)


def test_seed_does_not_overwrite_changed_password_without_flag(
    db: Session, demo_password: str, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main(["seed-demo-user"]) == 0
    user = _demo_user(db)
    assert user is not None
    user.password_hash = hash_password("changed-by-operator")
    db.commit()

    assert main(["seed-demo-user"]) == 0
    user = _demo_user(db)
    assert user is not None
    assert verify_password(user.password_hash, "changed-by-operator")

    assert main(["seed-demo-user", "--reset-password"]) == 0
    user = _demo_user(db)
    assert user is not None
    assert verify_password(user.password_hash, demo_password)
    output = capsys.readouterr()
    assert "password reset" in output.out
    assert demo_password not in output.out + output.err


def test_seed_requires_demo_password(
    db: Session, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.delenv("DEMO_USER_PASSWORD", raising=False)

    assert main(["seed-demo-user"]) == 1
    assert "DEMO_USER_PASSWORD is not set" in capsys.readouterr().err
    assert _demo_user(db) is None


def test_seeded_demo_user_can_log_in(db: Session, demo_password: str, client) -> None:
    assert main(["seed-demo-user"]) == 0
    response = client.post(
        "/api/v1/auth/login", json={"email": DEMO_EMAIL, "password": demo_password}
    )
    assert response.status_code == 200
    assert response.json()["email"] == DEMO_EMAIL


def test_seed_demo_data_requires_demo_user(db: Session, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["seed-demo-data"]) == 1
    assert "run `make seed` first" in capsys.readouterr().err


def test_seed_demo_data_is_idempotent_and_covers_all_types(
    db: Session, demo_password: str, capsys: pytest.CaptureFixture[str]
) -> None:
    from app.models import DnsRecord, HostedZone

    assert main(["seed-demo-user"]) == 0
    assert main(["seed-demo-data"]) == 0
    assert main(["seed-demo-data"]) == 0
    output = capsys.readouterr().out
    assert "created 3 hosted zones and 23 records" in output
    assert "skipped" in output

    db.expire_all()
    zones = {zone.name: zone for zone in db.scalars(select(HostedZone)).all()}
    assert set(zones) == {"example.com", "example.net", "internal.example.com"}
    assert zones["internal.example.com"].zone_type == "PRIVATE"
    main_zone = zones["example.com"]
    types = set(
        db.scalars(
            select(DnsRecord.record_type).where(
                DnsRecord.hosted_zone_id == main_zone.id, DnsRecord.is_system.is_(False)
            )
        ).all()
    )
    assert types == {"A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA"}
    total = db.scalars(select(DnsRecord).where(DnsRecord.hosted_zone_id == main_zone.id)).all()
    assert len(total) == 9 + 12 + 2  # nine types, app-01..12, system NS + SOA
    assert len(db.scalars(select(DnsRecord)).all()) == 23 + 3 * 2
