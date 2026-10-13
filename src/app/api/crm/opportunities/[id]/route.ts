import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { accounts, opportunities } from "@/db/schema";
import { requireApiKey } from "@/lib/api-auth";
import { eq } from "drizzle-orm";

const STAGES = ["new", "qualified", "demo", "proposal", "won", "lost"] as const;
type Stage = (typeof STAGES)[number];

function isStage(v: unknown): v is Stage {
  return typeof v === "string" && (STAGES as readonly string[]).includes(v);
}

type RouteContext = { params: { id: string } };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const { id } = ctx.params;
  const [opportunity] = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, id))
    .limit(1);
  if (!opportunity) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ opportunity });
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

  const set: Record<string, unknown> = { updatedAt: new Date() };

  if ("name" in body) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
    }
    set.name = body.name.trim();
  }

  if ("stage" in body) {
    if (!isStage(body.stage)) {
      return NextResponse.json(
        { error: `stage must be one of: ${STAGES.join("|")}` },
        { status: 400 }
      );
    }
    set.stage = body.stage;
  }

  if ("amount" in body) {
    if (body.amount === null) {
      set.amount = null;
    } else if (typeof body.amount !== "number" || !Number.isInteger(body.amount)) {
      return NextResponse.json({ error: "amount must be an integer (cents)" }, { status: 400 });
    } else {
      set.amount = body.amount;
    }
  }

  if ("currency" in body) {
    if (typeof body.currency !== "string" || body.currency.trim().length !== 3) {
      return NextResponse.json({ error: "currency must be a 3-letter code" }, { status: 400 });
    }
    set.currency = body.currency.trim().toUpperCase();
  }

  if ("accountId" in body) {
    if (typeof body.accountId !== "string" || !body.accountId.trim()) {
      return NextResponse.json({ error: "accountId must be a non-empty string" }, { status: 400 });
    }
    const accountId = body.accountId.trim();
    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);
    if (!account) {
      return NextResponse.json({ error: "account not found" }, { status: 404 });
    }
    set.accountId = accountId;
  }

  if ("primaryContactId" in body) {
    set.primaryContactId = body.primaryContactId;
  }

  if ("owner" in body) {
    set.owner = body.owner;
  }

  if ("closeDate" in body) {
    if (body.closeDate === null) {
      set.closeDate = null;
    } else if (typeof body.closeDate === "string" || typeof body.closeDate === "number") {
      const d = new Date(body.closeDate);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "closeDate is invalid" }, { status: 400 });
      }
      set.closeDate = d;
    } else {
      return NextResponse.json({ error: "closeDate must be a date string, timestamp, or null" }, { status: 400 });
    }
  }

  const [opportunity] = await db
    .update(opportunities)
    .set(set)
    .where(eq(opportunities.id, id))
    .returning();

  if (!opportunity) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ opportunity });
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const { id } = ctx.params;
  const [opportunity] = await db
    .delete(opportunities)
    .where(eq(opportunities.id, id))
    .returning();
  if (!opportunity) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ opportunity, deleted: true });
}
