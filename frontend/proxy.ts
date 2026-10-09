import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "route53_session";

/**
 * Edge guard (Next.js 16 "proxy", formerly middleware): console routes without a session cookie
 * go straight to /login?next=<path>. This only checks presence; the console AuthGate validates
 * the session with GET /api/v1/auth/me, so a stale cookie still ends at /login.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const next = `${pathname}${search}`;
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the login page, the API proxy, Next internals, and static files.
  matcher: ["/((?!login|api/|_next/|favicon\\.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
