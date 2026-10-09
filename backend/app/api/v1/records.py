"""DNS record routes, nested under the owning hosted zone. Rules live in record_service."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Query, Response, status

from app.api.deps import CurrentUser, DbSession
from app.models import DnsRecord, HostedZone
from app.schemas.common import Page, total_pages
from app.schemas.records import (
    RECORD_OPENAPI_EXAMPLES,
    DnsRecordOut,
    RecordCreate,
    RecordListQuery,
    RecordUpdate,
)
from app.services import hosted_zone_service, record_service

router = APIRouter(prefix="/hosted-zones/{zone_id}/records", tags=["records"])


def record_out(zone: HostedZone, record: DnsRecord) -> DnsRecordOut:
    return DnsRecordOut.model_validate(
        {
            "id": record.id,
            "zone_id": zone.zone_id,
            "name": record.name,
            "record_type": record.record_type,
            "routing_policy": record.routing_policy,
            "ttl_seconds": record.ttl_seconds,
            "values": [value.value_json for value in record.values],
            "display_values": [value.display_value for value in record.values],
            "comment": record.comment,
            "is_system": record.is_system,
            "created_at": record.created_at,
            "updated_at": record.updated_at,
        }
    )


@router.get("", response_model=Page[DnsRecordOut], summary="List records in a hosted zone")
def list_records(
    zone_id: str, user: CurrentUser, db: DbSession, query: Annotated[RecordListQuery, Query()]
) -> Page[DnsRecordOut]:
    zone = hosted_zone_service.get_zone(db, user, zone_id)
    records, total = record_service.list_records(db, zone, query)
    return Page[DnsRecordOut](
        items=[record_out(zone, record) for record in records],
        page=query.page,
        page_size=query.page_size,
        total_items=total,
        total_pages=total_pages(total, query.page_size),
    )


@router.post(
    "",
    response_model=DnsRecordOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a record",
)
def create_record(
    zone_id: str,
    user: CurrentUser,
    db: DbSession,
    data: Annotated[RecordCreate, Body(openapi_examples=RECORD_OPENAPI_EXAMPLES)],
) -> DnsRecordOut:
    zone = hosted_zone_service.get_zone(db, user, zone_id)
    return record_out(zone, record_service.create_record(db, zone, data))


@router.get("/{record_id}", response_model=DnsRecordOut, summary="Get a record")
def get_record(zone_id: str, record_id: str, user: CurrentUser, db: DbSession) -> DnsRecordOut:
    zone = hosted_zone_service.get_zone(db, user, zone_id)
    return record_out(zone, record_service.get_record(db, zone, record_id))


@router.patch("/{record_id}", response_model=DnsRecordOut, summary="Edit a record in place")
def update_record(
    zone_id: str,
    record_id: str,
    user: CurrentUser,
    db: DbSession,
    data: Annotated[RecordUpdate, Body(openapi_examples=RECORD_OPENAPI_EXAMPLES)],
) -> DnsRecordOut:
    zone = hosted_zone_service.get_zone(db, user, zone_id)
    record = record_service.get_record(db, zone, record_id)
    return record_out(zone, record_service.update_record(db, zone, record, data))


@router.delete(
    "/{record_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete a record",
)
def delete_record(zone_id: str, record_id: str, user: CurrentUser, db: DbSession) -> Response:
    zone = hosted_zone_service.get_zone(db, user, zone_id)
    record = record_service.get_record(db, zone, record_id)
    record_service.delete_record(db, zone, record)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
