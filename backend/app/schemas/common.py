from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

SortOrder = Literal["asc", "desc"]


class Page[T](BaseModel):
    """List envelope. total_pages is 0 when there are no items."""

    items: list[T]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class ListQuery(BaseModel):
    """Shared list query parameters (validated; errors use the parameter name as field)."""

    q: str | None = Field(default=None, max_length=255, description="Case-insensitive substring.")
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    sort_order: SortOrder = "asc"

    @field_validator("q")
    @classmethod
    def _trim_query(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


def total_pages(total_items: int, page_size: int) -> int:
    return (total_items + page_size - 1) // page_size
