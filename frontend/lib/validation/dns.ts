import type { CaaTag, RecordCreateRequest, RecordType, RecordValueByType } from "@/lib/api/types";

// Client-side mirror of backend/app/services/dns_validation.py. The backend stays authoritative;
// these rules give immediate feedback and are pinned by shared/dns-validation-cases.json.

export type ValidationResult<T = string> = { ok: true; normalized: T } | { ok: false; message: string };

export const ZONE_NAME_MESSAGE = "Enter a valid domain name, such as example.com.";
export const COMMENT_MAX_LENGTH = 1000;
export const COMMENT_MESSAGE = "Description must be 1,000 characters or fewer.";
const MAX_NAME_LENGTH = 253;

const ZONE_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

function hasForbiddenText(name: string): boolean {
  return name.includes("://") || name.includes("/") || /\s/.test(name);
}

/** Trim, lowercase, strip one trailing dot, then check hosted-zone domain name rules. */
export function validateZoneName(input: unknown): ValidationResult {
  if (typeof input !== "string") return { ok: false, message: ZONE_NAME_MESSAGE };
  let name = input.trim().toLowerCase();
  if (name.endsWith(".")) name = name.slice(0, -1);
  if (!name || hasForbiddenText(name) || name.length > MAX_NAME_LENGTH) {
    return { ok: false, message: ZONE_NAME_MESSAGE };
  }
  const labels = name.split(".");
  if (labels.length < 2 || labels.some((label) => !ZONE_LABEL.test(label))) {
    return { ok: false, message: ZONE_NAME_MESSAGE };
  }
  if (/^\d+$/.test(labels[labels.length - 1])) return { ok: false, message: ZONE_NAME_MESSAGE };
  return { ok: true, normalized: name };
}

/** Trimmed comment; empty becomes null; at most 1,000 characters. */
export function validateComment(input: string): ValidationResult<string | null> {
  const text = input.trim();
  if (text.length > COMMENT_MAX_LENGTH) return { ok: false, message: COMMENT_MESSAGE };
  return { ok: true, normalized: text || null };
}

// --- Records (mirror of dns_validation.py) ------------------------------------------------------

export const RECORD_NAME_MESSAGE = "Enter a valid record name, such as www or @ for the zone apex.";
export const HOSTNAME_MESSAGE = "Enter a valid hostname, such as host.example.net.";
export const IPV4_MESSAGE = "Enter a valid IPv4 address, such as 192.0.2.10.";
export const IPV6_MESSAGE = "Enter a valid IPv6 address, such as 2001:db8::10.";
export const TTL_MIN = 0;
export const TTL_MAX = 2147483647;
export const TTL_MESSAGE = `Enter a whole number of seconds from ${TTL_MIN} to ${TTL_MAX}.`;
export const DEFAULT_TTL = 300;
export const MAX_VALUES = 100;
export const TXT_MAX_LENGTH = 1024;
export const CAA_VALUE_MAX_LENGTH = 255;
export const CAA_TAGS: readonly CaaTag[] = ["issue", "issuewild", "iodef"];
const UINT16_MAX = 65535;
const UINT8_MAX = 255;
const REQUIRED = "This field is required.";

