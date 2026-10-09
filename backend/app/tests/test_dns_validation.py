import re

import pytest

from app.services import dns_validation as dv
from app.services.hosted_zone_service import generate_zone_id


@pytest.mark.parametrize(
    ("record_type", "value", "expected"),
    [
        ("A", {"value": "192.0.2.10"}, "192.0.2.10"),
        ("AAAA", {"value": "2001:db8::10"}, "2001:db8::10"),
        ("CNAME", {"value": "app.example.net"}, "app.example.net"),
        ("NS", {"value": "ns1.example.net"}, "ns1.example.net"),
        ("PTR", {"value": "host.example.net"}, "host.example.net"),
        ("TXT", {"value": "v=spf1 -all"}, '"v=spf1 -all"'),
        ("TXT", {"value": 'a "quoted" \\ value'}, '"a \\"quoted\\" \\\\ value"'),
        ("MX", {"priority": 10, "exchange": "mail.example.net"}, "10 mail.example.net"),
        (
            "SRV",
            {"priority": 10, "weight": 5, "port": 443, "target": "service.example.net"},
            "10 5 443 service.example.net",
        ),
        (
            "CAA",
            {"flags": 0, "tag": "issue", "value": "letsencrypt.org"},
            '0 issue "letsencrypt.org"',
        ),
        (
            "SOA",
            {
                "mname": "ns-1.awsdns-00.invalid",
                "rname": "awsdns-hostmaster.invalid",
                "serial": 1,
                "refresh": 7200,
                "retry": 900,
                "expire": 1209600,
                "minimum": 86400,
            },
            "ns-1.awsdns-00.invalid awsdns-hostmaster.invalid 1 7200 900 1209600 86400",
        ),
    ],
)
def test_display_formatter(record_type: str, value: dict, expected: str) -> None:
    assert dv.format_display_value(record_type, value) == expected


def test_zone_id_format() -> None:
    ids = {generate_zone_id() for _ in range(200)}
    assert len(ids) == 200
    assert all(re.fullmatch(r"Z[A-Z0-9]{20}", zone_id) for zone_id in ids)


@pytest.mark.parametrize(
    ("raw", "zone", "expected"),
    [
        ("@", "example.com", "example.com"),
        ("  WWW  ", "example.com", "www.example.com"),
        ("www.example.com.", "example.com", "www.example.com"),
        ("example.com", "example.com", "example.com"),
        ("www.other.com", "example.com", "www.other.com.example.com"),
        ("*", "example.com", "*.example.com"),
        ("_dmarc", "example.com", "_dmarc.example.com"),
        ("www", "sub.example.com", "www.sub.example.com"),
    ],
)
def test_record_name_canonicalization(raw: str, zone: str, expected: str) -> None:
    assert dv.canonicalize_record_name(raw, zone) == expected


@pytest.mark.parametrize(
    ("raw", "message"),
    [
        ("", "Enter @ for the zone apex."),
        ("www.other.com.", "Record name must be within example.com."),
        ("example.org.", "Record name must be within example.com."),
    ],
)
def test_record_name_errors(raw: str, message: str) -> None:
    with pytest.raises(dv.DnsValueError) as excinfo:
        dv.canonicalize_record_name(raw, "example.com")
    assert excinfo.value.message == message


def test_validate_record_collects_every_error() -> None:
    with pytest.raises(dv.DnsFieldErrors) as excinfo:
        dv.validate_record(
            "example.com",
            name="bad name",
            record_type="A",
            routing_policy="WEIGHTED",
            ttl_seconds=-5,
            values=[{"value": "192.0.2.1"}, {"value": "999.0.0.1"}, {"value": "192.0.2.1"}, "x"],
            comment="c" * 1001,
        )
    fields = [detail["field"] for detail in excinfo.value.details]
    assert fields == [
        "name",
        "routing_policy",
        "ttl_seconds",
        "comment",
        "values.1.value",
        "values.2",
        "values.3",
    ]


def test_validate_record_rejects_soa_and_unknown_value_keys() -> None:
    with pytest.raises(dv.DnsFieldErrors) as excinfo:
        dv.validate_record(
            "example.com",
            name="@",
            record_type="SOA",
            routing_policy="SIMPLE",
            ttl_seconds=300,
            values=[{}],
            comment=None,
        )
    assert excinfo.value.details == [
        {"field": "record_type", "message": "SOA records are managed by the system."}
    ]

    with pytest.raises(dv.DnsFieldErrors) as excinfo:
        dv.validate_record(
            "example.com",
            name="mx",
            record_type="MX",
            routing_policy="SIMPLE",
            ttl_seconds=300,
            values=[{"priority": 1, "exchange": "mail.example.com", "x": 1}],
            comment=None,
        )
    assert excinfo.value.details[0]["field"] == "values.0"


def test_validate_record_normalizes_and_formats() -> None:
    record = dv.validate_record(
        "example.com",
        name="Mail",
        record_type="MX",
        routing_policy="SIMPLE",
        ttl_seconds=0,
        values=[{"priority": 10, "exchange": "MAIL.example.net."}],
        comment="  note  ",
    )
    assert record.name == "mail.example.com"
    assert record.values == [{"priority": 10, "exchange": "mail.example.net"}]
    assert record.display_values == ["10 mail.example.net"]
    assert record.comment == "note"
    assert record.ttl_seconds == 0
