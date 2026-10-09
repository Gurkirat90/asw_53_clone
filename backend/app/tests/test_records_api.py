import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import DnsRecord, RecordValue
from app.tests.helpers import (
    RECORD_TYPE_CASES,
    assert_error,
    create_record,
    create_zone,
    details_by_field,
    records_url,
)


@pytest.fixture
def zone(auth_client: TestClient) -> dict:
    return create_zone(auth_client, "example.com")


def _rows(db: Session) -> tuple[int, int]:
    db.expire_all()
    return (
        db.scalar(select(func.count(DnsRecord.id))) or 0,
        db.scalar(select(func.count(RecordValue.id))) or 0,
    )


def _system(client: TestClient, zone_id: str, record_type: str) -> dict:
    items = client.get(records_url(zone_id), params={"record_type": record_type}).json()["items"]
    return next(item for item in items if item["is_system"])


# --- Full lifecycle for each of the nine user types ---------------------------------------------


@pytest.mark.parametrize("record_type", list(RECORD_TYPE_CASES))
def test_record_type_round_trip(
    auth_client: TestClient, zone: dict, db: Session, record_type: str
) -> None:
    payload, fqdn, displays, new_values, new_displays = RECORD_TYPE_CASES[record_type]
    zone_id = zone["zone_id"]

    created = auth_client.post(
        records_url(zone_id), json={**payload, "record_type": record_type, "ttl_seconds": 600}
    )
    assert created.status_code == 201, created.text
    record = created.json()
    assert set(record) == {
        "id",
        "zone_id",
        "name",
        "record_type",
        "routing_policy",
        "ttl_seconds",
        "values",
        "display_values",
        "comment",
        "is_system",
        "created_at",
        "updated_at",
    }
    assert record["zone_id"] == zone_id
    assert record["name"] == fqdn
    assert record["record_type"] == record_type
    assert record["routing_policy"] == "SIMPLE"
    assert record["ttl_seconds"] == 600
    assert record["display_values"] == displays
    assert record["is_system"] is False
    assert len(record["values"]) == len(displays)

    assert auth_client.get(records_url(zone_id, record["id"])).json() == record
    listed = auth_client.get(records_url(zone_id), params={"record_type": record_type}).json()
    assert record in listed["items"]

    patched = auth_client.patch(
        records_url(zone_id, record["id"]), json={"ttl_seconds": 60, "values": new_values}
    )
    assert patched.status_code == 200, patched.text
    updated = patched.json()
    assert updated["id"] == record["id"]
    assert updated["ttl_seconds"] == 60
    assert updated["display_values"] == new_displays  # order preserved
    assert updated["name"] == fqdn
    assert updated["updated_at"] > record["updated_at"]
    assert updated["created_at"] == record["created_at"]
    assert _rows(db) == (3, 5 + len(new_values))  # NS(4) + SOA(1) values + this record's

    deleted = auth_client.delete(records_url(zone_id, record["id"]))
    assert deleted.status_code == 204
    assert_error(auth_client.get(records_url(zone_id, record["id"])), 404, "NOT_FOUND")
    assert _rows(db) == (2, 5)


def test_default_ttl_and_comment(auth_client: TestClient, zone: dict) -> None:
    record = create_record(
        auth_client,
        zone["zone_id"],
        name="www",
        record_type="A",
        values=[{"value": "192.0.2.10"}],
        comment="  Demo web endpoint  ",
    )
    assert record["ttl_seconds"] == 300
    assert record["comment"] == "Demo web endpoint"


def test_record_mutations_touch_the_zone(auth_client: TestClient, zone: dict) -> None:
    record = create_record(
        auth_client, zone["zone_id"], name="www", record_type="A", values=[{"value": "192.0.2.10"}]
    )
    after_create = auth_client.get(f"/api/v1/hosted-zones/{zone['zone_id']}").json()
    assert after_create["updated_at"] > zone["updated_at"]
    auth_client.delete(records_url(zone["zone_id"], record["id"]))
    after_delete = auth_client.get(f"/api/v1/hosted-zones/{zone['zone_id']}").json()
    assert after_delete["updated_at"] > after_create["updated_at"]


