import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { newsletterReport } from "@/lib/sesEvents/reports";

export async function GET(req: NextRequest) {
  const denied = requireApiKey(req);
  if (denied) return denied;
  return NextResponse.json({ data: await newsletterReport(req.nextUrl.searchParams.get("campaign") ?? undefined) });
}
