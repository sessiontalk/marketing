import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { withDbErrors } from "@/lib/dbErrors";
import { contacts, trialAccounts, trialNurtureSteps } from "@/db/schema";
import { and, eq, gt, gte, inArray, isNull, or } from "drizzle-orm";
import { isDripSendingEnabled } from "@/lib/killSwitch";
import { NURTURE_PRODUCTS, sequenceKey, type Step } from "@/lib/trialNurture/schedule";
import { copyFor } from "@/lib/trialNurture/copy";
import { isExcludedWorkspace, isExcludedEmail, junkReason } from "@/lib/trialNurture/exclusions";
import { VERIFY_REMINDER_PRODUCT, SIGNUP_PRODUCT, contactTrialHistory, signupCreatedAtOf } from "@/lib/trialNurture/signupEnrolment";
import { lateFirstStepConfig, countsAsEmailed } from "@/lib/trialNurture/queue";
import { assessNurtureHealth, type HealthRow } from "@/lib/trialNurture/nurtureHealth";
import { nurtureAlert } from "@/lib/trialNurture/alerts";

/**
 * Daily nurture health check (cron, Bearer CRON_SECRET; under the already-public /api/worker/ prefix,
 * so the middleware allowlist is unchanged). Read-only on the DB; the only side effect is an alert
 * (log line always; email only when NURTURE_ALERT_EMAIL_ENABLED=true). Returns 503 when unhealthy.
 */
async function run(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Kill switch off = nothing is meant to send, so nothing is overdue.
  if (!isDripSendingEnabled()) return NextResponse.json({ enabled: false, ok: true });

  const now = new Date();
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const enrolledSince = new Date(now.getTime() - 14 * 24 * 3_600_000);
  const queued = await db.select({ t: trialAccounts, c: contacts }).from(trialAccounts)
    .innerJoin(contacts, eq(trialAccounts.contactId, contacts.id))
    .where(and(
      eq(trialAccounts.planStatus, "trial"),
      inArray(trialAccounts.product, [...NURTURE_PRODUCTS]),
      or(isNull(trialAccounts.trialEndsAt), gt(trialAccounts.trialEndsAt, now)),
      gte(trialAccounts.enrolledAt, enrolledSince),
    ));
  const ids = queued.map((r) => r.t.id);
  const steps = ids.length
    ? await db.select({ id: trialNurtureSteps.trialAccountId, step: trialNurtureSteps.step, status: trialNurtureSteps.status, reason: trialNurtureSteps.reason })
      .from(trialNurtureSteps).where(inArray(trialNurtureSteps.trialAccountId, ids))
    : [];
  const others = ids.length
    ? await db.select({ contactId: trialAccounts.contactId, id: trialAccounts.id, product: trialAccounts.product, projectCreatedAt: trialAccounts.projectCreatedAt })
      .from(trialAccounts).where(inArray(trialAccounts.contactId, queued.map((r) => r.c.id)))
    : [];
  const recent = await db.select({ trialAccountId: trialNurtureSteps.trialAccountId, step: trialNurtureSteps.step, status: trialNurtureSteps.status, reason: trialNurtureSteps.reason })
    .from(trialNurtureSteps).where(gte(trialNurtureSteps.createdAt, since));

  const rows: HealthRow[] = queued.map(({ t, c }) => {
    const mine = steps.filter((s) => s.id === t.id && s.step > 0);
    const emailed = mine.filter(countsAsEmailed).map((s) => s.step);
    const isSignup = t.product === SIGNUP_PRODUCT || t.product === VERIFY_REMINDER_PRODUCT;
    const h = isSignup ? contactTrialHistory(others.filter((o) => o.contactId === c.id && o.id !== t.id)) : null;
    const key = sequenceKey(t.product);
    let holdReason: string | null = null;
    if (isExcludedWorkspace(t) || isExcludedEmail(c.email)) holdReason = "excluded";
    else holdReason = junkReason(t, c, { allowUnverified: t.product === VERIFY_REMINDER_PRODUCT });
    if (!holdReason && key && copyFor(key, 1) && !copyFor(key, 1)!.final) holdReason = "copy_not_final";
    return {
      id: t.id, appId: t.appId, product: t.product, emailedSteps: emailed, holdReason,
      state: { ...t, product: t.product as any, planStatus: t.planStatus as any, unsubscribed: !!c.unsubscribed,
        emailVerified: !!c.emailVerified, sentSteps: mine.map((s) => s.step as Step), lastSentAt: null,
        ...(h ? { contactHasPriorProductTrial: h.hasPriorProductTrial, contactHasProject: h.hasProject, signupCreatedAt: signupCreatedAtOf(c) } : {}) },
    };
  });
  const result = assessNurtureHealth({
    now, rows,
    sentLast24h: recent.filter((s) => s.status === "sent").length,
    failedLast24h: recent.filter((s) => s.status === "failed").map((s) => ({ trialAccountId: s.trialAccountId, step: s.step, reason: s.reason })),
    lateFirstStepMaxHours: lateFirstStepConfig().maxHours,
  });
  for (const a of result.alerts) {
    await nurtureAlert(a.kind, a.summary, { overdue: result.overdue.slice(0, 30), failed: result.failedLast24h.slice(0, 30), sentLast24h: result.sentLast24h });
  }
  return NextResponse.json({ enabled: true, ...result }, { status: result.ok ? 200 : 503 });
}

const handler = withDbErrors(run);
export const GET = handler; // system cron (crm-worker nurture-health) invokes GET with Bearer CRON_SECRET
export const POST = handler;
