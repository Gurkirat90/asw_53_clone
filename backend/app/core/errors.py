"""Application errors and the handlers that render every error in the D9 envelope:

{"error": {"code", "message", "details": [{"field", "message"}], "request_id"}}
"""

from __future__ import annotations

import logging
from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import get_request_id

logger = logging.getLogger(__name__)

INTERNAL_ERROR_MESSAGE = "An unexpected error occurred. Try again later."
VALIDATION_MESSAGE = "The request contains invalid fields."


class AppError(Exception):
    status_code: int = 400
    code: str = "BAD_REQUEST"
    message: str = "The request could not be processed."

    def __init__(
        self,
        message: str | None = None,
        details: Iterable[Mapping[str, str]] | None = None,
        *,
        status_code: int | None = None,
        code: str | None = None,
    ) -> None:
        self.message = message or self.message
        self.details = [dict(detail) for detail in details or []]
        if status_code is not None:
            self.status_code = status_code
        if code is not None:
            self.code = code
        super().__init__(self.message)


class ValidationFailed(AppError):
    status_code = 422
    code = "VALIDATION_ERROR"
    message = VALIDATION_MESSAGE


class BadRequest(AppError):
    status_code = 400
    code = "BAD_REQUEST"
    message = "The request could not be processed."


class AuthenticationFailed(AppError):
    status_code = 401
    code = "AUTHENTICATION_FAILED"
    message = "Sign-in failed. Check your credentials."


class Unauthenticated(AppError):
    status_code = 401
    code = "UNAUTHENTICATED"
    message = "Your session has expired or is not valid. Sign in again."


class Forbidden(AppError):
    status_code = 403
    code = "FORBIDDEN"
    message = "You do not have permission to perform this action."


class NotFound(AppError):
    status_code = 404
    code = "NOT_FOUND"
    message = "The requested resource was not found."


class RecordConflict(AppError):
    status_code = 409
    code = "RECORD_CONFLICT"
    message = "The change conflicts with an existing record."


class SystemRecordProtected(AppError):
    status_code = 409
    code = "SYSTEM_RECORD_PROTECTED"
    message = "System records are managed automatically and cannot be changed or deleted."


def error_body(
    code: str, message: str, details: Sequence[Mapping[str, str]] | None = None
) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": [dict(detail) for detail in details or []],
            "request_id": get_request_id(),
        }
    }


def error_response(
    status_code: int,
    code: str,
    message: str,
    details: Sequence[Mapping[str, str]] | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=error_body(code, message, details),
        headers=dict(headers) if headers else None,
    )


# --- Pydantic validation errors -> field details ------------------------------------------------

_LOCATION_PREFIXES = {"body", "query", "path", "header", "cookie"}


def field_path(loc: Sequence[int | str]) -> str:
    """("body", "values", 0, "value") -> "values.0.value"; ("query", "page") -> "page"."""
    parts = list(loc)
    if parts and parts[0] in _LOCATION_PREFIXES:
        prefix = parts.pop(0)
        if not parts:
            return str(prefix)
    return ".".join(str(part) for part in parts)


def _sentence(text: str) -> str:
    text = text.strip()
    if not text:
        return "This value is not valid."
    text = text[0].upper() + text[1:]
    return text if text.endswith((".", "?", "!")) else f"{text}."


def humanize_validation_error(error: Mapping[str, Any]) -> str:
    error_type = str(error.get("type", ""))
    ctx: Mapping[str, Any] = error.get("ctx") or {}
    msg = str(error.get("msg", ""))

    if error_type == "missing":
        return "This field is required."
    if error_type == "string_too_short":
        min_length = ctx.get("min_length", 1)
        if min_length == 1:
            return "This field is required."
        return f"Enter at least {min_length} characters."
    if error_type == "string_too_long":
        return f"Enter no more than {ctx.get('max_length')} characters."
    if error_type in {"string_type", "string_unicode"}:
        return "Enter a text value."
    if error_type in {"int_type", "int_parsing", "int_from_float"}:
        return "Enter a whole number."
    if error_type in {"bool_type", "bool_parsing"}:
        return "Enter true or false."
    if error_type == "greater_than_equal":
        return f"Enter a value of at least {ctx.get('ge')}."
    if error_type == "greater_than":
        return f"Enter a value greater than {ctx.get('gt')}."
    if error_type == "less_than_equal":
        return f"Enter a value of at most {ctx.get('le')}."
    if error_type == "less_than":
        return f"Enter a value less than {ctx.get('lt')}."
    if error_type in {"literal_error", "enum"}:
        return f"Choose one of: {ctx.get('expected', 'the allowed values')}."
    if error_type == "json_invalid":
        return "The request body is not valid JSON."
    if error_type in {"model_type", "model_attributes_type", "dict_type"}:
        return "Send a JSON object."
    if error_type == "list_type":
        return "Send a list."
    if error_type == "extra_forbidden":
        return "This field is not allowed."
    if error_type == "value_error" and msg.startswith("Value error, "):
        return _sentence(msg.removeprefix("Value error, "))
    return _sentence(msg)


def validation_details(errors: Iterable[Mapping[str, Any]]) -> list[dict[str, str]]:
    return [
        {"field": field_path(error.get("loc", ())), "message": humanize_validation_error(error)}
        for error in errors
    ]


# --- Handlers -----------------------------------------------------------------------------------


async def _app_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    return error_response(exc.status_code, exc.code, exc.message, exc.details)


async def _request_validation_handler(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    return error_response(
        422, "VALIDATION_ERROR", VALIDATION_MESSAGE, validation_details(exc.errors())
    )


_HTTP_MESSAGES = {
    404: "The requested resource was not found.",
    405: "This HTTP method is not allowed for this resource.",
}


async def _http_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    status_code = exc.status_code
    code = "NOT_FOUND" if status_code == 404 else "BAD_REQUEST"
    detail = exc.detail if isinstance(exc.detail, str) else None
    message = _HTTP_MESSAGES.get(status_code) or (
        detail if detail else "The request could not be processed."
    )
    return error_response(status_code, code, message, headers=exc.headers)


def register_exception_handlers(app: FastAPI) -> None:
    """Unhandled exceptions are rendered by RequestIdMiddleware (it wraps the whole stack)."""
    app.add_exception_handler(AppError, _app_error_handler)
    app.add_exception_handler(RequestValidationError, _request_validation_handler)
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)
