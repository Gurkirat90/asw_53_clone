import re

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.main import create_app
from app.models import DnsRecord, HostedZone, RecordValue
from app.services import hosted_zone_service
from app.tests.helpers import (
    assert_error,
    create_record,
    create_zone,
    details_by_field,
    login_client,
    records_url,
)

ZONES = "/api/v1/hosted-zones"


def _count(db: Session, model) -> int:
    db.expire_all()
    return db.scalar(select(func.count()).select_from(model)) or 0


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", ZONES),
        ("post", ZONES),
        ("get", f"{ZONES}/Z0000000000000000000A"),
        ("patch", f"{ZONES}/Z0000000000000000000A"),
        ("delete", f"{ZONES}/Z0000000000000000000A"),
        ("get", f"{ZONES}/Z0000000000000000000A/records"),
        ("post", f"{ZONES}/Z0000000000000000000A/records"),
        ("get", f"{ZONES}/Z0000000000000000000A/records/abc"),
        ("patch", f"{ZONES}/Z0000000000000000000A/records/abc"),
        ("delete", f"{ZONES}/Z0000000000000000000A/records/abc"),
    ],
)
def test_every_route_requires_a_session(client: TestClient, method: str, path: str) -> None:
    kwargs = {"json": {}} if method in ("post", "patch") else {}
    assert_error(getattr(client, method)(path, **kwargs), 401, "UNAUTHENTICATED")


# --- Create ------------------------------------------------------------------------------------


def test_create_zone_returns_detail_with_system_records(
    auth_client: TestClient, db: Session
) -> None:
    response = auth_client.post(
        ZONES, json={"name": " Example.COM. ", "comment": "  Primary demo zone "}
    )

    assert response.status_code == 201
    body = response.json()
    assert set(body) == {
        "zone_id",
        "name",
        "zone_type",
        "comment",
        "record_count",
        "created_at",
        "updated_at",
        "name_servers",
    }
    assert re.fullmatch(r"Z[A-Z0-9]{20}", body["zone_id"])
    assert body["name"] == "example.com"
    assert body["zone_type"] == "PUBLIC"
    assert body["comment"] == "Primary demo zone"
    assert body["record_count"] == 2
    assert len(body["name_servers"]) == 4 == len(set(body["name_servers"]))
    assert all(
        re.fullmatch(r"ns-\d{1,4}\.awsdns-\d{2}\.invalid", ns) for ns in body["name_servers"]
    )

    records = auth_client.get(records_url(body["zone_id"])).json()["items"]
    by_type = {record["record_type"]: record for record in records}
    assert set(by_type) == {"NS", "SOA"}
    assert all(record["is_system"] and record["name"] == "example.com" for record in records)
    assert by_type["NS"]["ttl_seconds"] == 172800
    assert [v["value"] for v in by_type["NS"]["values"]] == body["name_servers"]
    soa = by_type["SOA"]
    assert soa["ttl_seconds"] == 900
    assert soa["values"] == [
        {
            "mname": body["name_servers"][0],
            "rname": "awsdns-hostmaster.invalid",
            "serial": 1,
            "refresh": 7200,
            "retry": 900,
            "expire": 1209600,
            "minimum": 86400,
        }
    ]
    assert soa["display_values"] == [
        f"{body['name_servers'][0]} awsdns-hostmaster.invalid 1 7200 900 1209600 86400"
    ]


def test_create_private_zone(auth_client: TestClient) -> None:
    assert create_zone(auth_client, "internal.example.com", "PRIVATE")["zone_type"] == "PRIVATE"


@pytest.mark.parametrize(
    "name",
    ["", "example", "http://example.com", "exa mple.com", "_x.example.com", "a" * 64 + ".com"],
)
def test_invalid_zone_name_is_rejected_without_writes(
    auth_client: TestClient, db: Session, name: str
) -> None:
    error = assert_error(auth_client.post(ZONES, json={"name": name}), 422, "VALIDATION_ERROR")
    assert details_by_field(error) == {"name": "Enter a valid domain name, such as example.com."}
    assert _count(db, HostedZone) == 0
    assert _count(db, DnsRecord) == 0


def test_create_zone_validates_all_fields_together(auth_client: TestClient) -> None:
    response = auth_client.post(
        ZONES, json={"zone_type": "SHARED", "comment": "c" * 1001, "extra": True}
    )
    error = assert_error(response, 422, "VALIDATION_ERROR")
    assert set(details_by_field(error)) == {"name", "zone_type", "comment", "extra"}


def test_duplicate_zone_names_are_allowed(auth_client: TestClient) -> None:
    first = create_zone(auth_client, "example.com")
    second = create_zone(auth_client, "EXAMPLE.com.")
    assert first["zone_id"] != second["zone_id"]
    assert first["name"] == second["name"] == "example.com"
    assert auth_client.get(ZONES).json()["total_items"] == 2


