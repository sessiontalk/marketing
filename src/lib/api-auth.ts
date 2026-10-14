import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

function extractApiKey(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m?.[1]) return m[1].trim();
  }
  const headerKey = req.headers.get("x-api-key");
  if (headerKey) return headerKey.trim();
  return null;
}

function safeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/** Returns null if authorized; otherwise a 401 JSON response. */
export function requireApiKey(req: NextRequest): NextResponse | null {
  const expected = process.env.CRM_API_KEY?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "CRM API key not configured" },
      { status: 500 }
    );
  }
  const provided = extractApiKey(req);
  if (!provided || !safeEqualString(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}