// Record names and hostname targets also allow underscores (_sip._tcp, _dmarc).
const HOST_LABEL = /^[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const CAA_PRINTABLE = /^[ -~]+$/;

function validHostLabels(labels: string[], allowWildcard: boolean): boolean {
  return labels.every((label, index) => (label === "*" && allowWildcard && index === 0) || HOST_LABEL.test(label));
}

/** Canonical FQDN for a record name in `zone` ("@" = apex, trailing dot = absolute, else relative). */
export function canonicalizeRecordName(input: unknown, zone: string): ValidationResult {
  if (typeof input !== "string") return { ok: false, message: RECORD_NAME_MESSAGE };
  let name = input.trim().toLowerCase();
  if (!name) return { ok: false, message: "Enter @ for the zone apex." };
  if (name === "@") return { ok: true, normalized: zone };
  if (hasForbiddenText(name)) return { ok: false, message: RECORD_NAME_MESSAGE };

  const suffix = `.${zone}`;
  let fqdn: string;
  if (name.endsWith(".")) {
    name = name.slice(0, -1);
    if (name !== zone && !name.endsWith(suffix)) {
      return { ok: false, message: `Record name must be within ${zone}.` };
    }
    fqdn = name;
  } else if (name === zone || name.endsWith(suffix)) {
    fqdn = name;
  } else {
    fqdn = `${name}${suffix}`;
  }
  if (fqdn.length > MAX_NAME_LENGTH) {
    return { ok: false, message: `Record names can be at most ${MAX_NAME_LENGTH} characters.` };
  }
  if (!validHostLabels(fqdn.split("."), true)) return { ok: false, message: RECORD_NAME_MESSAGE };
  return { ok: true, normalized: fqdn };
}

/** Hostname target (CNAME/NS/PTR value, MX exchange, SRV target). `allowRoot` accepts "." (SRV). */
export function validateHostnameTarget(input: unknown, allowRoot = false): ValidationResult {
  if (typeof input !== "string") return { ok: false, message: HOSTNAME_MESSAGE };
  let name = input.trim().toLowerCase();
  if (allowRoot && name === ".") return { ok: true, normalized: "." };
  if (name.endsWith(".")) name = name.slice(0, -1);
  if (!name || hasForbiddenText(name) || name.length > MAX_NAME_LENGTH) {
    return { ok: false, message: HOSTNAME_MESSAGE };
  }
  const labels = name.split(".");
  if (labels.length < 2 || !validHostLabels(labels, false)) return { ok: false, message: HOSTNAME_MESSAGE };
  return { ok: true, normalized: name };
}

const IPV4 = /^(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}$/;

/** Four decimal octets 0-255 without leading zeros (outer whitespace trimmed). */
export function validateIPv4(input: unknown): ValidationResult {
  if (typeof input !== "string") return { ok: false, message: IPV4_MESSAGE };
  const text = input.trim();
  return IPV4.test(text) ? { ok: true, normalized: text } : { ok: false, message: IPV4_MESSAGE };
}

const HEXTET = /^[0-9a-f]{1,4}$/i;

/**
 * RFC 4291 text form (with "::"), no zone IDs and no embedded dotted IPv4. Returns the RFC 5952
 * compressed lowercase form, identical to Python's ipaddress.IPv6Address(...).compressed.
 */
export function validateIPv6(input: unknown): ValidationResult {
  const invalid = { ok: false as const, message: IPV6_MESSAGE };
  if (typeof input !== "string") return invalid;
  const text = input.trim();
  if (!text || text.includes("%") || text.includes(".")) return invalid;

  let hextets: number[];
  const doubleColon = text.indexOf("::");
  if (doubleColon !== -1) {
    if (text.indexOf("::", doubleColon + 1) !== -1) return invalid;
    const head = text.slice(0, doubleColon);
    const tail = text.slice(doubleColon + 2);
    const headParts = head ? head.split(":") : [];
    const tailParts = tail ? tail.split(":") : [];
    if ([...headParts, ...tailParts].some((part) => !HEXTET.test(part))) return invalid;
    const skipped = 8 - headParts.length - tailParts.length;
    if (skipped < 1) return invalid;
    hextets = [
      ...headParts.map((part) => parseInt(part, 16)),
      ...Array<number>(skipped).fill(0),
      ...tailParts.map((part) => parseInt(part, 16)),
    ];
  } else {
    const parts = text.split(":");
    if (parts.length !== 8 || parts.some((part) => !HEXTET.test(part))) return invalid;
    hextets = parts.map((part) => parseInt(part, 16));
  }
  return { ok: true, normalized: compressIPv6(hextets) };
}

function compressIPv6(hextets: number[]): string {
  // Longest run of zero hextets (first one on ties); only runs of 2+ are compressed.
  let bestStart = -1;
  let bestLength = 0;
  let runStart = -1;
  hextets.forEach((value, index) => {
    if (value === 0) {
      if (runStart === -1) runStart = index;
      const length = index - runStart + 1;
      if (length > bestLength) {
        bestLength = length;
        bestStart = runStart;
      }
    } else {
      runStart = -1;
    }
  });
  const hex = hextets.map((value) => value.toString(16));
  if (bestLength < 2) return hex.join(":");
  const left = hex.slice(0, bestStart).join(":");
  const right = hex.slice(bestStart + bestLength).join(":");
  return `${left}::${right}`;
}

function strictInt(input: unknown, min: number, max: number): number | null {
  return typeof input === "number" && Number.isInteger(input) && input >= min && input <= max ? input : null;
}

/** TTL as a JSON value: an integer (not a float, string, or boolean) in 0..2147483647. */
export function validateTtl(input: unknown): ValidationResult<number> {
  const value = strictInt(input, TTL_MIN, TTL_MAX);
  return value === null ? { ok: false, message: TTL_MESSAGE } : { ok: true, normalized: value };
}

/** TTL typed into the form (digits only), then validated like validateTtl. */
export function parseTtlInput(text: string): ValidationResult<number> {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return { ok: false, message: TTL_MESSAGE };
  return validateTtl(Number(trimmed));
}

export function validateTxt(input: unknown): ValidationResult {
  if (typeof input !== "string") return { ok: false, message: "Enter the text value." };
  const text = input.trim();
  if (!text) return { ok: false, message: "Enter the text value." };
  if (text.length > TXT_MAX_LENGTH) {
    return { ok: false, message: `Text values can be at most ${TXT_MAX_LENGTH.toLocaleString("en-US")} characters.` };
  }
  if (CONTROL_CHARS.test(text)) {
    return { ok: false, message: "Text values can't contain line breaks or control characters." };
  }
  return { ok: true, normalized: text };
}

/** Errors per value property; `_value` means the value object as a whole. */
export type ValueErrors = Record<string, string>;
export type StructuredResult<T> = { ok: true; normalized: T } | { ok: false; errors: ValueErrors };

function checkObject(input: unknown, keys: readonly string[], type: string): ValueErrors | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { _value: "Each value must be an object." };
  }
  const unknownKeys = Object.keys(input).filter((key) => !keys.includes(key)).sort();
  if (unknownKeys.length) return { _value: `Unknown field(s) for ${type}: ${unknownKeys.join(", ")}.` };
  return null;
}

