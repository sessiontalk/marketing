import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities, contacts, trialAccounts, trialNurtureSteps, unsubscribeTokens } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { isDripSendingEnabled } from "@/lib/killSwitch";
import { decide, render, renderSubject, Step, NURTURE_PRODUCTS, sequenceKey } from "@/lib/trialNurture/schedule";
import { copyFor } from "@/lib/trialNurture/copy";
import { missingLinkFields, assertSafeNurtureText, UNFILLED_PLACEHOLDER_RE } from "@/lib/trialNurture/links";
import { trialNurtureBccAddress } from "@/lib/trialNurture/bcc";
import { isExcludedWorkspace, isExcludedEmail, isStep5ManualWorkspace, junkReason } from "@/lib/trialNurture/exclusions";
import { sendEmail, NURTURE_FROM_EMAIL, NURTURE_REPLY_TO, LIST_UNSUBSCRIBE_MAILTO } from "@/lib/email";
import { generateUnsubscribeToken } from "@/lib/tokens";
import { listUnsubscribeHeaders, publicUnsubscribeUrl } from "@/lib/unsubscribe";

const BATCH = 50;

async function run(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Kill switch BEFORE any DB access: when off this route is a pure no-op.
  if (!isDripSendingEnabled()) return NextResponse.json({ enabled: false, sent: 0 });

  const now = new Date();
  const rows = await db.select({ t: trialAccounts, c: contacts }).from(trialAccounts)
    .innerJoin(contacts, eq(trialAccounts.contactId, contacts.id))
    .where(and(eq(trialAccounts.planStatus, "trial"), inArray(trialAccounts.product, [...NURTURE_PRODUCTS]))).limit(BATCH);
  let sent = 0, skipped = 0, failed = 0, held = 0;

  for (const { t, c } of rows) {
    // Excluded workspaces / contacts: never auto-send, never claim a step (no DB write).
    if (isExcludedWorkspace(t) || isExcludedEmail(c.email)) {
      console.log(JSON.stringify({ level: "info", msg: "trial_nurture_hold_excluded", trialAccountId: t.id }));
      held++; continue;
    }
    const junk = junkReason(t, c);
    if (junk) {
      console.log(JSON.stringify({ level: "info", msg: "trial_nurture_hold_junk", trialAccountId: t.id, reason: junk }));
      held++; continue;
    }
    const done = await db.select({ step: trialNurtureSteps.step, status: trialNurtureSteps.status, createdAt: trialNurtureSteps.createdAt }).from(trialNurtureSteps).where(eq(trialNurtureSteps.trialAccountId, t.id));
    const sentTimes = done.filter((r) => r.status === "sent" || r.status === "sending").map((r) => (r.createdAt ? new Date(r.createdAt).getTime() : 0));
    const lastSentAt = sentTimes.length ? new Date(Math.max(...sentTimes)) : null;
    let d = decide({ ...t, product: t.product as any, planStatus: t.planStatus as any, unsubscribed: !!c.unsubscribed, sentSteps: done.map((r) => r.step as Step), lastSentAt }, now);
    if (d.action === "wait" || d.action === "stop") continue;
    // Sales sends email 05 manually for these tenants: record step 5 as skipped, never send it.
    if (d.action === "send" && d.step === 5 && isStep5ManualWorkspace(t)) d = { step: 5, action: "skip", reason: "manual_sales" };
    const key = sequenceKey(t.product)!;
    const copy = copyFor(key, d.step)!;
    // Copy not final (e.g. hosted_pbx / generic_softphone drafts): hold, don't send or claim.
    if (d.action === "send" && !copy.final) { held++; continue; }
    // Hold (don't send a broken link) when sip_domain / accountName needed by this step is missing.
    if (d.action === "send") {
      const missing = missingLinkFields(d.step, { sipDomain: t.sipDomain, accountName: t.accountName, trialEndsAt: t.trialEndsAt }, t.product);
      if (missing.length) {
        console.log(JSON.stringify({
          level: "info", msg: "trial_nurture_hold_missing_link_field",
          trialAccountId: t.id, appId: t.appId, step: d.step, missing,
        }));
        held++;
        continue;
      }
    }
    // Render before claiming so a leftover {token} holds (unclaimed, retried next run) instead of sending raw braces.
    const fields = { accountName: t.accountName, sipDomain: t.sipDomain, trialEndsAt: t.trialEndsAt, product: t.product, step: d.step };
    const text = d.action === "send" ? render(copy.body, c.firstname, fields) : "";
    const subject = d.action === "send" ? renderSubject(copy.subject, c.firstname, fields) : copy.subject;
    if (d.action === "send" && (UNFILLED_PLACEHOLDER_RE.test(text) || UNFILLED_PLACEHOLDER_RE.test(subject))) {
      console.log(JSON.stringify({
        level: "info", msg: "trial_nurture_hold_unfilled_placeholder", reason: "unfilled_placeholder",
        trialAccountId: t.id, appId: t.appId, step: d.step,
        tokens: [...new Set((subject + "\n" + text).match(/\{[a-zA-Z_]+\}/g) || [])],
      }));
      held++;
      continue;
    }
    // Claim the step first (unique (trial, step)) so concurrent runs can never double-send.
    const claimed = await db.insert(trialNurtureSteps)
      .values({ trialAccountId: t.id, step: d.step, status: d.action === "skip" ? "skipped" : "sending", reason: d.action === "skip" ? d.reason : null })
      .onConflictDoNothing().returning();
    if (!claimed.length || d.action === "skip") { skipped++; continue; }
    try {
      assertSafeNurtureText(text, t.sipDomain);
      // bccInternal was set at enrolment and must not be recomputed here.
      const bcc = t.bccInternal ? [trialNurtureBccAddress()] : undefined;
      // One unsubscribe token per send (same as the sequences worker), used for List-Unsubscribe (RFC 8058 one-click).
      const unsubToken = generateUnsubscribeToken();
      await db.insert(unsubscribeTokens).values({ token: unsubToken, contactId: c.id });
      const headers = listUnsubscribeHeaders(publicUnsubscribeUrl(unsubToken), LIST_UNSUBSCRIBE_MAILTO);
      const r = await sendEmail({ to: c.email, subject, text,
        from: NURTURE_FROM_EMAIL, replyTo: NURTURE_REPLY_TO, bcc, headers,
        tags: { nurture: key, step: String(d.step) },
        configurationSetName: process.env.SES_NURTURE_CONFIGURATION_SET || undefined });
      await db.update(trialNurtureSteps).set({ status: "sent", sesMessageId: r.id }).where(eq(trialNurtureSteps.id, claimed[0].id));
      // Observability: one CRM activity per send (contact timeline). Never fails the send.
      try {
        await db.insert(activities).values({ contactId: c.id, type: "email", performedBy: "trial-nurture",
          subject: `Trial nurture ${key} step ${d.step}: ${subject}`.slice(0, 500),
          body: `Auto-sent from ${NURTURE_FROM_EMAIL}. SES MessageId ${r.id ?? "n/a"}. app_id ${t.appId}.` });
      } catch (e: any) {
        console.log(JSON.stringify({ level: "warn", msg: "trial_nurture_activity_failed", trialAccountId: t.id, err: String(e?.name || "error") }));
      }
      console.log(JSON.stringify({ level: "info", msg: "trial_nurture_sent", trialAccountId: t.id, appId: t.appId, sequence: key, step: d.step, sesMessageId: r.id }));
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
