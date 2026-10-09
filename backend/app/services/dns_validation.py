"""The single authority for DNS name and value validation, normalization, and display formatting.

Pure functions with no database or FastAPI dependency. The same rules are exercised by the
cross-stack fixture shared/dns-validation-cases.json, which the frontend also runs.

Single-value helpers raise DnsValueError. Record-level validation collects every problem and
raises DnsFieldErrors, whose details use dot paths (name, ttl_seconds, values.1.priority, ...).
"""

from __future__ import annotations

import ipaddress
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

USER_RECORD_TYPES: tuple[str, ...] = ("A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA")
SYSTEM_ONLY_RECORD_TYPES: tuple[str, ...] = ("SOA",)
ROUTING_POLICIES: tuple[str, ...] = ("SIMPLE",)
CAA_TAGS: tuple[str, ...] = ("issue", "issuewild", "iodef")
CAA_IODEF_PREFIXES: tuple[str, ...] = ("mailto:", "http://", "https://")

TTL_MIN = 0
TTL_MAX = 2147483647
DEFAULT_TTL_SECONDS = 300
MAX_NAME_LENGTH = 253
MAX_LABEL_LENGTH = 63
MAX_VALUES = 100
TXT_MAX_LENGTH = 1024
CAA_VALUE_MAX_LENGTH = 255
COMMENT_MAX_LENGTH = 1000
UINT16_MAX = 65535
UINT8_MAX = 255

ZONE_NAME_MESSAGE = "Enter a valid domain name, such as example.com."
RECORD_NAME_MESSAGE = "Enter a valid record name, such as www or @ for the zone apex."
HOSTNAME_MESSAGE = "Enter a valid hostname, such as host.example.net."
REQUIRED_MESSAGE = "This field is required."

_ZONE_LABEL = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$")
# Record names and hostname targets also allow underscores (e.g. _sip._tcp, _dmarc).
_HOST_LABEL = re.compile(r"^[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?$")
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")
_CAA_PRINTABLE = re.compile(r"^[\x20-\x7e]+$")


