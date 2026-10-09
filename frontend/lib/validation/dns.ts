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
