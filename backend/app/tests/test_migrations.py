from pathlib import Path

from alembic import command
from sqlalchemy import inspect

from app.db.migrations import alembic_config, head_revision
from app.db.session import build_engine

TABLES = {"users", "sessions", "hosted_zones", "dns_records", "record_values"}


def _inspect(url: str):
    engine = build_engine(url)
    try:
        inspector = inspect(engine)
        return {
            "tables": set(inspector.get_table_names()),
            "unique": {
                table: {tuple(uc["column_names"]) for uc in inspector.get_unique_constraints(table)}
                for table in TABLES & set(inspector.get_table_names())
            },
            "checks": {
                table: {ck["name"] for ck in inspector.get_check_constraints(table)}
                for table in TABLES & set(inspector.get_table_names())
            },
            "fks": {
                table: {
                    (
                        tuple(fk["constrained_columns"]),
                        fk["referred_table"],
                        fk["options"].get("ondelete"),
                    )
                    for fk in inspector.get_foreign_keys(table)
                }
                for table in TABLES & set(inspector.get_table_names())
            },
            "indexes": {
                table: {ix["name"] for ix in inspector.get_indexes(table)}
                for table in TABLES & set(inspector.get_table_names())
            },
        }
    finally:
        engine.dispose()


def test_upgrade_downgrade_upgrade(tmp_path: Path) -> None:
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    config = alembic_config(url)

    command.upgrade(config, "head")
    assert TABLES <= _inspect(url)["tables"]

    command.downgrade(config, "base")
    assert not (TABLES & _inspect(url)["tables"])

    command.upgrade(config, "head")
    schema = _inspect(url)
    assert TABLES <= schema["tables"]
    assert head_revision() == "0001"


def test_schema_constraints_and_indexes(tmp_path: Path) -> None:
    url = f"sqlite:///{tmp_path / 'schema.db'}"
    command.upgrade(alembic_config(url), "head")
    schema = _inspect(url)

    assert ("email",) in schema["unique"]["users"]
    assert ("token_hash",) in schema["unique"]["sessions"]
    assert ("zone_id",) in schema["unique"]["hosted_zones"]
    assert ("hosted_zone_id", "name", "record_type") in schema["unique"]["dns_records"]
    assert ("record_id", "position") in schema["unique"]["record_values"]
    # Zone names are deliberately not unique.
    assert ("user_id", "name") not in schema["unique"]["hosted_zones"]

    assert "ck_users_email_lowercase" in schema["checks"]["users"]
    assert "ck_hosted_zones_zone_type" in schema["checks"]["hosted_zones"]
    assert {
        "ck_dns_records_record_type",
        "ck_dns_records_routing_policy",
        "ck_dns_records_ttl_range",
    } <= schema["checks"]["dns_records"]
    assert "ck_record_values_position_non_negative" in schema["checks"]["record_values"]

    assert (("user_id",), "users", "CASCADE") in schema["fks"]["sessions"]
    assert (("user_id",), "users", "CASCADE") in schema["fks"]["hosted_zones"]
    assert (("hosted_zone_id",), "hosted_zones", "CASCADE") in schema["fks"]["dns_records"]
    assert (("record_id",), "dns_records", "CASCADE") in schema["fks"]["record_values"]

    assert {"ix_sessions_user_id", "ix_sessions_expires_at"} <= schema["indexes"]["sessions"]
    assert {
        "ix_hosted_zones_user_id_name",
        "ix_hosted_zones_user_id_created_at",
    } <= schema["indexes"]["hosted_zones"]
    assert {
        "ix_dns_records_hosted_zone_id_name",
        "ix_dns_records_hosted_zone_id_record_type",
    } <= schema["indexes"]["dns_records"]
