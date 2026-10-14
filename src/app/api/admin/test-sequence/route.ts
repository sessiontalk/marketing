import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { buildTestSequence } from "@/lib/trialNurture/testSequence";
import { sendEmail, NURTURE_FROM_EMAIL, NURTURE_REPLY_TO } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * Admin-only: send every approved nurture step for a sample tenant to ONE typed address.
 * No DB access at all (no trial_accounts / step rows), no BCC, independent of DRIP_SENDING_ENABLED.
 */
export async function POST(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  let steps;
  try {
    steps = buildTestSequence({ to: body?.to, sipDomain: body?.sipDomain, accountName: body?.accountName, firstName: body?.firstName });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
  const results: Array<{ step: number; id?: string; error?: string; links: string[] }> = [];
  for (const s of steps) {
    const links = s.text.match(/https?:\/\/[^\s)]+/g) || [];
    try {
      const r = await sendEmail({ to: String(body.to).trim(), subject: s.subject, text: s.text,
        from: NURTURE_FROM_EMAIL, replyTo: NURTURE_REPLY_TO, tags: { nurture: "sessionpbx_trial_test", step: String(s.step) } });
      results.push({ step: s.step, id: r.id, links });
    } catch (e: any) {
      results.push({ step: s.step, error: String(e?.name || "error"), links });
      break; // stop on first failure
    }
  }
  console.log(JSON.stringify({ level: "info", msg: "trial_nurture_test_sequence", by: (session as any)?.username ?? "admin", steps: results.map((r) => ({ step: r.step, ok: !!r.id })) }));
  return NextResponse.json({ ok: results.every((r) => r.id) && results.length === steps.length, results });
}