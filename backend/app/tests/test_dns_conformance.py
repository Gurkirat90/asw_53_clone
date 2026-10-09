"""Runs the cross-stack fixture shared/dns-validation-cases.json against dns_validation.

The frontend runs the same file, so both stacks accept and normalize input identically.
"""

import json
from collections.abc import Callable
from typing import Any

import pytest

from app.core.config import BACKEND_DIR
from app.services import dns_validation as dv

FIXTURE = BACKEND_DIR.parent / "shared" / "dns-validation-cases.json"
DATA = json.loads(FIXTURE.read_text(encoding="utf-8"))
CASES = DATA["cases"]

RUNNERS: dict[str, Callable[[dict[str, Any]], Any]] = {
    "zone_name": lambda case: dv.normalize_zone_name(case["input"]),
    "record_name": lambda case: dv.canonicalize_record_name(case["input"], case["zone"]),
    "hostname": lambda case: dv.normalize_hostname(case["input"]),
    "ipv4": lambda case: dv.normalize_ipv4(case["input"]),
    "ipv6": lambda case: dv.normalize_ipv6(case["input"]),
    "ttl": lambda case: dv.validate_ttl(case["input"]),
    "txt": lambda case: dv.normalize_txt(case["input"]),
    "mx": lambda case: dv.normalize_value("MX", case["input"]),
    "srv": lambda case: dv.normalize_value("SRV", case["input"]),
    "caa": lambda case: dv.normalize_value("CAA", case["input"]),
}


def test_fixture_shape() -> None:
    assert DATA["version"] == 1
    assert len(CASES) >= 80
    assert len({case["id"] for case in CASES}) == len(CASES)
    assert {case["kind"] for case in CASES} == set(RUNNERS)
    for case in CASES:
        assert ("expected" in case) == case["valid"], case["id"]
        assert (case["kind"] == "record_name") == ("zone" in case), case["id"]


@pytest.mark.parametrize("case", CASES, ids=[case["id"] for case in CASES])
def test_conformance_case(case: dict[str, Any]) -> None:
    run = RUNNERS[case["kind"]]
    if case["valid"]:
        assert run(case) == case["expected"]
    else:
        with pytest.raises(dv.DnsValueError):
            run(case)