class DnsValueError(ValueError):
    """A single value is invalid. `message` is user-facing."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class DnsFieldErrors(ValueError):
    """One or more field-level problems; rendered as a 422 VALIDATION_ERROR envelope."""

    def __init__(self, details: Sequence[Mapping[str, str]]) -> None:
        self.details = [dict(detail) for detail in details]
        super().__init__("; ".join(f"{d['field']}: {d['message']}" for d in self.details))


@dataclass
class FieldIssues:
    """Collects field errors so a single response can report all of them."""

    details: list[dict[str, str]] = field(default_factory=list)

    def add(self, field_path: str, message: str) -> None:
        self.details.append({"field": field_path, "message": message})

    def __bool__(self) -> bool:
        return bool(self.details)

    def raise_if_any(self) -> None:
        if self.details:
            raise DnsFieldErrors(self.details)


# --- Names -------------------------------------------------------------------------------------


def _has_forbidden_text(name: str) -> bool:
    return "://" in name or "/" in name or any(ch.isspace() for ch in name)


def normalize_zone_name(raw: object) -> str:
    """Trim, lowercase, strip one trailing dot, and validate a hosted-zone domain name."""
    if not isinstance(raw, str):
        raise DnsValueError(ZONE_NAME_MESSAGE)
    name = raw.strip().lower()
    if name.endswith("."):
        name = name[:-1]
    if not name or _has_forbidden_text(name) or len(name) > MAX_NAME_LENGTH:
        raise DnsValueError(ZONE_NAME_MESSAGE)
    labels = name.split(".")
    if len(labels) < 2 or any(not _ZONE_LABEL.match(label) for label in labels):
        raise DnsValueError(ZONE_NAME_MESSAGE)
    if labels[-1].isdigit():
        raise DnsValueError(ZONE_NAME_MESSAGE)
    return name


def _valid_host_labels(labels: Sequence[str], *, allow_wildcard: bool) -> bool:
    for index, label in enumerate(labels):
        if label == "*" and allow_wildcard and index == 0:
            continue
        if not _HOST_LABEL.match(label):
            return False
    return True


def canonicalize_record_name(raw: object, zone_name: str) -> str:
    """Return the canonical FQDN (lowercase, no trailing dot) of a record name inside a zone.

    "@" is the apex. A trailing dot marks an absolute name, which must lie within the zone.
    Without a trailing dot, a name equal to or ending with the zone is an FQDN; anything else
    is relative and gets ".<zone>" appended (as the Route 53 console joins prefix and zone).
    """
    if not isinstance(raw, str):
        raise DnsValueError(RECORD_NAME_MESSAGE)
    name = raw.strip().lower()
    if not name:
        raise DnsValueError("Enter @ for the zone apex.")
    if name == "@":
        return zone_name
    if _has_forbidden_text(name):
        raise DnsValueError(RECORD_NAME_MESSAGE)

    suffix = f".{zone_name}"
    if name.endswith("."):
        name = name[:-1]
        if name != zone_name and not name.endswith(suffix):
            raise DnsValueError(f"Record name must be within {zone_name}.")
        fqdn = name
    elif name == zone_name or name.endswith(suffix):
        fqdn = name
    else:
        fqdn = f"{name}{suffix}"

    if len(fqdn) > MAX_NAME_LENGTH:
        raise DnsValueError(f"Record names can be at most {MAX_NAME_LENGTH} characters.")
    if not _valid_host_labels(fqdn.split("."), allow_wildcard=True):
        raise DnsValueError(RECORD_NAME_MESSAGE)
    return fqdn


def normalize_hostname(raw: object, *, allow_root: bool = False) -> str:
    """Validate a hostname target (CNAME/NS/PTR value, MX exchange, SRV target).

    With allow_root, the single character "." (SRV "no service") is accepted and kept as ".".
    """
    if not isinstance(raw, str):
        raise DnsValueError(HOSTNAME_MESSAGE)
    name = raw.strip().lower()
    if allow_root and name == ".":
        return "."
    if name.endswith("."):
        name = name[:-1]
    if not name or _has_forbidden_text(name) or len(name) > MAX_NAME_LENGTH:
        raise DnsValueError(HOSTNAME_MESSAGE)
    labels = name.split(".")
    if len(labels) < 2 or not _valid_host_labels(labels, allow_wildcard=False):
        raise DnsValueError(HOSTNAME_MESSAGE)
    return name


# --- Scalars -----------------------------------------------------------------------------------


def normalize_ipv4(raw: object) -> str:
    message = "Enter a valid IPv4 address, such as 192.0.2.10."
    if not isinstance(raw, str):
        raise DnsValueError(message)
    text = raw.strip()
    try:
        # Rejects leading zeros, IPv6, prefixes, and ports.
        return str(ipaddress.IPv4Address(text))
    except ValueError as exc:
        raise DnsValueError(message) from exc


def normalize_ipv6(raw: object) -> str:
    message = "Enter a valid IPv6 address, such as 2001:db8::10."
    if not isinstance(raw, str):
        raise DnsValueError(message)
    text = raw.strip()
    if "%" in text or "." in text:
        # No zone IDs; no embedded dotted IPv4 (keeps the stored form unambiguous).
        raise DnsValueError(message)
    try:
        return ipaddress.IPv6Address(text).compressed
    except ValueError as exc:
        raise DnsValueError(message) from exc


def _strict_int(raw: object, minimum: int, maximum: int, message: str) -> int:
    # JSON integers only: bool is an int subclass in Python and is rejected explicitly.
    if type(raw) is not int or not minimum <= raw <= maximum:
        raise DnsValueError(message)
    return raw


def validate_ttl(raw: object) -> int:
    return _strict_int(
        raw, TTL_MIN, TTL_MAX, f"Enter a whole number of seconds from {TTL_MIN} to {TTL_MAX}."
    )


def normalize_txt(raw: object) -> str:
    if not isinstance(raw, str):
        raise DnsValueError("Enter the text value.")
    text = raw.strip()
    if not text:
        raise DnsValueError("Enter the text value.")
    if len(text) > TXT_MAX_LENGTH:
        raise DnsValueError(f"Text values can be at most {TXT_MAX_LENGTH} characters.")
    if _CONTROL_CHARS.search(text):
        raise DnsValueError("Text values can't contain line breaks or control characters.")
    return text


def _uint16(raw: object, label: str) -> int:
    return _strict_int(
        raw, 0, UINT16_MAX, f"Enter a whole number from 0 to {UINT16_MAX} for {label}."
    )


# --- Typed values ------------------------------------------------------------------------------

ValueIssues = list[tuple[str | None, str]]  # (key or None for the whole value, message)

_VALUE_KEYS: dict[str, tuple[str, ...]] = {
    "A": ("value",),
    "AAAA": ("value",),
    "CNAME": ("value",),
    "TXT": ("value",),
    "NS": ("value",),
    "PTR": ("value",),
    "MX": ("priority", "exchange"),
    "SRV": ("priority", "weight", "port", "target"),
    "CAA": ("flags", "tag", "value"),
}


def _normalize_caa_value(raw: object, tag: str | None) -> str:
    if not isinstance(raw, str) or not raw.strip():
        raise DnsValueError("Enter the CAA value, such as letsencrypt.org.")
    value = raw.strip()
    if len(value) > CAA_VALUE_MAX_LENGTH:
        raise DnsValueError(f"CAA values can be at most {CAA_VALUE_MAX_LENGTH} characters.")
    if not _CAA_PRINTABLE.match(value):
        raise DnsValueError("CAA values can contain only printable ASCII characters.")
    if tag == "iodef" and not value.lower().startswith(CAA_IODEF_PREFIXES):
        raise DnsValueError("For iodef, enter a mailto:, http://, or https:// URL.")
    return value


def check_value(record_type: str, raw: object) -> tuple[dict[str, Any] | None, ValueIssues]:
    """Validate one value object for a user record type.

    Returns (normalized value, []) or (None, issues). Issue keys name the offending property;
    None means the value object as a whole (wrong type or unknown keys).
    """
    keys = _VALUE_KEYS[record_type]
    if not isinstance(raw, Mapping):
        return None, [(None, "Each value must be an object.")]
    unknown = sorted(str(key) for key in raw if key not in keys)
    if unknown:
        return None, [(None, f"Unknown field(s) for {record_type}: {', '.join(unknown)}.")]

    issues: ValueIssues = []
    out: dict[str, Any] = {}

    def run(key: str, fn: Any) -> None:
        if key not in raw or raw[key] is None:
            issues.append((key, REQUIRED_MESSAGE))
            return
        try:
            out[key] = fn(raw[key])
        except DnsValueError as exc:
            issues.append((key, exc.message))

    if record_type == "A":
        run("value", normalize_ipv4)
    elif record_type == "AAAA":
        run("value", normalize_ipv6)
    elif record_type in ("CNAME", "NS", "PTR"):
        run("value", normalize_hostname)
    elif record_type == "TXT":
        run("value", normalize_txt)
    elif record_type == "MX":
        run("priority", lambda v: _uint16(v, "priority"))
        run("exchange", normalize_hostname)
    elif record_type == "SRV":
        run("priority", lambda v: _uint16(v, "priority"))
        run("weight", lambda v: _uint16(v, "weight"))
        run("port", lambda v: _uint16(v, "port"))
        run("target", lambda v: normalize_hostname(v, allow_root=True))
    elif record_type == "CAA":
        run(
            "flags",
            lambda v: _strict_int(v, 0, UINT8_MAX, f"Enter a whole number from 0 to {UINT8_MAX}."),
        )

        def tag_fn(v: object) -> str:
            tag = v.strip().lower() if isinstance(v, str) else None
            if tag not in CAA_TAGS:
                raise DnsValueError("Choose one of: issue, issuewild, iodef.")
            return tag

        run("tag", tag_fn)
        run("value", lambda v: _normalize_caa_value(v, out.get("tag")))

    if issues:
        return None, issues
    return {key: out[key] for key in keys}, []


def normalize_value(record_type: str, raw: object) -> dict[str, Any]:
    """check_value that raises DnsValueError (first issue) instead of returning issues."""
    value, issues = check_value(record_type, raw)
    if value is None:
        key, message = issues[0]
        raise DnsValueError(f"{key}: {message}" if key else message)
    return value


# --- Display formatting (the one formatter) ----------------------------------------------------


def _quote(text: str) -> str:
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'


def format_display_value(record_type: str, value: Mapping[str, Any]) -> str:
    """Human-readable form of a value, stored as record_values.display_value."""
    if record_type in ("A", "AAAA", "CNAME", "NS", "PTR"):
        return str(value["value"])
    if record_type == "TXT":
        return _quote(str(value["value"]))
    if record_type == "MX":
        return f"{value['priority']} {value['exchange']}"
    if record_type == "SRV":
        return f"{value['priority']} {value['weight']} {value['port']} {value['target']}"
    if record_type == "CAA":
        return f"{value['flags']} {value['tag']} {_quote(str(value['value']))}"
    if record_type == "SOA":
        return " ".join(
            str(value[key])
            for key in ("mname", "rname", "serial", "refresh", "retry", "expire", "minimum")
        )
    raise ValueError(f"Unsupported record type: {record_type}")


# --- Comments ----------------------------------------------------------------------------------


def normalize_comment(raw: object) -> str | None:
    """Trim; empty becomes None; at most 1000 characters."""
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise DnsValueError("Enter a text value.")
    text = raw.strip()
    if len(text) > COMMENT_MAX_LENGTH:
        raise DnsValueError(f"Enter no more than {COMMENT_MAX_LENGTH} characters.")
    return text or None


# --- Whole record ------------------------------------------------------------------------------


@dataclass(frozen=True)
class ValidatedRecord:
    name: str
    record_type: str
    routing_policy: str
    ttl_seconds: int
    values: list[dict[str, Any]]
    display_values: list[str]
    comment: str | None


def validate_record(
    zone_name: str,
    *,
    name: object,
    record_type: object,
    routing_policy: object,
    ttl_seconds: object,
    values: object,
    comment: object,
) -> ValidatedRecord:
    """Validate a complete record (create, or the merged result of an update).

    Collects every field problem and raises DnsFieldErrors once.
    """
    issues = FieldIssues()

    canonical_name: str | None = None
    if name is None:
        issues.add("name", "Enter @ for the zone apex.")
    else:
        try:
            canonical_name = canonicalize_record_name(name, zone_name)
        except DnsValueError as exc:
            issues.add("name", exc.message)

    rtype: str | None = None
    if record_type is None:
        issues.add("record_type", REQUIRED_MESSAGE)
    elif record_type in SYSTEM_ONLY_RECORD_TYPES:
        issues.add("record_type", "SOA records are managed by the system.")
    elif record_type not in USER_RECORD_TYPES:
        issues.add("record_type", f"Choose one of: {', '.join(USER_RECORD_TYPES)}.")
    else:
        rtype = str(record_type)

    if routing_policy not in ROUTING_POLICIES:
        issues.add("routing_policy", "Only Simple routing is supported in this clone.")

    ttl: int | None = None
    try:
        ttl = validate_ttl(ttl_seconds)
    except DnsValueError as exc:
        issues.add("ttl_seconds", exc.message)

    normalized_comment: str | None = None
    try:
        normalized_comment = normalize_comment(comment)
    except DnsValueError as exc:
        issues.add("comment", exc.message)

    if rtype == "CNAME" and canonical_name is not None and canonical_name == zone_name:
        issues.add("name", "CNAME records are not allowed at the zone apex.")

    normalized_values: list[dict[str, Any]] = []
    if values is None:
        issues.add("values", "Add at least one value.")
    elif not isinstance(values, list):
        issues.add("values", "Values must be a list.")
    elif not values:
        issues.add("values", "Add at least one value.")
    elif len(values) > MAX_VALUES:
        issues.add("values", f"A record can have at most {MAX_VALUES} values.")
    elif rtype is not None:
        if rtype == "CNAME" and len(values) != 1:
            issues.add("values", "A CNAME record must have exactly one value.")
        seen: dict[tuple[tuple[str, Any], ...], int] = {}
        for index, raw in enumerate(values):
            value, value_issues = check_value(rtype, raw)
            for key, message in value_issues:
                issues.add(f"values.{index}.{key}" if key else f"values.{index}", message)
            if value is None:
                continue
            fingerprint = tuple(value.items())
            if fingerprint in seen:
                issues.add(
                    f"values.{index}", f"This value duplicates value {seen[fingerprint] + 1}."
                )
                continue
            seen[fingerprint] = index
            normalized_values.append(value)

    issues.raise_if_any()
    assert canonical_name is not None and rtype is not None and ttl is not None
    return ValidatedRecord(
        name=canonical_name,
        record_type=rtype,
        routing_policy="SIMPLE",
        ttl_seconds=ttl,
        values=normalized_values,
        display_values=[format_display_value(rtype, value) for value in normalized_values],
        comment=normalized_comment,
    )
