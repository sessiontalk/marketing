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
import { resend, FROM_EMAIL, REPLY_TO } from "@/lib/resend";
import { generateUnsubscribeToken, getUnsubscribeUrl } from "@/lib/tokens";
import { eq, and, lte, isNull } from "drizzle-orm";

const BATCH_SIZE = 50; // Process up to 50 emails per cron run

export async function POST(req: NextRequest) {
  // Verify cron auth (Vercel Cron sends a bearer token)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Find enrollments that are due for their next send
  const dueEnrollments = await db
    .select({
      enrollment: sequenceEnrollments,
      contact: contacts,
    })
    .from(sequenceEnrollments)
    .innerJoin(contacts, eq(sequenceEnrollments.contactId, contacts.id))
    .where(
      and(
        eq(sequenceEnrollments.status, "active"),
        lte(sequenceEnrollments.nextSendAt, now)
      )
    )
    .limit(BATCH_SIZE);

  let sent = 0;
  let failed = 0;

  for (const { enrollment, contact } of dueEnrollments) {
    // Skip unsubscribed contacts
    if (contact.unsubscribed) {
      await db
        .update(sequenceEnrollments)
        .set({ status: "cancelled" })
        .where(eq(sequenceEnrollments.id, enrollment.id));
      continue;
    }

    // Get the current step
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
      // No more steps — sequence complete
      await db
        .update(sequenceEnrollments)
        .set({ status: "completed", completedAt: now })
        .where(eq(sequenceEnrollments.id, enrollment.id));
      continue;
    }

    // Get template
    const [template] = await db
      .select()
      .from(templates)
      .where(eq(templates.id, step.templateId!));

    if (!template) {
      failed++;
      continue;
    }

    // Generate unsubscribe token
    const unsubToken = generateUnsubscribeToken();
    await db.insert(unsubscribeTokens).values({
      token: unsubToken,
      contactId: contact.id,
    });

    const unsubUrl = getUnsubscribeUrl(unsubToken);

    // Personalize content
    const subject = (step.subject || template.subject).replace(
      "{{firstname}}",
      contact.firstname || "there"
    );

    const htmlBody = template.htmlBody
      .replace(/{{firstname}}/g, contact.firstname || "there")
      .replace(/{{unsubscribe_url}}/g, unsubUrl);

    try {
      const result = await resend.emails.send({
        from: FROM_EMAIL,
        to: contact.email,
        replyTo: REPLY_TO,
        subject,
        html: htmlBody,
        text: template.textBody || undefined,
        headers: {
          "List-Unsubscribe": `<${unsubUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        tags: [
          { name: "sequence_id", value: enrollment.sequenceId },
          { name: "step", value: String(nextStepOrder) },
        ],
      });

      // Log the send
      await db.insert(sendLogs).values({
        contactId: contact.id,
        templateId: template.id,
        enrollmentId: enrollment.id,
        resendId: result.data?.id,
        status: "sent",
      });

      // Advance enrollment to next step
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
    processed: dueEnrollments.length,
    sent,
    failed,
  });
}
