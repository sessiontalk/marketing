import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { preSendSkipReason, preSendDecision, newPreSendRunState, sesConfigurationSetFor, recipientTag } from "../src/lib/sendGuard";
import { normalizeEmail, assertSendable, type SuppressionStore } from "../src/lib/suppression";
import { runBroadcast, type BroadcastDeps } from "../src/lib/newsletterBroadcast";
import { newsletterSesOptions } from "../src/lib/newsletter";
import { buildSendEmailInput } from "../src/lib/email";

/** In-memory stand-in for contacts.unsubscribed (any row, matched on lower(email)), with the reason that set it. */
function memStore(rows: Record<string, string> = {}) {
  const set = new Map(Object.entries(rows).map(([e, r]) => [normalizeEmail(e), r]));
  const store: SuppressionStore = {
    async suppressed(emails) { return new Set(emails.map(normalizeEmail).filter((e) => set.has(e))); },
    async suppress(email, source) { const n = normalizeEmail(email); const created = !set.has(n); set.set(n, source); return { created }; },
  };
  return { store, set };
}
const recipients = {
  normal: "new.trial@example.com",
  unsubscribed: "Left.List@Example.com",       // /api/unsubscribe or CRM PATCH
  complaint: "angry@hotmail.example",           // SES complaint via the events worker (ses_complaint)
  hardBounce: "gone@example.org",               // SES permanent bounce (ses_hard_bounce)
};
const store = () => memStore({ "left.list@example.com": "unsubscribe_link", "angry@hotmail.example": "ses_complaint", "gone@example.org": "ses_hard_bounce" }).store;

for (const stream of ["sequence", "trial_nurture", "newsletter"] as const) {
  test(`pre-send check (${stream}): normal sends; unsubscribed, complaint-suppressed and hard-bounced are skipped`, async () => {
    const logs: Array<Record<string, unknown>> = [];
    const s = store();
    assert.equal(await preSendSkipReason(recipients.normal, stream, s, (l) => logs.push(l)), null);
    assert.equal(await preSendSkipReason(recipients.unsubscribed, stream, s, (l) => logs.push(l)), "suppressed");
    assert.equal(await preSendSkipReason("ANGRY@hotmail.example", stream, s, (l) => logs.push(l)), "suppressed");
    assert.equal(await preSendSkipReason(recipients.hardBounce, stream, s, (l) => logs.push(l)), "suppressed");
    assert.equal(await preSendSkipReason("not-an-address", stream, s, (l) => logs.push(l)), "invalid");
    assert.equal(logs.length, 4);
    for (const l of logs) { assert.equal(l.msg, "email_send_skipped"); assert.equal(l.stream, stream); assert.match(String(l.recipient), /^[0-9a-f]{16}$/); }
    assert.doesNotMatch(JSON.stringify(logs), /@|angry|gone|left\.list/i);
  });
}

test("pre-send check: a store error propagates (the caller records a failure instead of sending blind)", async () => {
  const broken: SuppressionStore = { async suppressed() { throw new Error("db down"); }, async suppress() { return { created: false }; } };
  await assert.rejects(preSendSkipReason(recipients.normal, "sequence", broken, () => {}), /db down/);
});

test("recipientTag is stable and case-insensitive", () => {
  assert.equal(recipientTag("A@B.com"), recipientTag(" a@b.com "));
  assert.equal(recipientTag("a@b.com").length, 16);
});

