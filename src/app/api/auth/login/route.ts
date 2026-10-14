import { NextResponse } from "next/server";
import {
  COOKIE_NAME,
  SESSION_TTL_MS,
  createSessionToken,
} from "@/lib/session";

export async function POST(req: Request) {
  const adminUser = process.env.ADMIN_USER || "admin";
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass) {
    return NextResponse.json(
      { ok: false, error: "CRM locked — admin auth not configured" },
      { status: 403 }
    );
  }

  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const username = (body.username || "").trim();
  const password = body.password || "";

  if (username !== adminUser || password !== adminPass) {
    return NextResponse.json({ ok: false, error: "Invalid username or password" }, { status: 401 });
  }

  const token = await createSessionToken(username);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
