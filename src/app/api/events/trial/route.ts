import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, trialAccounts, processedEvents } from "@/db/schema";
import { verifyWebhookSignature } from "@/lib/auth";
import { TrialEvent } from "@/lib/trialNurture/events";
import { assignBccInternal } from "@/lib/trialNurture/bcc";
import { isDripSendingEnabled } from "@/lib/killSwitch";
import { eq, sql, count } from "drizzle-orm";

/**
 * SessionCloud → CRM activity events for NEW SessionPBX (Teams/Hosted) trials.
 * Same HMAC pattern as /api/events/signup. Records state only; never sends mail.
 * Go-forward only: a trial is created solely by a live "trial.started" event, so no
 * existing contact (incl. the 53 legacy Welcome Drip contacts) is ever backfilled.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  const sig = req.headers.get("x-webhook-signature") || "";
  if (sig.length !== 64 || !verifyWebhookSignature(raw, sig, secret))
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let parsed;
  try { parsed = TrialEvent.safeParse(JSON.parse(raw)); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const e = parsed.data;
  const at = new Date(e.occurred_at);
  const email = e.email.toLowerCase().trim();

  const fresh = await db.insert(processedEvents).values({ eventId: e.event_id }).onConflictDoNothing().returning();
  if (!fresh.length) return NextResponse.json({ ok: true, duplicate: true });

  const [contact] = await db.insert(contacts)
    .values({ email, username: email, objectId: e.objectId, firstname: e.firstname, source: "webhook" })
    .onConflictDoUpdate({ target: contacts.email, set: { updatedAt: new Date() } })
    .returning();

  if (e.event === "email.verified") {
    await db.update(contacts).set({ emailVerified: true, updatedAt: new Date() }).where(eq(contacts.id, contact.id));
    return NextResponse.json({ ok: true });
  }
  if (!e.app_id) return NextResponse.json({ error: "app_id required" }, { status: 400 });

  if (e.event === "trial.started") {
    if (!e.product) return NextResponse.json({ error: "product required" }, { status: 400 });
    // BCC flag is sticky: count earlier flagged trials enrolled since sending was enabled.
    const [{ flagged }] = await db.select({ flagged: count() }).from(trialAccounts).where(eq(trialAccounts.bccInternal, true));
    const bccInternal = assignBccInternal({
      sendingEnabled: isDripSendingEnabled(),
      earlierFlaggedCount: Number(flagged) || 0,
    });
    await db.insert(trialAccounts).values({
      contactId: contact.id, appId: e.app_id, product: e.product,
      accountName: e.account_name, sipDomain: e.sip_domain, bccInternal, trialStartedAt: at,
      trialEndsAt: e.trial_ends_at ? new Date(e.trial_ends_at) : null,
    }).onConflictDoNothing();
    return NextResponse.json({ ok: true });
  }

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (e.account_name) set.accountName = e.account_name;
  if (e.sip_domain) set.sipDomain = e.sip_domain;
  const first = (col: any) => sql`coalesce(${col}, ${at})`;
  switch (e.event) {
    case "project.created": set.projectCreatedAt = first(trialAccounts.projectCreatedAt); break;
    case "extension.created": set.extensionCount = e.extension_count ?? sql`${trialAccounts.extensionCount} + 1`; break;
    case "softphone.login": set.softphoneFirstLoginAt = first(trialAccounts.softphoneFirstLoginAt); break;
    case "call.completed": set.firstCallAt = first(trialAccounts.firstCallAt); break;
    case "trunk.connected": case "number.added": set.carrierConnectedAt = first(trialAccounts.carrierConnectedAt); break;
    case "card.added": set.paymentMethodAddedAt = first(trialAccounts.paymentMethodAddedAt); break;
    case "plan.changed": if (e.plan_status) set.planStatus = e.plan_status; if (e.product) set.product = e.product; if (e.trial_ends_at) set.trialEndsAt = new Date(e.trial_ends_at); break;
    case "trial.cancelled": set.planStatus = "cancelled"; break;
  }
  // Unknown app_id (trial began before this went live) => no row => no-op. No backfill.
  await db.update(trialAccounts).set(set).where(eq(trialAccounts.appId, e.app_id));
  return NextResponse.json({ ok: true });
}
