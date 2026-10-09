from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import JSONText
from app.models._common import new_uuid

if TYPE_CHECKING:
    from app.models.dns_record import DnsRecord


class RecordValue(Base):
    """One ordered value of a record set. `display_value` is computed by the backend on write."""

    __tablename__ = "record_values"
    __table_args__ = (
        UniqueConstraint("record_id", "position"),
        CheckConstraint("position >= 0", name="position_non_negative"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    record_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("dns_records.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    value_json: Mapped[Any] = mapped_column(JSONText, nullable=False)
    display_value: Mapped[str] = mapped_column(Text, nullable=False)

    record: Mapped[DnsRecord] = relationship(back_populates="values")
