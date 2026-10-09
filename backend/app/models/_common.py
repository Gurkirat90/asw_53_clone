"""Shared column helpers for ORM models."""

from __future__ import annotations

import uuid


def new_uuid() -> str:
    return str(uuid.uuid4())


def sql_in_list(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{value}'" for value in values)
