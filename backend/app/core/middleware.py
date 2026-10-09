"""Pure ASGI middleware: request IDs + access logging + 500 envelope, and the Origin check.

These are plain ASGI classes (not BaseHTTPMiddleware) so the request-ID context variable is
visible to handlers and so unhandled errors still get the envelope and X-Request-ID header.
"""

from __future__ import annotations

import logging
import re
import secrets
import time
from collections.abc import Iterable

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import INTERNAL_ERROR_MESSAGE, error_response
from app.core.logging import request_id_var

REQUEST_ID_HEADER = "X-Request-ID"
_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

access_logger = logging.getLogger("app.request")
error_logger = logging.getLogger("app.errors")


def new_request_id() -> str:
    return f"req_{secrets.token_hex(8)}"


class RequestIdMiddleware:
    """Assigns a request ID, echoes it in X-Request-ID, logs one access line per request, and
    converts any unhandled exception into a 500 INTERNAL_ERROR envelope.

    Logs method, path, status, and duration only: never cookies, bodies, passwords, or tokens.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = Headers(scope=scope).get(REQUEST_ID_HEADER)
        request_id = (
            incoming if incoming and _REQUEST_ID_PATTERN.fullmatch(incoming) else new_request_id()
        )
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        status_code = 500
        response_started = False

        async def send_with_request_id(message: Message) -> None:
            nonlocal status_code, response_started
            if message["type"] == "http.response.start":
                response_started = True
                status_code = message["status"]
                MutableHeaders(scope=message)[REQUEST_ID_HEADER] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        except Exception:
            error_logger.exception("Unhandled error on %s %s", scope["method"], scope["path"])
            if response_started:
                raise
            response = error_response(500, "INTERNAL_ERROR", INTERNAL_ERROR_MESSAGE)
            await response(scope, receive, send_with_request_id)
        finally:
            duration_ms = (time.perf_counter() - started) * 1000
            access_logger.info(
                "%s %s -> %s (%.1f ms)", scope["method"], scope["path"], status_code, duration_ms
            )
            request_id_var.reset(token)


class OriginCheckMiddleware:
    """CSRF guard for cookie auth: an unsafe request whose Origin header is present and not
    trusted gets 403 FORBIDDEN. Requests without Origin (curl, tests, the same-origin Next.js
    server proxy) pass through."""

    def __init__(self, app: ASGIApp, trusted_origins: Iterable[str]) -> None:
        self.app = app
        self.trusted_origins = frozenset(origin.rstrip("/") for origin in trusted_origins)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["method"] in UNSAFE_METHODS:
            origin = Headers(scope=scope).get("origin")
            if origin is not None and origin.rstrip("/") not in self.trusted_origins:
                response = error_response(
                    403, "FORBIDDEN", "Requests from this origin are not allowed."
                )
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)