def test_patch_can_rename_and_change_type(auth_client: TestClient, zone: dict) -> None:
    record = create_record(
        auth_client, zone["zone_id"], name="www", record_type="A", values=[{"value": "192.0.2.10"}]
    )
    url = records_url(zone["zone_id"], record["id"])

    error = assert_error(
        auth_client.patch(url, json={"record_type": "AAAA"}), 422, "VALIDATION_ERROR"
    )
    assert details_by_field(error) == {"values": "Provide values for the new record type."}

    changed = auth_client.patch(
        url,
        json={
            "name": "web.example.com.",
            "record_type": "AAAA",
            "values": [{"value": "2001:db8::1"}],
        },
    ).json()
    assert (changed["id"], changed["name"], changed["record_type"]) == (
        record["id"],
        "web.example.com",
        "AAAA",
    )


# --- Validation (exact field paths; no writes) --------------------------------------------------


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        (
            {
                "name": "www",
                "record_type": "A",
                "values": [{"value": "192.0.2.1"}, {"value": "192.0.2.256"}],
            },
            {"values.1.value": "Enter a valid IPv4 address, such as 192.0.2.10."},
        ),
        (
            {"name": "www", "record_type": "AAAA", "values": [{"value": "192.0.2.1"}]},
            {"values.0.value": "Enter a valid IPv6 address, such as 2001:db8::10."},
        ),
        (
            {"name": "app", "record_type": "CNAME", "values": [{"value": "not a host"}]},
            {"values.0.value": "Enter a valid hostname, such as host.example.net."},
        ),
        (
            {"name": "@", "record_type": "TXT", "values": [{"value": "a\nb"}]},
            {"values.0.value": "Text values can't contain line breaks or control characters."},
        ),
        (
            {"name": "@", "record_type": "MX", "values": [{"priority": 70000, "exchange": "mail"}]},
            {
                "values.0.priority": "Enter a whole number from 0 to 65535 for priority.",
                "values.0.exchange": "Enter a valid hostname, such as host.example.net.",
            },
        ),
        (
            {"name": "dev", "record_type": "NS", "values": [{"value": "ns1"}]},
            {"values.0.value": "Enter a valid hostname, such as host.example.net."},
        ),
        (
            {"name": "1", "record_type": "PTR", "values": [{"value": "http://host.example.net"}]},
            {"values.0.value": "Enter a valid hostname, such as host.example.net."},
        ),
        (
            {
                "name": "_sip._tcp",
                "record_type": "SRV",
                "values": [
                    {"priority": 1, "weight": 1, "port": 70000, "target": "sip.example.com"}
                ],
            },
            {"values.0.port": "Enter a whole number from 0 to 65535 for port."},
        ),
        (
            {
                "name": "@",
                "record_type": "CAA",
                "values": [{"flags": 0, "tag": "iodef", "value": "security@example.com"}],
            },
            {"values.0.value": "For iodef, enter a mailto:, http://, or https:// URL."},
        ),
        (
            {
                "name": "www",
                "record_type": "A",
                "values": [{"value": "192.0.2.1"}, {"value": "192.0.2.1"}],
            },
            {"values.1": "This value duplicates value 1."},
        ),
        (
            {"name": "www", "record_type": "A", "values": [{"value": "192.0.2.1", "port": 80}]},
            {"values.0": "Unknown field(s) for A: port."},
        ),
        (
            {"name": "www", "record_type": "A", "values": []},
            {"values": "Add at least one value."},
        ),
        (
            {
                "name": "www",
                "record_type": "A",
                "values": [{"value": f"192.0.2.{n}"} for n in range(101)],
            },
            {"values": "A record can have at most 100 values."},
        ),
        (
            {
                "name": "app",
                "record_type": "CNAME",
                "values": [{"value": "a.example.net"}, {"value": "b.example.net"}],
            },
            {"values": "A CNAME record must have exactly one value."},
        ),
        (
            {"name": "@", "record_type": "CNAME", "values": [{"value": "www.example.net"}]},
            {"name": "CNAME records are not allowed at the zone apex."},
        ),
        (
            {"name": "@", "record_type": "SOA", "values": [{"value": "x"}]},
            {"record_type": "SOA records are managed by the system."},
        ),
        (
            {"name": "www", "record_type": "ALIAS", "values": [{"value": "x"}]},
            {"record_type": "Choose one of: A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, CAA."},
        ),
        (
            {
                "name": "www",
                "record_type": "A",
                "routing_policy": "WEIGHTED",
                "values": [{"value": "192.0.2.1"}],
            },
            {"routing_policy": "Only Simple routing is supported in Fiftythree."},
        ),
        (
            {"name": "www.other.com.", "record_type": "A", "values": [{"value": "192.0.2.1"}]},
            {"name": "Record name must be within example.com."},
        ),
        (
            {"name": "", "record_type": "A", "values": [{"value": "192.0.2.1"}]},
            {"name": "Enter @ for the zone apex."},
        ),
        (
            {
                "name": "www",
                "record_type": "A",
                "ttl_seconds": 30.5,
                "values": [{"value": "192.0.2.1"}],
            },
            {"ttl_seconds": "Enter a whole number of seconds from 0 to 2147483647."},
        ),
        (
            {
                "name": "www",
                "record_type": "A",
                "ttl_seconds": "300",
                "values": [{"value": "192.0.2.1"}],
            },
            {"ttl_seconds": "Enter a whole number of seconds from 0 to 2147483647."},
        ),
        (
            {
                "name": "www",
                "record_type": "A",
                "ttl_seconds": True,
                "values": [{"value": "192.0.2.1"}],
            },
            {"ttl_seconds": "Enter a whole number of seconds from 0 to 2147483647."},
        ),
        (
            {
                "name": "www",
                "record_type": "A",
                "ttl_seconds": 2147483648,
                "values": [{"value": "192.0.2.1"}],
            },
            {"ttl_seconds": "Enter a whole number of seconds from 0 to 2147483647."},
        ),
        (
            {
                "name": "www",
                "record_type": "A",
                "values": [{"value": "192.0.2.1"}],
                "comment": "x" * 1001,
            },
            {"comment": "Enter no more than 1000 characters."},
        ),
        (
            {},
            {
                "name": "Enter @ for the zone apex.",
                "record_type": "This field is required.",
                "values": "Add at least one value.",
            },
        ),
    ],
)
def test_invalid_records_are_rejected_without_writes(
    auth_client: TestClient, zone: dict, db: Session, payload: dict, expected: dict
) -> None:
    before = _rows(db)
    error = assert_error(
        auth_client.post(records_url(zone["zone_id"]), json=payload), 422, "VALIDATION_ERROR"
    )
    assert details_by_field(error) == expected
    assert _rows(db) == before


