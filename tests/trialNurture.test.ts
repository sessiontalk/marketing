import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, render, TrialState } from "../src/lib/trialNurture/schedule";
import { isDripSendingEnabled, RETIRED_SEQUENCE_NAMES } from "../src/lib/killSwitch";
import { NURTURE_COPY } from "../src/lib/trialNurture/copy";

const H = 3_600_000, D = 24 * H, T0 = new Date("2026-11-01T09:00:00Z");
const base = (o: Partial<TrialState> = {}): TrialState => ({
  enrolledAt: T0, trialStartedAt: T0, trialEndsAt: new Date(T0.getTime() + 14 * D), projectCreatedAt: T0,
  extensionCount: 0, softphoneFirstLoginAt: null, firstCallAt: null, carrierConnectedAt: null,
  salesCallBookedAt: null, salesCallHeldAt: null, lastInboundReplyAt: null, paymentMethodAddedAt: null,
  planStatus: "trial", unsubscribed: false, sentSteps: [], ...o });
const at = (ms: number) => new Date(T0.getTime() + ms);

test("kill switch defaults off", () => {
  assert.equal(isDripSendingEnabled({}), false);
  assert.equal(isDripSendingEnabled({ DRIP_SENDING_ENABLED: "1" }), false);
  assert.equal(isDripSendingEnabled({ DRIP_SENDING_ENABLED: "true" }), true);
  assert.ok(RETIRED_SEQUENCE_NAMES.has("Welcome Drip"));
});
test("step 1 waits 1h then sends if no extension", () => {
  assert.equal(decide(base(), at(30 * 60_000)).action, "wait");
  assert.deepEqual(decide(base(), at(H)), { step: 1, action: "send" });
  assert.equal((decide(base({ extensionCount: 1 }), at(H)) as any).action, "skip");
});
test("step 2 day1 skip when login+call done", () => {
  const s = base({ sentSteps: [1] });
  assert.deepEqual(decide(s, at(D)), { step: 2, action: "send" });
  assert.equal((decide({ ...s, softphoneFirstLoginAt: T0, firstCallAt: T0 }, at(D)) as any).action, "skip");
  assert.deepEqual(decide({ ...s, softphoneFirstLoginAt: T0 }, at(D)), { step: 2, action: "send" });
});
test("step 3 day3 skip on carrier", () => {
  const s = base({ sentSteps: [1, 2] });
  assert.deepEqual(decide(s, at(3 * D)), { step: 3, action: "send" });
  assert.equal((decide({ ...s, carrierConnectedAt: T0 }, at(3 * D)) as any).reason, "carrier_connected");
});
test("step 4 day7 skips on sales call / recent reply / short trial", () => {
  const s = base({ sentSteps: [1, 2, 3] });
  assert.deepEqual(decide(s, at(7 * D)), { step: 4, action: "send" });
  assert.equal((decide({ ...s, salesCallBookedAt: T0 }, at(7 * D)) as any).reason, "sales_call");
  assert.equal((decide({ ...s, lastInboundReplyAt: at(6 * D) }, at(7 * D)) as any).reason, "recent_reply");
  assert.equal((decide({ ...s, trialEndsAt: at(8 * D) }, at(7 * D)) as any).reason, "collides_with_step5");
});
test("step 5 at end-48h, skip with card", () => {
  const s = base({ sentSteps: [1, 2, 3, 4] });
  assert.equal(decide(s, at(11 * D)).action, "wait");
  assert.deepEqual(decide(s, at(12 * D)), { step: 5, action: "send" });
  assert.equal((decide({ ...s, paymentMethodAddedAt: T0 }, at(12 * D)) as any).action, "skip");
});
test("stops on paid / cancelled / unsubscribed / trial end", () => {
  assert.equal(decide(base({ planStatus: "paid" }), at(D)).action, "stop");
  assert.equal(decide(base({ planStatus: "cancelled" }), at(D)).action, "stop");
  assert.equal(decide(base({ unsubscribed: true }), at(D)).action, "stop");
  assert.equal(decide(base(), at(15 * D)).action, "stop");
});
test("no backfill: steps due long before enrolment are skipped", () => {
  const s = base({ trialStartedAt: new Date(T0.getTime() - 10 * D), projectCreatedAt: new Date(T0.getTime() - 10 * D), trialEndsAt: at(4 * D) });
  assert.equal((decide(s, T0) as any).reason, "before_enrolment");
});
test("copy: 5 steps, plain text, step 3 not final, greeting fallback, no Microsoft", () => {
  assert.deepEqual(NURTURE_COPY.map((c) => c.step), [1, 2, 3, 4, 5]);
  assert.equal(NURTURE_COPY.find((c) => c.step === 3)!.final, false);
  for (const c of NURTURE_COPY) {
    assert.ok(c.body.startsWith("Hi {first_name},"));
    assert.ok(!/microsoft/i.test(c.body + c.subject));
    assert.ok(!/<[a-z]+[ >]/i.test(c.body));
  }
  assert.ok(render("Hi {first_name},\nx", "").startsWith("Hi there,"));
  assert.ok(render("Hi {first_name},\nx", "Sam").startsWith("Hi Sam,"));
});
