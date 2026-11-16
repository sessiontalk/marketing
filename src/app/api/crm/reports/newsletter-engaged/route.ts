import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { engagedContacts } from "@/lib/sesEvents/reports";

export async function GET(req: NextRequest) {
  const denied = requireApiKey(req);
  if (denied) return denied;
  const p = req.nextUrl.searchParams;
  return NextResponse.json({ data: await engagedContacts(p.get("campaign") ?? undefined, Math.min(Number(p.get("limit") || 500), 2000)) });
}
