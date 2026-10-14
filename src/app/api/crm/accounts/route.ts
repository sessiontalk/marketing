import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { requireApiKey } from "@/lib/api-auth";
import { desc, ilike, or } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const { searchParams } = req.nextUrl;
  const limitRaw = parseInt(searchParams.get("limit") || "50", 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200);
  const q = (searchParams.get("q") || "").trim();

  let rows;
  if (q) {
    const pattern = `%${q}%`;
    rows = await db
      .select()
      .from(accounts)
      .where(
        or(
          ilike(accounts.name, pattern),
          ilike(accounts.website, pattern),
          ilike(accounts.phone, pattern),
          ilike(accounts.owner, pattern)
        )
      )
      .orderBy(desc(accounts.createdAt))
      .limit(limit);
  } else {
    rows = await db
      .select()
      .from(accounts)
      .orderBy(desc(accounts.createdAt))
      .limit(limit);
  }

  return NextResponse.json({ accounts: rows, count: rows.length });
}

export async function POST(req: NextRequest) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const website = typeof body.website === "string" ? body.website : undefined;
  const country = typeof body.country === "string" ? body.country : undefined;
  const phone = typeof body.phone === "string" ? body.phone : undefined;
  const owner = typeof body.owner === "string" ? body.owner : undefined;
  const notes = typeof body.notes === "string" ? body.notes : undefined;

  const [account] = await db
    .insert(accounts)
    .values({
      name,
      website,
      country,
      phone,
      owner,
      notes,
    })
    .returning();

  return NextResponse.json({ account }, { status: 201 });
}
