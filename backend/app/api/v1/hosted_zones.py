"""Hosted zone routes. Business rules live in hosted_zone_service."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Query, Response, status

from app.api.deps import CurrentUser, DbSession
from app.models import HostedZone
from app.schemas.common import Page, total_pages
from app.schemas.hosted_zones import (
    HostedZoneDetail,
    HostedZoneSummary,
    ZoneCreate,
    ZoneListQuery,
    ZoneUpdate,
)
from app.services import hosted_zone_service

router = APIRouter(prefix="/hosted-zones", tags=["hosted zones"])


def _summary(zone: HostedZone, record_count: int) -> HostedZoneSummary:
    return HostedZoneSummary(
        zone_id=zone.zone_id,
        name=zone.name,
        zone_type=zone.zone_type,  # type: ignore[arg-type]
        comment=zone.comment,
        record_count=record_count,
        created_at=zone.created_at,
        updated_at=zone.updated_at,
    )


def _detail(db: DbSession, zone: HostedZone) -> HostedZoneDetail:
    summary = _summary(zone, hosted_zone_service.count_records(db, zone))
    return HostedZoneDetail(
        **summary.model_dump(), name_servers=hosted_zone_service.name_servers(db, zone)
    )


@router.get("", response_model=Page[HostedZoneSummary], summary="List hosted zones")
def list_hosted_zones(
    user: CurrentUser, db: DbSession, query: Annotated[ZoneListQuery, Query()]
) -> Page[HostedZoneSummary]:
    rows, total = hosted_zone_service.list_zones(db, user, query)
    return Page[HostedZoneSummary](
        items=[_summary(row.zone, row.record_count) for row in rows],
        page=query.page,
        page_size=query.page_size,
        total_items=total,
        total_pages=total_pages(total, query.page_size),
    )


@router.post(
    "",
    response_model=HostedZoneDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Create a hosted zone (with system NS and SOA records)",
)
def create_hosted_zone(user: CurrentUser, db: DbSession, data: ZoneCreate) -> HostedZoneDetail:
    zone = hosted_zone_service.create_zone(db, user, data)
    return _detail(db, zone)


@router.get("/{zone_id}", response_model=HostedZoneDetail, summary="Get a hosted zone")
def get_hosted_zone(zone_id: str, user: CurrentUser, db: DbSession) -> HostedZoneDetail:
    return _detail(db, hosted_zone_service.get_zone(db, user, zone_id))


@router.patch("/{zone_id}", response_model=HostedZoneDetail, summary="Edit a hosted zone's comment")
def update_hosted_zone(
    zone_id: str,
    user: CurrentUser,
    db: DbSession,
    data: Annotated[ZoneUpdate, Body(examples=[{"comment": "Updated description"}])],
) -> HostedZoneDetail:
    zone = hosted_zone_service.get_zone(db, user, zone_id)
    return _detail(db, hosted_zone_service.update_zone(db, zone, data))


@router.delete(
    "/{zone_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete a hosted zone and all of its records",
)
def delete_hosted_zone(zone_id: str, user: CurrentUser, db: DbSession) -> Response:
    zone = hosted_zone_service.get_zone(db, user, zone_id)
    hosted_zone_service.delete_zone(db, zone)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
