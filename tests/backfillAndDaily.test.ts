import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "../src/lib/trialNurture/schedule";
import { planBackfill, STEP1_SENT_AT } from "../src/lib/trialNurture/backfill";
import { isExcludedEmail } from "../src/lib/trialNurture/exclusions";

const D = 86_400_000;
const st = (over: any = {}) => ({
  product: "teams_phone" as const, enrolledAt: new Date("2026-10-06T16:11:00Z"), trialStartedAt: new Date("2026-10-06T16:11:00Z"),
  trialEndsAt: new Date("2026-10-20T16:11:00Z"), projectCreatedAt: new Date("2026-10-06T16:11:00Z"), extensionCount: 0,
  softphoneFirstLoginAt: null, firstCallAt: null, carrierConnectedAt: null, salesCallBookedAt: null, salesCallHeldAt: null,
  lastInboundReplyAt: null, paymentMethodAddedAt: null, planStatus: "trial" as const, unsubscribed: false, sentSteps: [1] as any[], ...over,
});

test("backfilled trial continues from email 02 (step 1 recorded 12 Oct)", () => {
  assert.deepEqual(decide(st({ lastSentAt: STEP1_SENT_AT }), new Date("2026-10-14T18:00:00Z")), { step: 2, action: "send" });
});

test("max one email per day: overdue step 4 waits 24h after step 2; non-email skips still proceed", () => {
  const now = new Date("2026-10-14T18:10:00Z");
  const after2 = st({ sentSteps: [1, 2], lastSentAt: new Date("2026-10-14T18:00:00Z") });
  // step 3 is a skip for teams_phone (no email) -> allowed immediately
  assert.deepEqual(decide(after2, now), { step: 3, action: "skip", reason: "teams_phone_plan" });
  const d = decide({ ...after2, sentSteps: [1, 2, 3] }, now);
  assert.equal(d.action, "wait");
  assert.equal((d as any).nextAt.getTime(), new Date("2026-10-14T18:00:00Z").getTime() + D);
  assert.deepEqual(decide({ ...after2, sentSteps: [1, 2, 3] }, new Date("2026-10-15T18:00:01Z")), { step: 4, action: "send" });
});

test("no lastSentAt: unchanged behaviour", () => {
  assert.deepEqual(decide(st({ sentSteps: [] }), new Date("2026-10-06T18:00:00Z")), { step: 1, action: "send" });
});

test("backfill plan: only active Teams trials", () => {
  const now = new Date("2026-10-14T18:00:00Z");
  const base = { email: "A@x.com", appId: "app1", accountName: "Acme", sipDomain: "acme.asia.sip.sessiontalk.io", product: "teams_phone", planStatus: "trial", trialStartedAt: "2026-10-06T00:00:00Z", trialEndsAt: "2026-10-20T00:00:00Z" };
  const { eligible, skipped } = planBackfill([
    base,
    { ...base, appId: "a2", sipDomain: "soft.uk.sip.sessiontalk.io", product: "generic_softphone" },
    { ...base, appId: "a3", sipDomain: "paid.us.sip.sessiontalk.io", planStatus: "paid" },
    { ...base, appId: "a4", sipDomain: "old.us.sip.sessiontalk.io", trialEndsAt: "2026-10-13T00:00:00Z" },
  ], now);
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].email, "a@x.com");
  assert.equal(eligible[0].slug, "acme");
  assert.deepEqual(skipped.map((s) => s.reason), ["not_teams", "plan_paid", "trial_ended"]);
});

test("12 Oct recipients removed from exclusions; internal/manual holds kept", () => {
  for (const e of ["abdulazeez@servy.ae", "manan@superproducer.ai", "henhenbak2000@gmail.com"]) assert.equal(isExcludedEmail(e), false);
  for (const e of ["naumansulaiman@googlemail.com", "nauman@sessiontalk.co.uk", "voxiotelecom@outlook.com", "rtownsend9999@gmail.com"]) assert.equal(isExcludedEmail(e), true);
});