def test_all_errors_are_reported_together(auth_client: TestClient, zone: dict) -> None:
    response = auth_client.post(
        records_url(zone["zone_id"]),
        json={
            "name": "bad name",
            "record_type": "MX",
            "ttl_seconds": -1,
            "values": [{"priority": "1", "exchange": "mail.example.com"}, {"exchange": "x"}],
        },
    )
    error = assert_error(response, 422, "VALIDATION_ERROR")
    assert set(details_by_field(error)) == {
        "name",
        "ttl_seconds",
        "values.0.priority",
        "values.1.priority",
        "values.1.exchange",
    }


def test_unknown_top_level_field_is_rejected(auth_client: TestClient, zone: dict) -> None:
    response = auth_client.post(
        records_url(zone["zone_id"]),
        json={
            "name": "www",
            "record_type": "A",
            "values": [{"value": "192.0.2.1"}],
            "is_system": True,
        },
    )
    error = assert_error(response, 422, "VALIDATION_ERROR")
    assert details_by_field(error) == {"is_system": "This field is not allowed."}


def test_invalid_patch_changes_nothing(auth_client: TestClient, zone: dict) -> None:
    record = create_record(
        auth_client, zone["zone_id"], name="www", record_type="A", values=[{"value": "192.0.2.10"}]
    )
    url = records_url(zone["zone_id"], record["id"])
    error = assert_error(
        auth_client.patch(url, json={"ttl_seconds": -1, "values": [{"value": "bad"}]}),
        422,
        "VALIDATION_ERROR",
    )
    assert set(details_by_field(error)) == {"ttl_seconds", "values.0.value"}
    assert auth_client.get(url).json() == record


