import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTestSequence, isTeamsProduct } from "../src/lib/trialNurture/testSequence";
import { decide } from "../src/lib/trialNurture/schedule";

const base = () => ({
  enrolledAt: new Date("2026-10-14T10:00:00Z"), trialStartedAt: new Date("2026-10-14T10:00:00Z"),
  trialEndsAt: new Date("2026-10-28T10:00:00Z"), projectCreatedAt: new Date("2026-10-14T10:00:00Z"),
  extensionCount: 0, softphoneFirstLoginAt: null, firstCallAt: null, carrierConnectedAt: null,
  salesCallBookedAt: null, salesCallHeldAt: null, lastInboundReplyAt: null, paymentMethodAddedAt: null,
  planStatus: "trial" as const, unsubscribed: false, sentSteps: [] as any[],
});
const now = new Date("2026-10-14T12:00:00Z");

test("Teams-only: hosted trials stop, teams_phone/teams_business proceed", () => {
  assert.deepEqual(decide({ ...base(), product: "hosted" }, now), { action: "stop", reason: "not_teams" });
  assert.deepEqual(decide({ ...base(), product: "teams_phone" }, now), { step: 1, action: "send" });
  assert.deepEqual(decide({ ...base(), product: "teams_business" }, now), { step: 1, action: "send" });
  assert.equal(isTeamsProduct("hosted"), false);
  assert.equal(isTeamsProduct("teams_business"), true);
});

test("test sequence renders all 5 steps with EU links and no .uk", () => {
  const steps = buildTestSequence({ to: "someone@example.com", sipDomain: "bcrsa2026.uk.sip.sessiontalk.io" });
  assert.equal(steps.length, 5);
  const all = steps.map((s) => s.text).join("\n");
  assert.match(all, /https:\/\/bcrsa2026\.eu\.sessiontalk\.io\/admin\/team/);
  assert.match(all, /https:\/\/bcrsa2026\.eu\.sessiontalk\.io\/admin\/routing/);
  assert.match(all, /https:\/\/cloud\.sessiontalk\.io\/billing\/bcrsa2026/);
  assert.doesNotMatch(all, /\.uk\./);
  assert.ok(steps.every((s) => s.subject.startsWith("[TEST ")));
  assert.ok(all.includes("Maryam Fatima"));
});

test("test sequence rejects empty or bad recipients and bad sip_domain", () => {
  for (const to of ["", "not-an-email", "a@b.com, not-an-email", "a@b.com <c@d.com>"])
    assert.throws(() => buildTestSequence({ to, sipDomain: "x.eu.sessiontalk.io" }));
  assert.throws(() => buildTestSequence({ to: "a@b.com", sipDomain: "x.uk.sessiontalk.io" }));
  assert.throws(() => buildTestSequence({ to: "a@b.com", sipDomain: "evil.com" }));
});