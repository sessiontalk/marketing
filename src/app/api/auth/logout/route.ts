import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME } from "@/lib/session";

function clearAndRedirect(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  const res = NextResponse.redirect(url);
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

export async function GET(req: NextRequest) {
  return clearAndRedirect(req);
}

export async function POST(req: NextRequest) {
  return clearAndRedirect(req);
}
