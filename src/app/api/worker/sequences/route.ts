import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  sequenceEnrollments,
  sequenceSteps,
  contacts,
  templates,
  sendLogs,
  unsubscribeTokens,
} from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { generateUnsubscribeToken, getUnsubscribeUrl } from "@/lib/tokens";
import { eq, and, lte } from "drizzle-orm";
import { sequences } from "@/db/schema";
import { isDripSendingEnabled, RETIRED_SEQUENCE_NAMES } from "@/lib/killSwitch";

const BATCH_SIZE = 50;

// ROOT CAUSE FIX: Vercel Cron calls the path with GET (Authorization: Bearer $CRON_SECRET).
// This route only exported POST, so every 5-minute cron got 405 and no enrolment was ever
// processed. Export both. Also reject when CRON_SECRET is unset ("Bearer undefined").
async function run(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Hard kill switch (default off) — checked before touching the DB.
  if (!isDripSendingEnabled()) {
    return NextResponse.json({ enabled: false, processed: 0, sent: 0, failed: 0 });
  }

  const now = new Date();

  const dueEnrollments = await db
    .select({
      enrollment: sequenceEnrollments,
      contact: contacts,
      sequence: sequences,
    })
    .from(sequenceEnrollments)
    .innerJoin(contacts, eq(sequenceEnrollments.contactId, contacts.id))
    .innerJoin(sequences, eq(sequenceEnrollments.sequenceId, sequences.id))
    .where(
      and(
        eq(sequenceEnrollments.status, "active"),
        eq(sequences.active, true),
        lte(sequenceEnrollments.nextSendAt, now)
      )
    )
    .limit(BATCH_SIZE);

  let sent = 0;
  let failed = 0;

  for (const { enrollment, contact, sequence } of dueEnrollments) {
    if (RETIRED_SEQUENCE_NAMES.has(sequence.name)) continue; // legacy softphone copy never sends
    if (contact.unsubscribed) {
      await db
        .update(sequenceEnrollments)
        .set({ status: "cancelled" })
        .where(eq(sequenceEnrollments.id, enrollment.id));
      continue;
    }

    const nextStepOrder = (enrollment.currentStepOrder || 0) + 1;

    const [step] = await db
      .select()
      .from(sequenceSteps)
      .where(
        and(
          eq(sequenceSteps.sequenceId, enrollment.sequenceId),
          eq(sequenceSteps.stepOrder, nextStepOrder)
        )
      );

    if (!step) {
      await db
        .update(sequenceEnrollments)
        .set({ status: "completed", completedAt: now })
        .where(eq(sequenceEnrollments.id, enrollment.id));
      continue;
    }

    const [template] = await db
      .select()
      .from(templates)
      .where(eq(templates.id, step.templateId!));

    if (!template) {
      failed++;
      continue;
    }

    const unsubToken = generateUnsubscribeToken();
    await db.insert(unsubscribeTokens).values({
      token: unsubToken,
      contactId: contact.id,
    });

    const unsubUrl = getUnsubscribeUrl(unsubToken);

    const subject = (step.subject || template.subject).replace(
      "{{firstname}}",
      contact.firstname || "there"
    );

    const htmlBody = template.htmlBody
      .replace(/{{firstname}}/g, contact.firstname || "there")
      .replace(/{{unsubscribe_url}}/g, unsubUrl);

    try {
      const result = await sendEmail({
        to: contact.email,
        subject,
        html: htmlBody,
        text: template.textBody || undefined,
        unsubscribeUrl: unsubUrl,
        tags: {
          sequence_id: enrollment.sequenceId,
          step: String(nextStepOrder),
        },
      });

      await db.insert(sendLogs).values({
        contactId: contact.id,
        templateId: template.id,
        enrollmentId: enrollment.id,
        resendId: result.id, // reuse the field for SES MessageId
        status: "sent",
      });

      const nextSendAt = new Date(
        now.getTime() + (step.delayHours || 0) * 60 * 60 * 1000
      );

      await db
        .update(sequenceEnrollments)
        .set({
          currentStepOrder: nextStepOrder,
          nextSendAt,
        })
        .where(eq(sequenceEnrollments.id, enrollment.id));

      sent++;
    } catch (err: any) {
      await db.insert(sendLogs).values({
        contactId: contact.id,
        templateId: template.id,
        enrollmentId: enrollment.id,
        status: "failed",
        errorMessage: err.message,
      });
      failed++;
    }
  }

  return NextResponse.json({
    enabled: true,
    processed: dueEnrollments.length,
    sent,
    failed,
  });
}

export const GET = run;
export const POST = run;
