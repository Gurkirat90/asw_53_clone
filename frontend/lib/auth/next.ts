export const DEFAULT_AFTER_LOGIN = "/hosted-zones";

/**
 * Open-redirect guard for ?next=: only same-origin absolute paths ("/x"), never protocol-relative
 * ("//host") or backslash tricks ("/\host"). Anything else falls back to /hosted-zones.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return DEFAULT_AFTER_LOGIN;
  }
  if (/[\u0000-\u001f\\]/.test(next)) return DEFAULT_AFTER_LOGIN;
  if (next === "/login" || next.startsWith("/login?") || next.startsWith("/login/")) {
    return DEFAULT_AFTER_LOGIN;
  }
  return next;
}

export function loginUrl(next?: string): string {
  if (!next || next === "/") return "/login";
  return `/login?next=${encodeURIComponent(next)}`;
}
