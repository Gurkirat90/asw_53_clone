from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import ListQuery
from app.services.dns_validation import DEFAULT_TTL_SECONDS

UserRecordType = Literal["A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA"]
RecordTypeFilter = Literal["A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA", "SOA"]
RecordSortBy = Literal["name", "record_type", "ttl_seconds", "updated_at"]

_RECORD_EXAMPLES = {
    "A": {
        "name": "www",
        "record_type": "A",
        "ttl_seconds": 300,
        "values": [{"value": "192.0.2.10"}, {"value": "192.0.2.11"}],
        "comment": "Demo web endpoint",
    },
    "MX": {
        "name": "@",
        "record_type": "MX",
        "ttl_seconds": 300,
        "values": [{"priority": 10, "exchange": "mail.example.com"}],
    },
    "SRV": {
        "name": "_sip._tcp",
        "record_type": "SRV",
        "ttl_seconds": 300,
        "values": [{"priority": 10, "weight": 5, "port": 5060, "target": "sip.example.com"}],
    },
    "CAA": {
        "name": "@",
        "record_type": "CAA",
        "ttl_seconds": 300,
        "values": [{"flags": 0, "tag": "issue", "value": "letsencrypt.org"}],
    },
}
RECORD_OPENAPI_EXAMPLES = {
    key: {"summary": f"{key} record", "value": value} for key, value in _RECORD_EXAMPLES.items()
}


class RecordListQuery(ListQuery):
    record_type: RecordTypeFilter | None = None
    routing_policy: Literal["SIMPLE"] | None = None
    sort_by: RecordSortBy = "name"


class _RecordInput(BaseModel):
    """Fields are loosely typed on purpose: dns_validation checks them all together so a single
    422 lists every problem (including per-value paths such as values.1.priority)."""

    model_config = ConfigDict(extra="forbid")

    name: Any = Field(default=None, description='"@", a relative name, or an FQDN in the zone.')
    record_type: Any = Field(default=None, description="A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, CAA")
    routing_policy: Any = Field(default="SIMPLE", description="Only SIMPLE is supported.")
    ttl_seconds: Any = Field(default=DEFAULT_TTL_SECONDS, description="Integer 0..2147483647.")
    values: Any = Field(default=None, description="1-100 typed value objects, in order.")
    comment: Any = Field(default=None, description="Optional, at most 1000 characters.")


class RecordCreate(_RecordInput):
    pass


class RecordUpdate(_RecordInput):
    """All fields optional; omitted fields keep their current values."""


class SingleValue(BaseModel):
    model_config = ConfigDict(extra="forbid")
    value: str


class MxValue(BaseModel):
    model_config = ConfigDict(extra="forbid")
    priority: int
    exchange: str


class SrvValue(BaseModel):
    model_config = ConfigDict(extra="forbid")
    priority: int
    weight: int
    port: int
    target: str


class CaaValue(BaseModel):
    model_config = ConfigDict(extra="forbid")
    flags: int
    tag: Literal["issue", "issuewild", "iodef"]
    value: str


class SoaValue(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mname: str
    rname: str
    serial: int
    refresh: int
    retry: int
    expire: int
    minimum: int


RecordValueOut = SingleValue | MxValue | SrvValue | CaaValue | SoaValue


class DnsRecordOut(BaseModel):
    id: str
    zone_id: str
    name: str = Field(description="Canonical FQDN, lowercase, no trailing dot.")
    record_type: RecordTypeFilter
    routing_policy: Literal["SIMPLE"]
    ttl_seconds: int
    values: list[RecordValueOut]
    display_values: list[str]
    comment: str | None
    is_system: bool
    created_at: datetime
    updated_at: datetime