function runFields<T>(
  input: Record<string, unknown>,
  checks: Array<[string, (raw: unknown, done: Record<string, unknown>) => ValidationResult<unknown>]>,
): StructuredResult<T> {
  const errors: ValueErrors = {};
  const out: Record<string, unknown> = {};
  for (const [key, check] of checks) {
    const raw = input[key];
    if (raw === undefined || raw === null) {
      errors[key] = REQUIRED;
      continue;
    }
    const result = check(raw, out);
    if (result.ok) out[key] = result.normalized;
    else errors[key] = result.message;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, normalized: out as T };
}

const uint16 = (label: string) => (raw: unknown): ValidationResult<number> => {
  const value = strictInt(raw, 0, UINT16_MAX);
  return value === null
    ? { ok: false, message: `Enter a whole number from 0 to ${UINT16_MAX} for ${label}.` }
    : { ok: true, normalized: value };
};

export function validateMx(input: unknown): StructuredResult<RecordValueByType["MX"]> {
  const shape = checkObject(input, ["priority", "exchange"], "MX");
  if (shape) return { ok: false, errors: shape };
  return runFields(input as Record<string, unknown>, [
    ["priority", uint16("priority")],
    ["exchange", (raw) => validateHostnameTarget(raw)],
  ]);
}

export function validateSrv(input: unknown): StructuredResult<RecordValueByType["SRV"]> {
  const shape = checkObject(input, ["priority", "weight", "port", "target"], "SRV");
  if (shape) return { ok: false, errors: shape };
  return runFields(input as Record<string, unknown>, [
    ["priority", uint16("priority")],
    ["weight", uint16("weight")],
    ["port", uint16("port")],
    ["target", (raw) => validateHostnameTarget(raw, true)],
  ]);
}

export function validateCaa(input: unknown): StructuredResult<RecordValueByType["CAA"]> {
  const shape = checkObject(input, ["flags", "tag", "value"], "CAA");
  if (shape) return { ok: false, errors: shape };
  return runFields(input as Record<string, unknown>, [
    [
      "flags",
      (raw) => {
        const value = strictInt(raw, 0, UINT8_MAX);
        return value === null ? { ok: false, message: `Enter a whole number from 0 to ${UINT8_MAX}.` } : { ok: true, normalized: value };
      },
    ],
    [
      "tag",
      (raw) => {
        const tag = typeof raw === "string" ? raw.trim().toLowerCase() : "";
        return (CAA_TAGS as readonly string[]).includes(tag)
          ? { ok: true, normalized: tag }
          : { ok: false, message: "Choose one of: issue, issuewild, iodef." };
      },
    ],
    [
      "value",
      (raw, done) => {
        if (typeof raw !== "string" || !raw.trim()) return { ok: false, message: "Enter the CAA value, such as letsencrypt.org." };
        const value = raw.trim();
        if (value.length > CAA_VALUE_MAX_LENGTH) return { ok: false, message: `CAA values can be at most ${CAA_VALUE_MAX_LENGTH} characters.` };
        if (!CAA_PRINTABLE.test(value)) return { ok: false, message: "CAA values can contain only printable ASCII characters." };
        if (done.tag === "iodef" && !/^(mailto:|http:\/\/|https:\/\/)/i.test(value)) {
          return { ok: false, message: "For iodef, enter a mailto:, http://, or https:// URL." };
        }
        return { ok: true, normalized: value };
      },
    ],
  ]);
}

// --- Form-level validation ---------------------------------------------------------------------

/** One value row as typed into the form (all strings). */
export interface ValueRow {
  value?: string;
  priority?: string;
  exchange?: string;
  weight?: string;
  port?: string;
  target?: string;
  flags?: string;
  tag?: string;
}

export interface RecordFormValues {
  /** As typed; blank means the zone apex ("@"). */
  name: string;
  type: RecordType;
  ttl: string;
  comment: string;
  values: ValueRow[];
}

