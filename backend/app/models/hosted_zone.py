from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow
from app.models._common import new_uuid, sql_in_list

if TYPE_CHECKING:
    from app.models.dns_record import DnsRecord
    from app.models.user import User

ZONE_TYPES: tuple[str, ...] = ("PUBLIC", "PRIVATE")
COMMENT_MAX_LENGTH = 1000


class HostedZone(Base):
    """A hosted zone. `zone_id` is the public identifier; `id` is internal and never exposed.

    Zone names are deliberately NOT unique: separate zones may share a name (PRD D-004).
    """

    __tablename__ = "hosted_zones"
    __table_args__ = (
        CheckConstraint(f"zone_type IN ({sql_in_list(ZONE_TYPES)})", name="zone_type"),
        CheckConstraint(
            f"comment IS NULL OR length(comment) <= {COMMENT_MAX_LENGTH}", name="comment_length"
        ),
        Index("ix_hosted_zones_user_id_name", "user_id", "name"),
        Index("ix_hosted_zones_user_id_created_at", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    zone_id: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(253), nullable=False)
    zone_type: Mapped[str] = mapped_column(String(16), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utcnow, onupdate=utcnow
    )

    user: Mapped[User] = relationship(back_populates="hosted_zones")
    records: Mapped[list[DnsRecord]] = relationship(
        back_populates="hosted_zone", cascade="all, delete-orphan", passive_deletes=True
    )
