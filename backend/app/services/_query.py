"""Small query helpers shared by list services."""

from __future__ import annotations

LIKE_ESCAPE = "\\"


def contains_pattern(text: str) -> str:
    """Lowercased LIKE pattern matching `text` literally anywhere (escapes \\, %, _)."""
    escaped = (
        text.lower()
        .replace(LIKE_ESCAPE, LIKE_ESCAPE * 2)
        .replace("%", f"{LIKE_ESCAPE}%")
        .replace("_", f"{LIKE_ESCAPE}_")
    )
    return f"%{escaped}%"
