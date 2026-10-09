"""Logging configuration driven by LOG_LEVEL, with the current request ID on every line."""

from __future__ import annotations

import logging
from contextvars import ContextVar

LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s [%(request_id)s] %(message)s"

# Set by RequestIdMiddleware for the duration of each HTTP request.
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)


def get_request_id() -> str | None:
    return request_id_var.get()


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get() or "-"
        return True


def configure_logging(level: str) -> None:
    logging.basicConfig(level=level.upper(), format=LOG_FORMAT, force=True)
    for handler in logging.getLogger().handlers:
        handler.addFilter(RequestIdFilter())