# --- Conflicts ----------------------------------------------------------------------------------


def test_duplicate_record_set_conflicts(auth_client: TestClient, zone: dict, db: Session) -> None:
    create_record(
        auth_client, zone["zone_id"], name="www", record_type="A", values=[{"value": "192.0.2.10"}]
    )
    before = _rows(db)
    response = auth_client.post(
        records_url(zone["zone_id"]),
        json={"name": "WWW.example.com.", "record_type": "A", "values": [{"value": "192.0.2.11"}]},
    )
    error = assert_error(response, 409, "RECORD_CONFLICT")
    assert error["message"] == "A record set with this name and type already exists."
    assert _rows(db) == before


def test_user_ns_at_apex_conflicts_with_system_ns(auth_client: TestClient, zone: dict) -> None:
    response = auth_client.post(
        records_url(zone["zone_id"]),
        json={"name": "@", "record_type": "NS", "values": [{"value": "ns1.example.net"}]},
    )
    assert_error(response, 409, "RECORD_CONFLICT")


def test_cname_coexistence_conflicts_both_directions(auth_client: TestClient, zone: dict) -> None:
    zone_id = zone["zone_id"]
    create_record(
        auth_client, zone_id, name="www", record_type="A", values=[{"value": "192.0.2.10"}]
    )
    error = assert_error(
        auth_client.post(
            records_url(zone_id),
            json={"name": "www", "record_type": "CNAME", "values": [{"value": "app.example.net"}]},
        ),
        409,
        "RECORD_CONFLICT",
    )
    assert "found: A" in error["message"]

    create_record(
        auth_client, zone_id, name="app", record_type="CNAME", values=[{"value": "www.example.net"}]
    )
    error = assert_error(
        auth_client.post(
            records_url(zone_id),
            json={"name": "app", "record_type": "TXT", "values": [{"value": "hello"}]},
        ),
        409,
        "RECORD_CONFLICT",
    )
    assert "already has a CNAME record" in error["message"]


def test_update_conflicts_exclude_the_record_itself(auth_client: TestClient, zone: dict) -> None:
    zone_id = zone["zone_id"]
    first = create_record(
        auth_client, zone_id, name="a", record_type="A", values=[{"value": "192.0.2.1"}]
    )
    second = create_record(
        auth_client, zone_id, name="b", record_type="A", values=[{"value": "192.0.2.2"}]
    )

    same = auth_client.patch(records_url(zone_id, first["id"]), json={"name": "a"})
    assert same.status_code == 200
    assert_error(
        auth_client.patch(records_url(zone_id, second["id"]), json={"name": "a"}),
        409,
        "RECORD_CONFLICT",
    )


