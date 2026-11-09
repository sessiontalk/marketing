import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, trialAccounts, processedEvents, trialNurtureSteps } from "@/db/schema";
import { verifyWebhookSignature } from "@/lib/auth";
import { TrialEvent } from "@/lib/trialNurture/events";
import { assignBccInternal } from "@/lib/trialNurture/bcc";
import { isDripSendingEnabled } from "@/lib/killSwitch";
import { eq, sql, count, and } from "drizzle-orm";
import {
  isSignupAppId,
  productFromTrialStarted,
  productStepsAlreadyCoveredBySignup,
} from "@/lib/trialNurture/signupEnrolment";

/**
 * SessionCloud → CRM activity events for NEW SessionPBX (Teams/Hosted) trials.
 * Same HMAC pattern as /api/events/signup. Records state only; never sends mail.
 * Go-forward only: a trial is created solely by a live "trial.started" event, so no
 * existing contact (incl. the 53 legacy Welcome Drip contacts) is ever backfilled.
 *
 * Upgrade path: if the contact was enrolled at signup into signup_finish_setup
 * (synthetic app_id signup:<objectId>), trial.started rewrites that row to the
 * product sequence and real app_id. Signup steps do not map onto product steps
 * (see SIGNUP_TO_PRODUCT_STEP_MAP), so product sentSteps start empty — no dupes.
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
    const product = productFromTrialStarted(e) || (e.product as any);
    if (!product) return NextResponse.json({ error: "product required" }, { status: 400 });

    const [{ flagged }] = await db.select({ flagged: count() }).from(trialAccounts).where(eq(trialAccounts.bccInternal, true));
    const bccInternal = assignBccInternal({
      sendingEnabled: isDripSendingEnabled(),
      earlierFlaggedCount: Number(flagged) || 0,
    });

    // Prefer upgrading an existing signup_finish_setup row for this contact.
    const signupRows = await db.select().from(trialAccounts)
      .where(and(eq(trialAccounts.contactId, contact.id), eq(trialAccounts.product, "signup_finish_setup")));
    const signupRow = signupRows.find((r) => isSignupAppId(r.appId)) || signupRows[0];

    if (signupRow) {
      const priorSteps = await db.select({ step: trialNurtureSteps.step, status: trialNurtureSteps.status })
        .from(trialNurtureSteps).where(eq(trialNurtureSteps.trialAccountId, signupRow.id));
      const sentSignup = priorSteps.filter((s) => s.status === "sent" || s.status === "skipped").map((s) => s.step);
      const covered = productStepsAlreadyCoveredBySignup(sentSignup);

      await db.update(trialAccounts).set({
        appId: e.app_id,
        product,
        accountName: e.account_name ?? signupRow.accountName,
        sipDomain: e.sip_domain ?? signupRow.sipDomain,
        trialStartedAt: at,
        trialEndsAt: e.trial_ends_at ? new Date(e.trial_ends_at) : signupRow.trialEndsAt,
        projectCreatedAt: at,
        updatedAt: new Date(),
      }).where(eq(trialAccounts.id, signupRow.id));

      // Clear signup step claims (wrong sequence); re-mark only mapped product equivalents.
      if (priorSteps.length) {
        await db.delete(trialNurtureSteps).where(eq(trialNurtureSteps.trialAccountId, signupRow.id));
      }
      for (const step of covered) {
        await db.insert(trialNurtureSteps).values({
          trialAccountId: signupRow.id,
          step,
          status: "skipped",
          reason: "signup_equivalent",
        }).onConflictDoNothing();
      }
      return NextResponse.json({ ok: true, upgraded_from_signup: true });
    }

    await db.insert(trialAccounts).values({
      contactId: contact.id, appId: e.app_id, product,
      accountName: e.account_name, sipDomain: e.sip_domain, bccInternal, trialStartedAt: at,
      trialEndsAt: e.trial_ends_at ? new Date(e.trial_ends_at) : null,
      projectCreatedAt: at,
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
  await db.update(trialAccounts).set(set).where(eq(trialAccounts.appId, e.app_id));
  return NextResponse.json({ ok: true });
}
