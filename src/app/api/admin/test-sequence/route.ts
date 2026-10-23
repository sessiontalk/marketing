import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { buildTestSend } from "@/lib/trialNurture/testSequence";
import { sendEmail, NURTURE_FROM_EMAIL, NURTURE_REPLY_TO, LIST_UNSUBSCRIBE_MAILTO } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * Admin-only: send selected approved nurture steps (default all 5) for a sample tenant to typed
 * address(es). No DB access at all (no trial_accounts / step rows / unsubscribe tokens), no BCC,
 * independent of DRIP_SENDING_ENABLED. Headers match production (List-Unsubscribe with a placeholder token).
 */
export async function POST(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  let plan;
  try {
    plan = buildTestSend({
      to: body?.to, sipDomain: body?.sipDomain, accountName: body?.accountName, firstName: body?.firstName,
      steps: body?.steps, productionSubject: body?.productionSubject === true,
    }, LIST_UNSUBSCRIBE_MAILTO);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
  const expected = plan.recipients.length * plan.steps.length;
  const results: Array<{ to: string; step: number; id?: string; error?: string; links: string[] }> = [];
  outer: for (const to of plan.recipients) {
    for (const s of plan.steps) {
      const links = s.text.match(/https?:\/\/[^\s)]+/g) || [];
      try {
        const r = await sendEmail({ to, subject: s.subject, text: s.text, headers: plan.headers,
          from: NURTURE_FROM_EMAIL, replyTo: NURTURE_REPLY_TO, tags: { nurture: "sessionpbx_trial_test", step: String(s.step) } });
        results.push({ to, step: s.step, id: r.id, links });
      } catch (e: any) {
        results.push({ to, step: s.step, error: String(e?.name || "error"), links });
        break outer; // stop on first failure
      }
    }
  }
  console.log(JSON.stringify({ level: "info", msg: "trial_nurture_test_sequence", by: (session as any)?.username ?? "admin",
    recipients: plan.recipients.length, steps: plan.steps.map((s) => s.step), productionSubject: body?.productionSubject === true,
    ok: results.filter((r) => r.id).length, failed: results.filter((r) => r.error).length }));
  return NextResponse.json({ ok: results.length === expected && results.every((r) => r.id), results });
}