test("configuration set: unset env = omitted (send as today); SES_CONFIGURATION_SET for every stream; nurture override kept", () => {
  for (const s of ["sequence", "trial_nurture", "newsletter"] as const) assert.equal(sesConfigurationSetFor(s, {}), undefined);
  const env = { SES_CONFIGURATION_SET: " marketing-newsletter " };
  for (const s of ["sequence", "trial_nurture", "newsletter"] as const) assert.equal(sesConfigurationSetFor(s, env), "marketing-newsletter");
  assert.equal(sesConfigurationSetFor("trial_nurture", { ...env, SES_NURTURE_CONFIGURATION_SET: "nurture-set" }), "nurture-set");
  assert.equal(sesConfigurationSetFor("sequence", { SES_NURTURE_CONFIGURATION_SET: "nurture-set" }), undefined);
  assert.equal(buildSendEmailInput({ to: "a@b.com", subject: "s", text: "t", configurationSetName: sesConfigurationSetFor("sequence", {}) }).ConfigurationSetName, undefined);
  assert.equal(buildSendEmailInput({ to: "a@b.com", subject: "s", text: "t", configurationSetName: sesConfigurationSetFor("sequence", env) }).ConfigurationSetName, "marketing-newsletter");
  assert.deepEqual(newsletterSesOptions(undefined, {}), {});
  assert.equal(newsletterSesOptions(undefined, env).configurationSetName, "marketing-newsletter");
});

test("newsletter broadcast skips complaint-suppressed, hard-bounced and unsubscribed recipients at send time", async () => {
  const s = store();
  const sent: string[] = [];
  const deps: BroadcastDeps = {
    assertSendable: (e) => assertSendable(e, s),
    ensureContact: async (e) => `id-${e}`,
    claim: async () => true,
    sendOne: async (p) => { sent.push(p.email); return { id: "m" }; },
    recordFailure: async () => {},
    sleep: async () => {},
    log: () => {},
  };
  const plan = Object.values(recipients).map((email) => ({ email: normalizeEmail(email), variant: "A1" } as any));
  const r = await runBroadcast(plan, deps, { campaign: "c", ratePerSecond: 1000, maxFailureRate: 1 });
  assert.deepEqual(sent, [recipients.normal]);
  assert.equal(r.skipped, 3);
});

