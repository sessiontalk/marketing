import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities, contacts } from "@/db/schema";
import { requireApiKey } from "@/lib/api-auth";
import { desc, eq } from "drizzle-orm";

type RouteContext = { params: { id: string } };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const contactId = ctx.params.id;
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(activities)
    .where(eq(activities.contactId, contactId))
    .orderBy(desc(activities.performedAt));

  return NextResponse.json({ activities: rows, count: rows.length });
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const contactId = ctx.params.id;
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = typeof body.type === "string" ? body.type.trim() : "";
  if (!type) {
    return NextResponse.json({ error: "type is required" }, { status: 400 });
  }

  const subject = typeof body.subject === "string" ? body.subject : null;
  const activityBody = typeof body.body === "string" ? body.body : null;
  const performedBy = typeof body.performedBy === "string" ? body.performedBy : null;
  const performedAt =
    typeof body.performedAt === "string" || typeof body.performedAt === "number"
      ? new Date(body.performedAt as string | number)
      : new Date();

  const [activity] = await db
    .insert(activities)
    .values({
      contactId,
      type,
      subject,
      body: activityBody,
      performedBy,
      performedAt,
    })
    .returning();

  return NextResponse.json({ activity }, { status: 201 });
}
