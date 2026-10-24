import { NextResponse, type NextRequest } from "next/server";

/**
 * A cheap gate, not the security boundary.
 *
 * This only checks that a session cookie exists, so an unauthenticated
 * visitor lands on sign-in instead of a flashing empty page. Every API route
 * independently verifies the token and the caller's permissions on the
 * server — the old app treated a middleware redirect as authorization, which
 * a browser can simply refuse to follow.
 */
const SESSION_COOKIE = "bookstore_session";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // API routes answer 401 themselves; redirecting them would turn a clear
  // error message into a confusing HTML response.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  if (!req.cookies.get(SESSION_COOKIE)?.value) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