def test_failure_during_system_records_rolls_back_the_zone(
    auth_client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    def explode(zone):  # runs after the zone row has been flushed
        raise RuntimeError("simulated failure while creating system records")

    monkeypatch.setattr(hosted_zone_service, "build_system_records", explode)

    response = auth_client.post(ZONES, json={"name": "example.com"})

    assert_error(response, 500, "INTERNAL_ERROR")
    assert _count(db, HostedZone) == 0
    assert _count(db, DnsRecord) == 0


# --- Read / list -------------------------------------------------------------------------------


def test_get_zone_detail(auth_client: TestClient) -> None:
    zone = create_zone(auth_client, comment="Demo zone")
    response = auth_client.get(f"{ZONES}/{zone['zone_id']}")
    assert response.status_code == 200
    assert response.json() == zone


def test_unknown_zone_is_not_found(auth_client: TestClient) -> None:
    assert_error(auth_client.get(f"{ZONES}/ZDOESNOTEXIST00000000"), 404, "NOT_FOUND")


def test_empty_list(auth_client: TestClient) -> None:
    assert auth_client.get(ZONES).json() == {
        "items": [],
        "page": 1,
        "page_size": 20,
        "total_items": 0,
        "total_pages": 0,
    }


def test_list_search_by_name_and_comment(auth_client: TestClient) -> None:
    create_zone(auth_client, "alpha.example.com", comment="Marketing site")
    create_zone(auth_client, "beta.example.net", comment="100% legit_zone")
    create_zone(auth_client, "gamma.example.org")

    def names(q: str) -> list[str]:
        response = auth_client.get(ZONES, params={"q": q})
        assert response.status_code == 200
        return [item["name"] for item in response.json()["items"]]

    assert names("  ALPHA ") == ["alpha.example.com"]
    assert names("marketing") == ["alpha.example.com"]
    assert names("example") == ["alpha.example.com", "beta.example.net", "gamma.example.org"]
    assert names("%") == ["beta.example.net"]  # literal percent in the comment
    assert names("_") == ["beta.example.net"]  # literal underscore, not a wildcard
    assert names("0%") == ["beta.example.net"]
    assert names("nothing-matches") == []
    assert names("   ") == ["alpha.example.com", "beta.example.net", "gamma.example.org"]


def test_list_filter_by_zone_type(auth_client: TestClient) -> None:
    create_zone(auth_client, "public.example.com")
    create_zone(auth_client, "private.example.com", "PRIVATE")
    body = auth_client.get(ZONES, params={"zone_type": "PRIVATE"}).json()
    assert [item["name"] for item in body["items"]] == ["private.example.com"]
    assert body["total_items"] == 1


@pytest.mark.parametrize(
    ("params", "field"),
    [
        ({"zone_type": "SHARED"}, "zone_type"),
        ({"page": 0}, "page"),
        ({"page_size": 101}, "page_size"),
        ({"page_size": 0}, "page_size"),
        ({"sort_by": "comment"}, "sort_by"),
        ({"sort_order": "up"}, "sort_order"),
        ({"page": "two"}, "page"),
    ],
)
def test_invalid_list_params(auth_client: TestClient, params: dict, field: str) -> None:
    error = assert_error(auth_client.get(ZONES, params=params), 422, "VALIDATION_ERROR")
    assert [detail["field"] for detail in error["details"]] == [field]


def test_list_sorting(auth_client: TestClient) -> None:
    b = create_zone(auth_client, "b.example.com", "PRIVATE")
    a = create_zone(auth_client, "a.example.com", "PUBLIC")
    c = create_zone(auth_client, "c.example.com", "PRIVATE")
    # Make c the most recently updated.
    auth_client.patch(f"{ZONES}/{c['zone_id']}", json={"comment": "touched"})

    def order(sort_by: str, sort_order: str) -> list[str]:
        params = {"sort_by": sort_by, "sort_order": sort_order}
        return [item["name"][0] for item in auth_client.get(ZONES, params=params).json()["items"]]

    assert order("name", "asc") == ["a", "b", "c"]
    assert order("name", "desc") == ["c", "b", "a"]
    assert order("created_at", "asc") == ["b", "a", "c"]
    assert order("created_at", "desc") == ["c", "a", "b"]
    assert order("updated_at", "asc") == ["b", "a", "c"]
    assert order("updated_at", "desc") == ["c", "a", "b"]
    # zone_type ties break by created_at (same direction).
    assert order("zone_type", "asc") == ["b", "c", "a"]
    assert order("zone_type", "desc") == ["a", "c", "b"]
    assert {a["zone_id"], b["zone_id"], c["zone_id"]}


def test_pagination_totals(auth_client: TestClient) -> None:
    for index in range(7):
        create_zone(auth_client, f"z{index}.example.com")

    page = auth_client.get(ZONES, params={"page_size": 3, "page": 3}).json()
    assert page["total_items"] == 7
    assert page["total_pages"] == 3
    assert [item["name"] for item in page["items"]] == ["z6.example.com"]

    beyond = auth_client.get(ZONES, params={"page_size": 3, "page": 9}).json()
    assert beyond["items"] == []
    assert (beyond["total_items"], beyond["total_pages"], beyond["page"]) == (7, 3, 9)


def test_record_count_includes_system_and_user_records(auth_client: TestClient) -> None:
    zone = create_zone(auth_client)
    create_record(
        auth_client, zone["zone_id"], name="www", record_type="A", values=[{"value": "192.0.2.10"}]
    )
    item = auth_client.get(ZONES).json()["items"][0]
    assert item["record_count"] == 3
    assert auth_client.get(f"{ZONES}/{zone['zone_id']}").json()["record_count"] == 3


# --- Update ------------------------------------------------------------------------------------


def test_patch_comment_persists_and_updates_timestamp(auth_client: TestClient) -> None:
    zone = create_zone(auth_client, comment="Old")
    response = auth_client.patch(f"{ZONES}/{zone['zone_id']}", json={"comment": "New comment"})

    assert response.status_code == 200
    body = response.json()
    assert body["comment"] == "New comment"
    assert body["updated_at"] > zone["updated_at"]
    assert body["created_at"] == zone["created_at"]
    assert auth_client.get(f"{ZONES}/{zone['zone_id']}").json()["comment"] == "New comment"

    cleared = auth_client.patch(f"{ZONES}/{zone['zone_id']}", json={"comment": None}).json()
    assert cleared["comment"] is None


@pytest.mark.parametrize("payload", [{"name": "other.com"}, {"zone_type": "PRIVATE"}])
def test_patch_name_or_type_is_rejected(auth_client: TestClient, payload: dict) -> None:
    zone = create_zone(auth_client)
    response = auth_client.patch(f"{ZONES}/{zone['zone_id']}", json=payload)
    error = assert_error(response, 422, "VALIDATION_ERROR")
    field = next(iter(payload))
    assert details_by_field(error) == {
        field: "Domain name and type cannot be changed after creation."
    }
    assert auth_client.get(f"{ZONES}/{zone['zone_id']}").json() == zone


def test_patch_unknown_field_and_long_comment(auth_client: TestClient) -> None:
    zone = create_zone(auth_client)
    error = assert_error(
        auth_client.patch(
            f"{ZONES}/{zone['zone_id']}", json={"comment": "x" * 1001, "zone_id": "Z"}
        ),
        422,
        "VALIDATION_ERROR",
    )
    assert set(details_by_field(error)) == {"comment", "zone_id"}


# --- Ownership ---------------------------------------------------------------------------------


def test_other_users_zone_is_not_found_and_unchanged(
    auth_client: TestClient, other_client: TestClient
) -> None:
    zone = create_zone(auth_client, comment="Mine")
    path = f"{ZONES}/{zone['zone_id']}"

    assert_error(other_client.get(path), 404, "NOT_FOUND")
    assert_error(other_client.patch(path, json={"comment": "Hijacked"}), 404, "NOT_FOUND")
    assert_error(other_client.delete(path), 404, "NOT_FOUND")
    assert other_client.get(ZONES).json()["total_items"] == 0

    assert auth_client.get(path).json() == zone


# --- Delete ------------------------------------------------------------------------------------


def test_delete_cascades_only_that_zone(auth_client: TestClient, db: Session) -> None:
    doomed = create_zone(auth_client, "doomed.example.com")
    kept = create_zone(auth_client, "kept.example.com")
    for zone in (doomed, kept):
        create_record(
            auth_client,
            zone["zone_id"],
            name="www",
            record_type="A",
            values=[{"value": "192.0.2.10"}, {"value": "192.0.2.11"}],
        )

    response = auth_client.delete(f"{ZONES}/{doomed['zone_id']}")

    assert response.status_code == 204
    assert response.content == b""
    assert_error(auth_client.get(f"{ZONES}/{doomed['zone_id']}"), 404, "NOT_FOUND")
    db.expire_all()
    doomed_id = db.scalar(select(HostedZone.id).where(HostedZone.zone_id == doomed["zone_id"]))
    assert doomed_id is None
    kept_row = db.scalar(select(HostedZone).where(HostedZone.zone_id == kept["zone_id"]))
    assert kept_row is not None
    assert _count(db, DnsRecord) == 3  # kept zone: NS + SOA + A
    assert _count(db, RecordValue) == 4 + 1 + 2
    assert (
        db.scalar(select(func.count(DnsRecord.id)).where(DnsRecord.hosted_zone_id != kept_row.id))
        == 0
    )


# --- Persistence -------------------------------------------------------------------------------


def test_data_persists_across_app_instances(
    app: FastAPI, settings: Settings, auth_client: TestClient
) -> None:
    zone = create_zone(auth_client, comment="Persisted")
    record = create_record(
        auth_client, zone["zone_id"], name="www", record_type="A", values=[{"value": "192.0.2.10"}]
    )
    app.state.engine.dispose()

    with TestClient(create_app(settings)) as restarted:
        login_client(restarted, "user@example.com")
        assert restarted.get(f"{ZONES}/{zone['zone_id']}").json()["comment"] == "Persisted"
        fetched = restarted.get(records_url(zone["zone_id"], record["id"])).json()
        assert fetched == record
