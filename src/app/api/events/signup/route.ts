import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, sequences, sequenceEnrollments, trialAccounts, processedEvents } from "@/db/schema";
import { verifyWebhookSignature } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { RETIRED_SEQUENCE_NAMES } from "@/lib/killSwitch";
import { isExcludedEmail, junkReason } from "@/lib/trialNurture/exclusions";
import { emailDeliverabilityReason } from "@/lib/trialNurture/mailQuality";
import {
  SIGNUP_PRODUCT,
  VERIFY_REMINDER_PRODUCT,
  signupAppId,
  canEnrolSignupNurture,
  canEnrolVerifyReminder,
  contactTrialHistory,
  signupCreatedAtOf,
} from "@/lib/trialNurture/signupEnrolment";

/**
 * SessionCloud → CRM signup webhook (HMAC). Allowlisted under /api/events/.
 * Upserts the contact and enrols them in signup_finish_setup trial-nurture
 * (no project required). Legacy Welcome Drip sequences stay retired/skipped.
 * Idempotent via event_id → processed_events (once per account).
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-signature") || "";

  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.event !== "signup") {
    return NextResponse.json({ error: "Unknown event type" }, { status: 400 });
  }

  const {
    email,
    firstname,
    lastname,
    phone,
    website,
    country,
    objectId,
    created_at,
    occurred_at,
    email_verified,
    event_id,
  } = body;

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const emailNorm = String(email).toLowerCase().trim();
  const eventId = typeof event_id === "string" && event_id.length > 0
    ? event_id
    : objectId
      ? `signup:${objectId}`
      : `signup-email:${emailNorm}`;

  const fresh = await db.insert(processedEvents).values({ eventId }).onConflictDoNothing().returning();
  if (!fresh.length) {
    return NextResponse.json({ success: true, duplicate: true });
  }

  const verified = email_verified === true || email_verified === "true";
  const createdAt = created_at || occurred_at;

  const [contact] = await db
    .insert(contacts)
    .values({
      objectId: objectId || undefined,
      email: emailNorm,
      username: emailNorm,
      firstname,
      lastname,
      phone,
      website,
      country,
      source: "webhook",
      emailVerified: verified,
      originalCreatedAt: createdAt ? new Date(createdAt) : undefined,
    })
    .onConflictDoUpdate({
      target: contacts.email,
      set: {
        firstname,
        lastname,
        phone,
        website,
        country,
        ...(objectId ? { objectId } : {}),
        ...(verified ? { emailVerified: true } : {}),
        updatedAt: new Date(),
      },
    })
    .returning();

  // Legacy DB sequences with triggerEvent=signup (Welcome Drip is retired — skipped).
  const signupSequences = await db
    .select()
    .from(sequences)
    .where(and(eq(sequences.triggerEvent, "signup"), eq(sequences.active, true)));

  const enrollments = [];
  for (const sequence of signupSequences) {
    if (RETIRED_SEQUENCE_NAMES.has(sequence.name)) continue;
    const [enrollment] = await db
      .insert(sequenceEnrollments)
      .values({
        contactId: contact.id,
        sequenceId: sequence.id,
        currentStepOrder: 0,
        status: "active",
        nextSendAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    if (enrollment) enrollments.push(enrollment);
  }

  // Enrol verified signups into signup_finish_setup; unverified signups that
  // pass junk / mail-quality checks into the one-shot signup_verify_reminder.
  let nurture: { enrolled: boolean; reason?: string; trialAccountId?: string; product?: string } = { enrolled: false };
  const existingTrials = await db.select().from(trialAccounts).where(eq(trialAccounts.contactId, contact.id)).limit(5);
  const already = existingTrials.some((t) => t.planStatus === "trial" || t.planStatus === "paid");
  const verifiedNow = verified || !!contact.emailVerified;
  const junk = junkReason(
    { accountName: firstname || null },
    { email: emailNorm, firstname, emailVerified: verifiedNow },
    { allowUnverified: !verifiedNow },
  );
  const deliverability = await emailDeliverabilityReason(emailNorm);
  const quality = junk || deliverability;
  const shared = {
    email: emailNorm,
    unsubscribed: !!contact.unsubscribed,
    isExcludedEmail: isExcludedEmail(emailNorm),
    junkReason: quality,
    alreadyHasActiveTrial: already,
  };
  const gate = verifiedNow
    ? canEnrolSignupNurture({
      ...shared,
      emailVerified: verifiedNow,
      ...contactTrialHistory(existingTrials),
      signupCreatedAt: signupCreatedAtOf(contact),
      now: new Date(),
    })
    : canEnrolVerifyReminder(shared);
  const product = verifiedNow ? SIGNUP_PRODUCT : VERIFY_REMINDER_PRODUCT;

  if (!gate.ok) {
    nurture = { enrolled: false, reason: gate.reason };
  } else if (!objectId) {
    nurture = { enrolled: false, reason: "missing_objectId" };
  } else {
    const at = createdAt ? new Date(createdAt) : new Date();
    const appId = signupAppId(String(objectId));
    const [row] = await db
      .insert(trialAccounts)
      .values({
        contactId: contact.id,
        appId,
        product,
        trialStartedAt: at,
        enrolledAt: at,
        planStatus: "trial",
      })
      .onConflictDoNothing()
      .returning();
    nurture = row
      ? { enrolled: true, trialAccountId: row.id, product }
      : { enrolled: false, reason: "duplicate_app_id" };
  }

  return NextResponse.json({
    success: true,
    contactId: contact.id,
    enrollments: enrollments.length,
    nurture,
  });
}
