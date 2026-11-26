import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { withDbErrors } from "@/lib/dbErrors";
import { accounts } from "@/db/schema";
import { requireApiKey } from "@/lib/api-auth";
import { eq } from "drizzle-orm";

type RouteContext = { params: { id: string } };

async function handleGET(req: NextRequest, ctx: RouteContext) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const { id } = ctx.params;
  const [account] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (!account) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ account });
}

async function handlePATCH(req: NextRequest, ctx: RouteContext) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const { id } = ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const allowed = ["name", "website", "country", "phone", "owner", "notes"] as const;

  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (!(key in body)) continue;
    if (key === "name") {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
      }
      set.name = body.name.trim();
    } else {
      set[key] = body[key];
    }
  }

  const [account] = await db
    .update(accounts)
    .set(set)
    .where(eq(accounts.id, id))
    .returning();

  if (!account) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ account });
}

async function handleDELETE(req: NextRequest, ctx: RouteContext) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const { id } = ctx.params;
  const [account] = await db.delete(accounts).where(eq(accounts.id, id)).returning();
  if (!account) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ account, deleted: true });
}

export const GET = withDbErrors(handleGET);
export const PATCH = withDbErrors(handlePATCH);
export const DELETE = withDbErrors(handleDELETE);