def test_database_unique_index_race_becomes_conflict(
    auth_client: TestClient, zone: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services import record_service

    create_record(
        auth_client, zone["zone_id"], name="www", record_type="A", values=[{"value": "192.0.2.10"}]
    )
    # Simulate a concurrent writer: skip the service-level check so the unique index fires.
    monkeypatch.setattr(record_service, "_check_conflicts", lambda *args, **kwargs: None)
    response = auth_client.post(
        records_url(zone["zone_id"]),
        json={"name": "www", "record_type": "A", "values": [{"value": "192.0.2.11"}]},
    )
    assert_error(response, 409, "RECORD_CONFLICT")


# --- System records -----------------------------------------------------------------------------


@pytest.mark.parametrize("record_type", ["NS", "SOA"])
def test_system_records_are_protected(
    auth_client: TestClient, zone: dict, db: Session, record_type: str
) -> None:
    system = _system(auth_client, zone["zone_id"], record_type)
    url = records_url(zone["zone_id"], system["id"])
    before = _rows(db)

    assert auth_client.get(url).json() == system
    assert_error(auth_client.patch(url, json={"ttl_seconds": 60}), 409, "SYSTEM_RECORD_PROTECTED")
    assert_error(auth_client.delete(url), 409, "SYSTEM_RECORD_PROTECTED")
    assert auth_client.get(url).json() == system
    assert _rows(db) == before


# --- Scoping ------------------------------------------------------------------------------------


def test_record_from_another_zone_is_not_found(auth_client: TestClient, zone: dict) -> None:
    other_zone = create_zone(auth_client, "example.net")
    record = create_record(
        auth_client, zone["zone_id"], name="www", record_type="A", values=[{"value": "192.0.2.10"}]
    )
    wrong = records_url(other_zone["zone_id"], record["id"])

    assert_error(auth_client.get(wrong), 404, "NOT_FOUND")
    assert_error(auth_client.patch(wrong, json={"ttl_seconds": 1}), 404, "NOT_FOUND")
    assert_error(auth_client.delete(wrong), 404, "NOT_FOUND")
    assert auth_client.get(records_url(zone["zone_id"], record["id"])).json() == record


def test_other_users_records_are_not_found(
    auth_client: TestClient, other_client: TestClient, zone: dict
) -> None:
    record = create_record(
        auth_client, zone["zone_id"], name="www", record_type="A", values=[{"value": "192.0.2.10"}]
    )
    url = records_url(zone["zone_id"], record["id"])

    assert_error(other_client.get(records_url(zone["zone_id"])), 404, "NOT_FOUND")
    assert_error(
        other_client.post(
            records_url(zone["zone_id"]),
            json={"name": "x", "record_type": "A", "values": [{"value": "192.0.2.1"}]},
        ),
        404,
        "NOT_FOUND",
    )
    assert_error(other_client.get(url), 404, "NOT_FOUND")
    assert_error(other_client.patch(url, json={"ttl_seconds": 1}), 404, "NOT_FOUND")
    assert_error(other_client.delete(url), 404, "NOT_FOUND")
    assert auth_client.get(url).json() == record


# --- List: search, filters, sort, pagination ---------------------------------------------------


@pytest.fixture
def populated(auth_client: TestClient, zone: dict) -> str:
    zone_id = zone["zone_id"]
    create_record(
        auth_client,
        zone_id,
        name="www",
        record_type="A",
        ttl_seconds=60,
        values=[{"value": "192.0.2.10"}, {"value": "192.0.2.11"}],
    )
    create_record(
        auth_client,
        zone_id,
        name="@",
        record_type="CAA",
        ttl_seconds=3600,
        values=[{"flags": 0, "tag": "issue", "value": "letsencrypt.org"}],
    )
    create_record(
        auth_client,
        zone_id,
        name="@",
        record_type="MX",
        ttl_seconds=300,
        values=[{"priority": 10, "exchange": "mail.example.com"}],
    )
    create_record(
        auth_client,
        zone_id,
        name="_sip._tcp",
        record_type="SRV",
        ttl_seconds=0,
        values=[{"priority": 10, "weight": 5, "port": 5060, "target": "sip.example.com"}],
    )
    return zone_id


def _names_types(client: TestClient, zone_id: str, **params) -> list[tuple[str, str]]:
    response = client.get(records_url(zone_id), params=params)
    assert response.status_code == 200, response.text
    return [(item["name"], item["record_type"]) for item in response.json()["items"]]


def test_search_matches_name_type_and_value(auth_client: TestClient, populated: str) -> None:
    assert _names_types(auth_client, populated, q="192.0.2.11") == [("www.example.com", "A")]
    assert _names_types(auth_client, populated, q="LetsEncrypt") == [("example.com", "CAA")]
    assert _names_types(auth_client, populated, q=" www ") == [("www.example.com", "A")]
    assert _names_types(auth_client, populated, q="mx") == [("example.com", "MX")]
    assert _names_types(auth_client, populated, q="_sip") == [("_sip._tcp.example.com", "SRV")]
    assert _names_types(auth_client, populated, q="awsdns-hostmaster") == [("example.com", "SOA")]
    assert _names_types(auth_client, populated, q="%") == []


def test_filters(auth_client: TestClient, populated: str) -> None:
    assert _names_types(auth_client, populated, record_type="SOA") == [("example.com", "SOA")]
    assert _names_types(auth_client, populated, record_type="A") == [("www.example.com", "A")]
    assert len(_names_types(auth_client, populated, routing_policy="SIMPLE")) == 6
    for params, field in (
        ({"record_type": "ALIAS"}, "record_type"),
        ({"routing_policy": "WEIGHTED"}, "routing_policy"),
        ({"sort_by": "value"}, "sort_by"),
    ):
        error = assert_error(
            auth_client.get(records_url(populated), params=params), 422, "VALIDATION_ERROR"
        )
        assert [d["field"] for d in error["details"]] == [field]


def test_sorting(auth_client: TestClient, populated: str) -> None:
    by_name = _names_types(auth_client, populated)
    # Name ascending; ties at the apex break by record type.
    assert by_name == [
        ("_sip._tcp.example.com", "SRV"),
        ("example.com", "CAA"),
        ("example.com", "MX"),
        ("example.com", "NS"),
        ("example.com", "SOA"),
        ("www.example.com", "A"),
    ]
    assert _names_types(auth_client, populated, sort_order="desc") == list(reversed(by_name))

    ttl = auth_client.get(records_url(populated), params={"sort_by": "ttl_seconds"}).json()["items"]
    assert [item["ttl_seconds"] for item in ttl] == [0, 60, 300, 900, 3600, 172800]
    by_type = _names_types(auth_client, populated, sort_by="record_type", sort_order="desc")
    assert [record_type for _, record_type in by_type] == ["SRV", "SOA", "NS", "MX", "CAA", "A"]
    updated = _names_types(auth_client, populated, sort_by="updated_at", sort_order="desc")
    assert updated[0] == ("_sip._tcp.example.com", "SRV")


def test_pagination_with_25_records(auth_client: TestClient, zone: dict) -> None:
    for n in range(1, 24):  # 23 user records + NS + SOA = 25
        create_record(
            auth_client,
            zone["zone_id"],
            name=f"host-{n:02d}",
            record_type="A",
            values=[{"value": f"198.51.100.{n}"}],
        )
    url = records_url(zone["zone_id"])

    first = auth_client.get(url, params={"page_size": 10}).json()
    assert (first["total_items"], first["total_pages"], len(first["items"])) == (25, 3, 10)
    last = auth_client.get(url, params={"page_size": 10, "page": 3}).json()
    assert len(last["items"]) == 5
    beyond = auth_client.get(url, params={"page_size": 10, "page": 4}).json()
    assert beyond["items"] == [] and beyond["total_items"] == 25

    seen = []
    for page in (1, 2, 3):
        seen += [
            item["id"]
            for item in auth_client.get(url, params={"page_size": 10, "page": page}).json()["items"]
        ]
    assert len(seen) == len(set(seen)) == 25


def test_listing_records_has_no_n_plus_one(app, auth_client: TestClient, zone: dict) -> None:
    from sqlalchemy import event

    statements: list[str] = []

    def count(*_args) -> None:
        statements.append("q")

    def queries_for_list() -> int:
        statements.clear()
        event.listen(app.state.engine, "before_cursor_execute", count)
        try:
            assert (
                auth_client.get(records_url(zone["zone_id"]), params={"page_size": 100}).status_code
                == 200
            )
        finally:
            event.remove(app.state.engine, "before_cursor_execute", count)
        return len(statements)

    create_record(
        auth_client, zone["zone_id"], name="h0", record_type="A", values=[{"value": "192.0.2.1"}]
    )
    few = queries_for_list()
    for n in range(1, 18):
        create_record(
            auth_client,
            zone["zone_id"],
            name=f"h{n}",
            record_type="A",
            values=[{"value": "192.0.2.1"}, {"value": "192.0.2.2"}],
        )
    many = queries_for_list()
    assert few == many
