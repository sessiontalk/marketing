import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { requireApiKey } from "@/lib/api-auth";
import { eq } from "drizzle-orm";

type RouteContext = { params: { id: string } };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const { id } = ctx.params;
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  if (!contact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ contact });
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const { id } = ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const allowed = [
    "firstname",
    "lastname",
    "phone",
    "website",
    "country",
    "username",
    "emailVerified",
    "unsubscribed",
  ] as const;

  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (key in body) set[key] = body[key];
  }
  if (typeof body.email === "string") {
    set.email = body.email.trim().toLowerCase();
  }

  const [contact] = await db
    .update(contacts)
    .set(set)
    .where(eq(contacts.id, id))
    .returning();

  if (!contact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ contact });
}
