import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, skipReason, sequenceKey, NURTURE_PRODUCTS, TrialState, render } from "../src/lib/trialNurture/schedule";
import { NURTURE_SEQUENCES, copyFor } from "../src/lib/trialNurture/copy";
import { missingLinkFields, assertSafeNurtureText } from "../src/lib/trialNurture/links";
import { TrialEvent } from "../src/lib/trialNurture/events";

const D = 86_400_000;
const t0 = new Date("2026-11-02T10:00:00Z");
const base = (p: TrialState["product"], o: Partial<TrialState> = {}): TrialState => ({
  enrolledAt: t0, product: p, trialStartedAt: t0, trialEndsAt: new Date(t0.getTime() + 14 * D),
  projectCreatedAt: t0, extensionCount: 0, softphoneFirstLoginAt: null, firstCallAt: null,
  carrierConnectedAt: null, salesCallBookedAt: null, salesCallHeldAt: null, lastInboundReplyAt: null,
  paymentMethodAddedAt: null, planStatus: "trial", unsubscribed: false, sentSteps: [], ...o,
});

test("sequence key per product; new products are enrolled", () => {
  assert.equal(sequenceKey("teams_phone"), "sessionpbx_trial");
  assert.equal(sequenceKey("teams_business"), "sessionpbx_trial");
  assert.equal(sequenceKey("hosted_pbx"), "hosted_pbx");
  assert.equal(sequenceKey("generic_softphone"), "generic_softphone");
  assert.equal(sequenceKey("hosted"), null);
  assert.deepEqual([...NURTURE_PRODUCTS].sort(), ["generic_softphone", "hosted_pbx", "teams_business", "teams_phone"]);
  assert.deepEqual(decide(base("hosted"), t0), { action: "stop", reason: "no_sequence" });
});

test("hosted_pbx uses Teams timing and sends step 3 unless a trunk is connected", () => {
  assert.deepEqual(decide(base("hosted_pbx"), new Date(t0.getTime() + 2 * 3_600_000)), { step: 1, action: "send" });
  const s3 = base("hosted_pbx", { sentSteps: [1, 2] });
  assert.equal(skipReason(3, s3, t0), null);
  assert.equal(skipReason(3, { ...s3, carrierConnectedAt: t0 }, t0), "carrier_connected");
  assert.equal(skipReason(2, base("hosted_pbx", { softphoneFirstLoginAt: t0, firstCallAt: t0 }), t0), "softphone_and_call_done");
});

test("generic_softphone skip rules", () => {
  assert.equal(skipReason(2, base("generic_softphone", { softphoneFirstLoginAt: t0 }), t0), "softphone_login_done");
  assert.equal(skipReason(3, base("generic_softphone", { carrierConnectedAt: t0 }), t0), null);
  assert.equal(skipReason(1, base("generic_softphone", { extensionCount: 1 }), t0), "has_extension");
  assert.equal(skipReason(5, base("generic_softphone", { paymentMethodAddedAt: t0 }), t0), "card_or_paid");
});

test("teams_phone behaviour unchanged", () => {
  assert.equal(skipReason(3, base("teams_phone"), t0), "teams_phone_plan");
  assert.equal(copyFor("sessionpbx_trial", 1)!.final, true);
});

test("new sequences: 5 steps; softphone final, hosted held; content rules", () => {
  for (const key of ["hosted_pbx", "generic_softphone"] as const) {
    const seq = NURTURE_SEQUENCES[key];
    assert.deepEqual(seq.map((c) => c.step), [1, 2, 3, 4, 5]);
  }
  for (const c of NURTURE_SEQUENCES.hosted_pbx) {
    assert.equal(c.final, false, `hosted_pbx ${c.step} must stay held until approved`);
    assert.match(c.body, /\n\nMaryam\nSessionTalk\nmaryam@sessiontalk\.co\.uk$/);
    assert.doesNotMatch(c.body + c.subject, /white[- ]?label|private[- ]?label|3cx|yeastar|15[- ]minute|self[- ]host/i);
    for (const u of c.body.match(/https?:\/\/[^\s)]+/g) || []) assert.match(u, /^https:\/\/cloud\.sessiontalk\.co\.uk(\/|$)/);
    const text = render(c.body, "Jo", { accountName: "acme01" });
    assert.doesNotMatch(text, /\{[a-z_]+\}/i);
    assertSafeNurtureText(text, null);
  }
  for (const c of NURTURE_SEQUENCES.generic_softphone) {
    assert.equal(c.final, true, `generic_softphone ${c.step} approved final=true`);
    assert.ok(!!c.html, `generic_softphone ${c.step} html present`);
    assert.doesNotMatch(c.body + (c.html || ""), /provider_directory_url|voip-providers|\{docs_url\}/);
  }
  assert.doesNotMatch(NURTURE_SEQUENCES.hosted_pbx.map((c) => c.body).join(), /\$/);
  assert.match(copyFor("generic_softphone", 5)!.body, /\$50\/month including 25 users, then \$2\/month for each extra user/);
});

test("link fields: softphone step 5 needs accountName + trial_ends_date; hosted needs accountName; no sip_domain", () => {
  for (const p of ["hosted_pbx", "generic_softphone"]) {
    assert.deepEqual(missingLinkFields(1, {}, p), []);
  }
  // Step 5 needing trial_ends_date is intended for generic_softphone only.
  assert.deepEqual(missingLinkFields(5, {}, "generic_softphone"), ["accountName", "trial_ends_date"]);
  assert.deepEqual(missingLinkFields(5, {}, "hosted_pbx"), ["accountName"]);
  assert.deepEqual(missingLinkFields(1, {}, "teams_phone"), ["sip_domain"]);
});

test("receiver accepts the new products and trial_type", () => {
  const ok = TrialEvent.safeParse({ event: "trial.started", event_id: "e1", occurred_at: t0.toISOString(), email: "a@b.co", app_id: "x", product: "generic_softphone", trial_type: "generic_softphone" });
  assert.equal(ok.success, true);
  assert.equal(TrialEvent.safeParse({ event: "trial.started", event_id: "e1", occurred_at: t0.toISOString(), email: "a@b.co", product: "nope" }).success, false);
});
