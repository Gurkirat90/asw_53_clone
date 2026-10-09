from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.json_schema import SkipJsonSchema

from app.schemas.common import ListQuery
from app.services.dns_validation import (
    COMMENT_MAX_LENGTH,
    DnsValueError,
    normalize_comment,
    normalize_zone_name,
)

ZoneType = Literal["PUBLIC", "PRIVATE"]
ZoneSortBy = Literal["name", "zone_type", "created_at", "updated_at"]
IMMUTABLE_MESSAGE = "Domain name and type cannot be changed after creation."


def _comment(value: Any) -> str | None:
    try:
        return normalize_comment(value)
    except DnsValueError as exc:
        raise ValueError(exc.message) from exc


class ZoneListQuery(ListQuery):
    zone_type: ZoneType | None = None
    sort_by: ZoneSortBy = "name"


class ZoneCreate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [{"name": "example.com", "zone_type": "PUBLIC", "comment": "Demo zone"}]
        },
    )

    name: str = Field(description="Domain name, e.g. example.com. Normalized to lowercase.")
    zone_type: ZoneType = "PUBLIC"
    comment: str | None = Field(default=None, description=f"At most {COMMENT_MAX_LENGTH} chars.")

    @field_validator("name")
    @classmethod
    def _normalize_name(cls, value: str) -> str:
        try:
            return normalize_zone_name(value)
        except DnsValueError as exc:
            raise ValueError(exc.message) from exc

    @field_validator("comment", mode="before")
    @classmethod
    def _normalize_comment(cls, value: Any) -> str | None:
        return _comment(value)


class ZoneUpdate(BaseModel):
    """Only the comment is editable. name/zone_type get an explanatory 422."""

    model_config = ConfigDict(
        extra="forbid", json_schema_extra={"examples": [{"comment": "Updated description"}]}
    )

    comment: str | None = Field(default=None, description=f"At most {COMMENT_MAX_LENGTH} chars.")
    name: SkipJsonSchema[Any] = Field(default=None, exclude=True)
    zone_type: SkipJsonSchema[Any] = Field(default=None, exclude=True)

    @field_validator("comment", mode="before")
    @classmethod
    def _normalize_comment(cls, value: Any) -> str | None:
        return _comment(value)

    @field_validator("name", "zone_type", mode="before")
    @classmethod
    def _immutable(cls, _value: Any) -> Any:
        raise ValueError(IMMUTABLE_MESSAGE)


class HostedZoneSummary(BaseModel):
    zone_id: str = Field(examples=["Z0ABCDEFGHIJKLMNOPQRS"])
    name: str
    zone_type: ZoneType
    comment: str | None
    record_count: int = Field(description="All records in the zone, including system NS/SOA.")
    created_at: datetime
    updated_at: datetime


class HostedZoneDetail(HostedZoneSummary):
    name_servers: list[str] = Field(
        description="Synthetic name servers from the system NS record (.invalid; not delegated)."
    )