export const VALUE_KEYS: Record<RecordType, readonly (keyof ValueRow)[]> = {
  A: ["value"],
  AAAA: ["value"],
  CNAME: ["value"],
  TXT: ["value"],
  NS: ["value"],
  PTR: ["value"],
  MX: ["priority", "exchange"],
  SRV: ["priority", "weight", "port", "target"],
  CAA: ["flags", "tag", "value"],
};

export function emptyValueRow(type: RecordType): ValueRow {
  if (type === "MX") return { priority: "", exchange: "" };
  if (type === "SRV") return { priority: "", weight: "", port: "", target: "" };
  if (type === "CAA") return { flags: "0", tag: "issue", value: "" };
  return { value: "" };
}

const NUMERIC_KEYS = new Set<keyof ValueRow>(["priority", "weight", "port", "flags"]);

/** Form strings -> API value object (numbers parsed only when they are plain digits). */
function rowToValue(type: RecordType, row: ValueRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of VALUE_KEYS[type]) {
    const raw = (row[key] ?? "").trim();
    if (NUMERIC_KEYS.has(key)) out[key] = /^\d+$/.test(raw) ? Number(raw) : raw === "" ? null : raw;
    else out[key] = row[key] ?? "";
  }
  return out;
}

function validateValue(type: RecordType, raw: Record<string, unknown>): StructuredResult<Record<string, unknown>> {
  switch (type) {
    case "A":
    case "AAAA":
    case "CNAME":
    case "NS":
    case "PTR":
    case "TXT": {
      const check =
        type === "A" ? validateIPv4 : type === "AAAA" ? validateIPv6 : type === "TXT" ? validateTxt : (v: unknown) => validateHostnameTarget(v);
      if (raw.value === "" || raw.value === undefined) return { ok: false, errors: { value: REQUIRED } };
      const result = check(raw.value);
      return result.ok ? { ok: true, normalized: { value: result.normalized } } : { ok: false, errors: { value: result.message } };
    }
    case "MX":
      return validateMx(raw) as StructuredResult<Record<string, unknown>>;
    case "SRV":
      return validateSrv(raw) as StructuredResult<Record<string, unknown>>;
    case "CAA":
      return validateCaa(raw) as StructuredResult<Record<string, unknown>>;
  }
}

export interface RecordFormResult {
  /** Keyed by API dot path: name, ttl_seconds, comment, values, values.N.<key>, values.N. */
  fieldErrors: Record<string, string>;
  payload?: RecordCreateRequest;
}

/** Validates the whole form like the backend and builds the exact API payload when valid. */
export function validateRecordForm(form: RecordFormValues, zone: string): RecordFormResult {
  const fieldErrors: Record<string, string> = {};
  const rawName = form.name.trim() === "" ? "@" : form.name;
  const name = canonicalizeRecordName(rawName, zone);
  if (!name.ok) fieldErrors.name = name.message;
  else if (form.type === "CNAME" && name.normalized === zone) {
    fieldErrors.name = "CNAME records are not allowed at the zone apex.";
  }

  const ttl = parseTtlInput(form.ttl);
  if (!ttl.ok) fieldErrors.ttl_seconds = ttl.message;

  const comment = validateComment(form.comment);
  if (!comment.ok) fieldErrors.comment = comment.message;

  const values: Record<string, unknown>[] = [];
  if (form.values.length === 0) fieldErrors.values = "Add at least one value.";
  else if (form.values.length > MAX_VALUES) fieldErrors.values = `A record can have at most ${MAX_VALUES} values.`;
  else {
    if (form.type === "CNAME" && form.values.length !== 1) fieldErrors.values = "A CNAME record must have exactly one value.";
    const seen = new Map<string, number>();
    form.values.forEach((row, index) => {
      const result = validateValue(form.type, rowToValue(form.type, row));
      if (!result.ok) {
        for (const [key, message] of Object.entries(result.errors)) {
          fieldErrors[key === "_value" ? `values.${index}` : `values.${index}.${key}`] = message;
        }
        return;
      }
      const fingerprint = JSON.stringify(result.normalized);
      if (seen.has(fingerprint)) {
        fieldErrors[`values.${index}`] = `This value duplicates value ${(seen.get(fingerprint) ?? 0) + 1}.`;
        return;
      }
      seen.set(fingerprint, index);
      values.push(result.normalized);
    });
  }

  if (Object.keys(fieldErrors).length > 0 || !ttl.ok || !comment.ok) return { fieldErrors };
  // Each value was validated against form.type above, so the shapes match RecordCreateRequest.
  return {
    fieldErrors,
    payload: {
      name: rawName.trim(),
      record_type: form.type,
      routing_policy: "SIMPLE",
      ttl_seconds: ttl.normalized,
      values,
      comment: comment.normalized,
    } as unknown as RecordCreateRequest,
  };
}