test("every CRM send path runs the pre-send check before sending and passes the configuration set", () => {
  const seq = readFileSync("src/app/api/worker/sequences/route.ts", "utf8");
  assert.match(seq, /preSendDecision\(contact\.email, "sequence", dbSuppressionStore, preSendState\)[\s\S]*sendEmail\(/);
  assert.match(seq, /configurationSetName: sesConfigurationSetFor\("sequence"\)/);
  const tn = readFileSync("src/app/api/worker/trial-nurture/route.ts", "utf8");
  assert.match(tn, /preSendDecision\(c\.email, "trial_nurture", dbSuppressionStore, preSendState\)[\s\S]*sendEmail\(/);
  assert.match(tn, /configurationSetName: sesConfigurationSetFor\("trial_nurture"\)/);
  assert.doesNotMatch(tn, /SES_NURTURE_CONFIGURATION_SET/);
  const adminTest = readFileSync("src/app/api/admin/test-sequence/route.ts", "utf8");
  assert.match(adminTest, /configurationSetName: sesConfigurationSetFor\("trial_nurture"\)/);
  const nl = readFileSync("src/lib/newsletter.ts", "utf8");
  assert.match(nl, /sesConfigurationSetFor\("newsletter", env\)/);
  const script = readFileSync("scripts/newsletter-issue01/send-newsletter-issue01.ts", "utf8");
  assert.match(script, /assertSendable/);
});

// ── Failed suppression lookup: defer (retry next run), never fail/skip the step, never send ──

/** Store whose lookup fails until `heal()` is called (DB blip between cron runs). */
function flakyStore(rows: Record<string, string> = {}) {
  let broken = true;
  const inner = memStore(rows).store;
  const store: SuppressionStore = {
    async suppressed(emails) { if (broken) { const e = new Error("connect ETIMEDOUT someone@example.com"); e.name = "NeonDbError"; throw e; } return inner.suppressed(emails); },
    suppress: inner.suppress,
  };
  return { store, heal: () => { broken = false; } };
}

/**
 * Minimal model of one worker run, mirroring the route order: decision BEFORE any step write
 * (trial-nurture: before the claim insert; sequences: before the enrolment update / token / send).
 */
type Step = { to: string; status: "pending" | "sent" | "skipped" | "failed"; reason?: string };
async function workerRun(stream: "sequence" | "trial_nurture", steps: Step[], store: SuppressionStore, logs: Array<Record<string, unknown>>, sent: string[]) {
  const state = newPreSendRunState();
  const out = { sent: 0, skipped: 0, held: 0 };
  for (const s of steps.filter((x) => x.status === "pending")) {
    const pre = await preSendDecision(s.to, stream, store, state, (l) => logs.push(l));
    if (pre.action === "defer") { out.held++; continue; }
    if (pre.action === "skip") { s.status = "skipped"; s.reason = pre.reason; out.skipped++; continue; }
    sent.push(s.to); s.status = "sent"; out.sent++;
  }
  return out;
}

for (const stream of ["sequence", "trial_nurture"] as const) {
  test(`${stream}: a lookup error leaves steps pending and sends nothing; the next run succeeds`, async () => {
    const f = flakyStore({ "angry@hotmail.example": "ses_complaint" });
    const steps: Step[] = [{ to: "a@example.com", status: "pending" }, { to: "b@example.com", status: "pending" }, { to: "angry@hotmail.example", status: "pending" }];
    const logs: Array<Record<string, unknown>> = []; const sent: string[] = [];
    const r1 = await workerRun(stream, steps, f.store, logs, sent);
    assert.deepEqual(r1, { sent: 0, skipped: 0, held: 3 });
    assert.deepEqual(sent, []);
    assert.ok(steps.every((s) => s.status === "pending"));          // not failed, not skipped: retryable
    assert.equal(logs.length, 1);                                    // logged once per run, not per recipient
    assert.equal(logs[0].msg, "email_suppression_lookup_failed_deferred");
    assert.equal(logs[0].err, "NeonDbError");
    assert.doesNotMatch(JSON.stringify(logs), /@|ETIMEDOUT/);         // no address, no raw error text
    f.heal();
    const r2 = await workerRun(stream, steps, f.store, logs, sent);
    assert.deepEqual(r2, { sent: 2, skipped: 1, held: 0 });
    assert.deepEqual(sent, ["a@example.com", "b@example.com"]);
    assert.equal(steps[2].status, "skipped");                        // complaint still never sent
  });
}

test("preSendDecision maps send / skip / defer", async () => {
  const s = store(); const st = newPreSendRunState();
  assert.deepEqual(await preSendDecision("new.trial@example.com", "sequence", s, st, () => {}), { action: "send" });
  assert.deepEqual(await preSendDecision("angry@hotmail.example", "sequence", s, st, () => {}), { action: "skip", reason: "suppressed" });
  assert.deepEqual(await preSendDecision("x@example.com", "sequence", flakyStore().store, st, () => {}), { action: "defer" });
});

test("workers: defer happens before any step write (no claim, no failed/skipped mark, no send)", () => {
  const tn = readFileSync("src/app/api/worker/trial-nurture/route.ts", "utf8");
  const tDefer = tn.indexOf('if (pre.action === "defer") { held++; continue; }');
  const tClaim = tn.indexOf("const claimed = await db.insert(trialNurtureSteps)");
  assert.ok(tDefer > 0 && tClaim > tDefer, "trial-nurture defers before claiming the step");
  assert.doesNotMatch(tn, /status: "failed"[^\n]*suppress/i);
  const seq = readFileSync("src/app/api/worker/sequences/route.ts", "utf8");
  const sDefer = seq.indexOf('if (pre.action === "defer") continue;');
  assert.ok(sDefer > 0 && seq.indexOf("generateUnsubscribeToken()", sDefer) > sDefer && seq.indexOf("sendEmail({", sDefer) > sDefer, "sequences defers before token/send");
  assert.ok(seq.indexOf("preSendState = newPreSendRunState()") > 0 && tn.indexOf("preSendState = newPreSendRunState()") > 0);
});
