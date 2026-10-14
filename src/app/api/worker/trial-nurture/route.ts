import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, trialAccounts, trialNurtureSteps } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { TEAMS_PRODUCTS } from "@/lib/trialNurture/testSequence";
import { isDripSendingEnabled } from "@/lib/killSwitch";
import { decide, render, Step } from "@/lib/trialNurture/schedule";
import { NURTURE_COPY } from "@/lib/trialNurture/copy";
import { missingLinkFields, assertSafeNurtureText } from "@/lib/trialNurture/links";
import { trialNurtureBccAddress } from "@/lib/trialNurture/bcc";
import { isExcludedWorkspace, isExcludedEmail, isStep5ManualWorkspace } from "@/lib/trialNurture/exclusions";
import { sendEmail, NURTURE_FROM_EMAIL, NURTURE_REPLY_TO } from "@/lib/email";

const BATCH = 50;

async function run(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Kill switch BEFORE any DB access: when off this route is a pure no-op.
  if (!isDripSendingEnabled()) return NextResponse.json({ enabled: false, sent: 0 });

  const now = new Date();
  const rows = await db.select({ t: trialAccounts, c: contacts }).from(trialAccounts)
    .innerJoin(contacts, eq(trialAccounts.contactId, contacts.id))
    .where(and(eq(trialAccounts.planStatus, "trial"), inArray(trialAccounts.product, [...TEAMS_PRODUCTS]))).limit(BATCH);
  let sent = 0, skipped = 0, failed = 0, held = 0;

  for (const { t, c } of rows) {
    // Excluded workspaces / contacts: never auto-send, never claim a step (no DB write).
    if (isExcludedWorkspace(t) || isExcludedEmail(c.email)) {
      console.log(JSON.stringify({ level: "info", msg: "trial_nurture_hold_excluded", trialAccountId: t.id }));
      held++; continue;
    }
    const done = await db.select({ step: trialNurtureSteps.step, status: trialNurtureSteps.status, createdAt: trialNurtureSteps.createdAt }).from(trialNurtureSteps).where(eq(trialNurtureSteps.trialAccountId, t.id));
    const sentTimes = done.filter((r) => r.status === "sent" || r.status === "sending").map((r) => (r.createdAt ? new Date(r.createdAt).getTime() : 0));
    const lastSentAt = sentTimes.length ? new Date(Math.max(...sentTimes)) : null;
    let d = decide({ ...t, product: t.product as any, planStatus: t.planStatus as any, unsubscribed: !!c.unsubscribed, sentSteps: done.map((r) => r.step as Step), lastSentAt }, now);
    if (d.action === "wait" || d.action === "stop") continue;
    // Sales sends email 05 manually for these tenants: record step 5 as skipped, never send it.
    if (d.action === "send" && d.step === 5 && isStep5ManualWorkspace(t)) d = { step: 5, action: "skip", reason: "manual_sales" };
    const copy = NURTURE_COPY.find((x) => x.step === d.step)!;
    if (d.action === "send" && !copy.final) continue; // copy not final: hold, don't skip
    // Hold (don't send a broken link) when sip_domain / accountName needed by this step is missing.
    if (d.action === "send") {
      const missing = missingLinkFields(d.step, { sipDomain: t.sipDomain, accountName: t.accountName });
      if (missing.length) {
        console.log(JSON.stringify({
          level: "info", msg: "trial_nurture_hold_missing_link_field",
          trialAccountId: t.id, appId: t.appId, step: d.step, missing,
        }));
        held++;
        continue;
      }
    }
    // Claim the step first (unique (trial, step)) so concurrent runs can never double-send.
    const claimed = await db.insert(trialNurtureSteps)
      .values({ trialAccountId: t.id, step: d.step, status: d.action === "skip" ? "skipped" : "sending", reason: d.action === "skip" ? d.reason : null })
      .onConflictDoNothing().returning();
    if (!claimed.length || d.action === "skip") { skipped++; continue; }
    try {
      const text = render(copy.body, c.firstname, { accountName: t.accountName, sipDomain: t.sipDomain });
      assertSafeNurtureText(text, t.sipDomain);
      // bccInternal was set at enrolment and must not be recomputed here.
      const bcc = t.bccInternal ? [trialNurtureBccAddress()] : undefined;
      const r = await sendEmail({ to: c.email, subject: copy.subject, text,
        from: NURTURE_FROM_EMAIL, replyTo: NURTURE_REPLY_TO, bcc,
        tags: { nurture: "sessionpbx_trial", step: String(d.step) } });
      await db.update(trialNurtureSteps).set({ status: "sent", sesMessageId: r.id }).where(eq(trialNurtureSteps.id, claimed[0].id));
      sent++;
    } catch (err: any) {
      await db.update(trialNurtureSteps).set({ status: "failed", reason: String(err?.name || "error").slice(0, 64) }).where(eq(trialNurtureSteps.id, claimed[0].id));
      failed++;
    }
  }
  return NextResponse.json({ enabled: true, processed: rows.length, sent, skipped, failed, held });
}

export const GET = run;  // Vercel Cron invokes GET
export const POST = run;
