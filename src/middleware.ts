import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

const PUBLIC_PREFIXES = [
  "/api/events/",
  "/api/worker/",
  "/api/unsubscribe",
  "/api/auth/login",
  "/api/crm/", // cookie skip — API key checked in route handlers via requireApiKey
];

const STATIC_EXACT = new Set(["/favicon.ico"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next/static") ||
    pathname.startsWith("/_next/image") ||
    STATIC_EXACT.has(pathname)
  ) {
    return NextResponse.next();
  }

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Logout always allowed (clears cookie + redirects)
  if (pathname.startsWith("/api/auth/logout")) {
    return NextResponse.next();
  }

  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass) {
    return new NextResponse("CRM locked — admin auth not configured", {
      status: 403,
    });
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  // Login page: allow without session; redirect authed users to dashboard
  if (pathname === "/") {
    if (session) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};