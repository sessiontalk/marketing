import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { requireApiKey } from "@/lib/api-auth";
import { count, desc, ilike, or, SQL } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const { searchParams } = req.nextUrl;
  const limitRaw = parseInt(
    searchParams.get("limit") || searchParams.get("take") || "50",
    10
  );
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200);

  const offsetParam = searchParams.get("offset");
  const pageParam = searchParams.get("page");
  let offset = 0;
  if (offsetParam !== null && offsetParam !== "") {
    const offsetRaw = parseInt(offsetParam, 10);
    offset = Math.max(Number.isFinite(offsetRaw) ? offsetRaw : 0, 0);
  } else if (pageParam !== null && pageParam !== "") {
    const pageRaw = parseInt(pageParam, 10);
    const page = Math.max(Number.isFinite(pageRaw) ? pageRaw : 1, 1);
    offset = (page - 1) * limit;
  }

  const q = (searchParams.get("q") || "").trim();
  const whereClause: SQL | undefined = q
    ? or(
        ilike(contacts.email, `%${q}%`),
        ilike(contacts.firstname, `%${q}%`),
        ilike(contacts.lastname, `%${q}%`)
      )
    : undefined;

  const countQuery = db.select({ total: count() }).from(contacts);
  const listQuery = db.select().from(contacts);

  const [{ total }] = whereClause
    ? await countQuery.where(whereClause)
    : await countQuery;

  const rows = whereClause
    ? await listQuery
        .where(whereClause)
        .orderBy(desc(contacts.createdAt))
        .limit(limit)
        .offset(offset)
    : await listQuery
        .orderBy(desc(contacts.createdAt))
        .limit(limit)
        .offset(offset);

  return NextResponse.json({
    contacts: rows,
    count: rows.length,
    total: Number(total),
    limit,
    offset,
  });
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

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const firstname = typeof body.firstname === "string" ? body.firstname : undefined;
  const lastname = typeof body.lastname === "string" ? body.lastname : undefined;
  const phone = typeof body.phone === "string" ? body.phone : undefined;
  const website = typeof body.website === "string" ? body.website : undefined;
  const country = typeof body.country === "string" ? body.country : undefined;
  const username = typeof body.username === "string" ? body.username : email;
  const source = typeof body.source === "string" ? body.source : "api";

  const [contact] = await db
    .insert(contacts)
    .values({
      email,
      username,
      firstname,
      lastname,
      phone,
      website,
      country,
      source,
    })
    .onConflictDoUpdate({
      target: contacts.email,
      set: {
        ...(firstname !== undefined ? { firstname } : {}),
        ...(lastname !== undefined ? { lastname } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(website !== undefined ? { website } : {}),
        ...(country !== undefined ? { country } : {}),
        updatedAt: new Date(),
      },
    })
    .returning();

  return NextResponse.json({ contact }, { status: 200 });
}