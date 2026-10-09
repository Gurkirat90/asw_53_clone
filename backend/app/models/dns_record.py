from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow
from app.models._common import new_uuid, sql_in_list

if TYPE_CHECKING:
    from app.models.hosted_zone import HostedZone
    from app.models.record_value import RecordValue

USER_RECORD_TYPES: tuple[str, ...] = ("A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA")
# SOA exists only as a backend-created system record.
ALL_RECORD_TYPES: tuple[str, ...] = (*USER_RECORD_TYPES, "SOA")
ROUTING_POLICIES: tuple[str, ...] = ("SIMPLE",)
TTL_MAX = 2147483647
DEFAULT_TTL_SECONDS = 300
COMMENT_MAX_LENGTH = 1000


class DnsRecord(Base):
    """A record set: unique by (hosted_zone_id, name, record_type), values in record_values."""

    __tablename__ = "dns_records"
    __table_args__ = (
        UniqueConstraint("hosted_zone_id", "name", "record_type"),
        CheckConstraint(f"record_type IN ({sql_in_list(ALL_RECORD_TYPES)})", name="record_type"),
        CheckConstraint(
            f"routing_policy IN ({sql_in_list(ROUTING_POLICIES)})", name="routing_policy"
        ),
        CheckConstraint(
            f"ttl_seconds IS NULL OR (ttl_seconds >= 0 AND ttl_seconds <= {TTL_MAX})",
            name="ttl_range",
        ),
        CheckConstraint(
            f"comment IS NULL OR length(comment) <= {COMMENT_MAX_LENGTH}", name="comment_length"
        ),
        Index("ix_dns_records_hosted_zone_id_name", "hosted_zone_id", "name"),
        Index("ix_dns_records_hosted_zone_id_record_type", "hosted_zone_id", "record_type"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    hosted_zone_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("hosted_zones.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(253), nullable=False)
    record_type: Mapped[str] = mapped_column(String(8), nullable=False)
    routing_policy: Mapped[str] = mapped_column(
        String(16), nullable=False, default="SIMPLE", server_default=text("'SIMPLE'")
    )
    ttl_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("0")
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utcnow, onupdate=utcnow
    )

    hosted_zone: Mapped[HostedZone] = relationship(back_populates="records")
    values: Mapped[list[RecordValue]] = relationship(
        back_populates="record",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="RecordValue.position",
    )
