import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, trialAccounts, processedEvents, trialNurtureSteps } from "@/db/schema";
import { verifyWebhookSignature } from "@/lib/auth";
import { TrialEvent } from "@/lib/trialNurture/events";
import { assignBccInternal } from "@/lib/trialNurture/bcc";
import { isDripSendingEnabled } from "@/lib/killSwitch";
import { eq, sql, count, and, inArray } from "drizzle-orm";
import {
  isSignupAppId,
  productFromTrialStarted,
  productStepsAlreadyCoveredBySignup,
  SIGNUP_PRODUCT,
  VERIFY_REMINDER_PRODUCT,
  SIGNUP_SEQUENCE_PRODUCTS,
  signupAppId,
  canEnrolSignupNurture,
} from "@/lib/trialNurture/signupEnrolment";
import { isExcludedEmail, junkReason } from "@/lib/trialNurture/exclusions";

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

    // Enrol or promote into signup_finish_setup so the welcome drip starts once they verify.
    // Never downgrade a product trial. If a verify-reminder row exists, rewrite it.
    const existing = await db.select().from(trialAccounts).where(eq(trialAccounts.contactId, contact.id));
    const active = existing.filter((r) => r.planStatus === "trial" || r.planStatus === "paid");
    const reminder = active.find((r) => r.product === VERIFY_REMINDER_PRODUCT);
    const finish = active.find((r) => r.product === SIGNUP_PRODUCT);
    const productTrial = active.find((r) => !SIGNUP_SEQUENCE_PRODUCTS.includes(r.product as typeof SIGNUP_PRODUCT));

    if (productTrial) {
      return NextResponse.json({ ok: true, enrolment: "has_product_trial" });
    }
    if (finish) {
      return NextResponse.json({ ok: true, enrolment: "already_finish_setup" });
    }
    if (reminder) {
      await db.update(trialAccounts).set({
        product: SIGNUP_PRODUCT,
        updatedAt: new Date(),
      }).where(eq(trialAccounts.id, reminder.id));
      await db.delete(trialNurtureSteps).where(eq(trialNurtureSteps.trialAccountId, reminder.id));
      return NextResponse.json({ ok: true, enrolment: "upgraded_from_reminder" });
    }

    const objectId = e.objectId || contact.objectId;
    const email = contact.email;
    const junk = junkReason(
      { accountName: contact.firstname || null },
      { email, firstname: contact.firstname, emailVerified: true },
    );
    const gate = canEnrolSignupNurture({
      email,
      emailVerified: true,
      unsubscribed: !!contact.unsubscribed,
      isExcludedEmail: isExcludedEmail(email),
      junkReason: junk,
      alreadyHasActiveTrial: false,
    });
    if (!gate.ok) return NextResponse.json({ ok: true, enrolment: "skipped", reason: gate.reason });
    if (!objectId) return NextResponse.json({ ok: true, enrolment: "skipped", reason: "missing_objectId" });
    const at = new Date();
    const [row] = await db.insert(trialAccounts).values({
      contactId: contact.id,
      appId: signupAppId(String(objectId)),
      product: SIGNUP_PRODUCT,
      trialStartedAt: at,
      enrolledAt: at,
      planStatus: "trial",
    }).onConflictDoNothing().returning();
    return NextResponse.json({
      ok: true,
      enrolment: row ? "enrolled_finish_setup" : "duplicate_app_id",
      trialAccountId: row?.id,
    });
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
      .where(and(eq(trialAccounts.contactId, contact.id), inArray(trialAccounts.product, [...SIGNUP_SEQUENCE_PRODUCTS])));
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
