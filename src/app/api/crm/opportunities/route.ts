import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { accounts, opportunities } from "@/db/schema";
import { requireApiKey } from "@/lib/api-auth";
import { and, desc, eq } from "drizzle-orm";

const STAGES = ["new", "qualified", "demo", "proposal", "won", "lost"] as const;
type Stage = (typeof STAGES)[number];

function isStage(v: unknown): v is Stage {
  return typeof v === "string" && (STAGES as readonly string[]).includes(v);
}

export async function GET(req: NextRequest) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const { searchParams } = req.nextUrl;
  const limitRaw = parseInt(searchParams.get("limit") || "50", 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200);
  const accountId = (searchParams.get("accountId") || "").trim();
  const stage = (searchParams.get("stage") || "").trim();

  if (stage && !isStage(stage)) {
    return NextResponse.json(
      { error: `stage must be one of: ${STAGES.join("|")}` },
      { status: 400 }
    );
  }

  const filters = [];
  if (accountId) filters.push(eq(opportunities.accountId, accountId));
  if (stage) filters.push(eq(opportunities.stage, stage));

  const query = db.select().from(opportunities).orderBy(desc(opportunities.createdAt)).limit(limit);
  const rows =
    filters.length > 0
      ? await db
          .select()
          .from(opportunities)
          .where(filters.length === 1 ? filters[0] : and(...filters))
          .orderBy(desc(opportunities.createdAt))
          .limit(limit)
      : await query;

  return NextResponse.json({ opportunities: rows, count: rows.length });
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

  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
  if (!accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }

  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!account) {
    return NextResponse.json({ error: "account not found" }, { status: 404 });
  }

  const stageRaw = body.stage === undefined || body.stage === null ? "new" : body.stage;
  if (!isStage(stageRaw)) {
    return NextResponse.json(
      { error: `stage must be one of: ${STAGES.join("|")}` },
      { status: 400 }
    );
  }

  let amount: number | null | undefined = undefined;
  if (body.amount === null) {
    amount = null;
  } else if (body.amount !== undefined) {
    if (typeof body.amount !== "number" || !Number.isInteger(body.amount)) {
      return NextResponse.json({ error: "amount must be an integer (cents)" }, { status: 400 });
    }
    amount = body.amount;
  }

  const currency =
    typeof body.currency === "string" && body.currency.trim()
      ? body.currency.trim().toUpperCase()
      : "GBP";
  if (currency.length !== 3) {
    return NextResponse.json({ error: "currency must be a 3-letter code" }, { status: 400 });
  }

  const primaryContactId =
    typeof body.primaryContactId === "string" ? body.primaryContactId : undefined;
  const owner = typeof body.owner === "string" ? body.owner : undefined;

  let closeDate: Date | null | undefined = undefined;
  if (body.closeDate === null) {
    closeDate = null;
  } else if (body.closeDate !== undefined) {
    if (typeof body.closeDate !== "string" && typeof body.closeDate !== "number") {
      return NextResponse.json({ error: "closeDate must be a date string or timestamp" }, { status: 400 });
    }
    const d = new Date(body.closeDate as string | number);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "closeDate is invalid" }, { status: 400 });
    }
    closeDate = d;
  }

  const [opportunity] = await db
    .insert(opportunities)
    .values({
      accountId,
      name,
      stage: stageRaw,
      ...(amount !== undefined ? { amount } : {}),
      currency,
      ...(primaryContactId !== undefined ? { primaryContactId } : {}),
      ...(owner !== undefined ? { owner } : {}),
      ...(closeDate !== undefined ? { closeDate } : {}),
    })
    .returning();

  return NextResponse.json({ opportunity }, { status: 201 });
}
