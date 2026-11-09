import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, render, sequenceKey, NURTURE_PRODUCTS, TrialState } from "../src/lib/trialNurture/schedule";
import { missingLinkFields, UNFILLED_PLACEHOLDER_RE } from "../src/lib/trialNurture/links";
import { NURTURE_SEQUENCES, copyFor } from "../src/lib/trialNurture/copy";
import {
  SIGNUP_PRODUCT,
  signupAppId,
  isSignupAppId,
  productFromTrialStarted,
  productStepsAlreadyCoveredBySignup,
  canEnrolSignupNurture,
} from "../src/lib/trialNurture/signupEnrolment";
import { isExcludedEmail, junkReason } from "../src/lib/trialNurture/exclusions";
import { SIGNUP_TO_PRODUCT_STEP_MAP } from "../src/lib/trialNurture/copySignupFinishSetup";

const D = 86_400_000;
const t0 = new Date("2026-11-09T12:00:00Z");
const signupState = (o: Partial<TrialState> = {}): TrialState => ({
  enrolledAt: t0,
  product: "signup_finish_setup",
  trialStartedAt: t0,
  trialEndsAt: null,
  projectCreatedAt: null,
  extensionCount: 0,
  softphoneFirstLoginAt: null,
  firstCallAt: null,
  carrierConnectedAt: null,
  salesCallBookedAt: null,
  salesCallHeldAt: null,
  lastInboundReplyAt: null,
  paymentMethodAddedAt: null,
  planStatus: "trial",
  unsubscribed: false,
  sentSteps: [],
  ...o,
});

test("signup_finish_setup is a nurture product with its own sequence key", () => {
  assert.equal(sequenceKey("signup_finish_setup"), "signup_finish_setup");
  assert.ok(NURTURE_PRODUCTS.includes("signup_finish_setup"));
  assert.equal(NURTURE_SEQUENCES.signup_finish_setup.length, 2);
  for (const c of NURTURE_SEQUENCES.signup_finish_setup) {
    assert.equal(c.final, false, "COPY_GAP steps must stay held");
    assert.match(c.body, /\[COPY_GAP/);
    assert.doesNotMatch(c.body, UNFILLED_PLACEHOLDER_RE);
  }
});

test("signup-only: step 1 due after 1h, step 2 after 2d; no project required", () => {
  assert.deepEqual(decide(signupState(), new Date(t0.getTime() + 2 * 3_600_000)), { step: 1, action: "send" });
  assert.deepEqual(
    decide(signupState({ sentSteps: [1] }), new Date(t0.getTime() + 2 * D + 1)),
    { step: 2, action: "send" },
  );
});

test("signup enrolment gate: unverified / junk / opted-out / Northwind / paid-already", () => {
  assert.equal(canEnrolSignupNurture({
    email: "a@b.co", emailVerified: false, unsubscribed: false,
    isExcludedEmail: false, junkReason: null, alreadyHasActiveTrial: false,
  }).ok, false);
  assert.equal((canEnrolSignupNurture({
    email: "a@b.co", emailVerified: false, unsubscribed: false,
    isExcludedEmail: false, junkReason: null, alreadyHasActiveTrial: false,
  }) as any).reason, "unverified_email");

  assert.equal(canEnrolSignupNurture({
    email: "a@b.co", emailVerified: true, unsubscribed: true,
    isExcludedEmail: false, junkReason: null, alreadyHasActiveTrial: false,
  }).ok, false);

  assert.equal(isExcludedEmail("demo-screens+20261104@sessiontalk.co.uk"), true);
  assert.equal(canEnrolSignupNurture({
    email: "demo-screens+20261104@sessiontalk.co.uk", emailVerified: true, unsubscribed: false,
    isExcludedEmail: true, junkReason: null, alreadyHasActiveTrial: false,
  }).ok, false);

  assert.equal(junkReason({ accountName: "Rome5871" }, { email: "x@y.co", firstname: "X", emailVerified: true }), "abuse_cluster_workspace");
  assert.equal(canEnrolSignupNurture({
    email: "x@y.co", emailVerified: true, unsubscribed: false,
    isExcludedEmail: false, junkReason: "abuse_cluster_workspace", alreadyHasActiveTrial: false,
  }).ok, false);

  assert.equal(canEnrolSignupNurture({
    email: "ok@ex.co", emailVerified: true, unsubscribed: false,
    isExcludedEmail: false, junkReason: null, alreadyHasActiveTrial: true,
  }).ok, false);

  assert.deepEqual(canEnrolSignupNurture({
    email: "ok@ex.co", emailVerified: true, unsubscribed: false,
    isExcludedEmail: false, junkReason: null, alreadyHasActiveTrial: false,
  }), { ok: true });
});

test("opted-out and paid stop decide()", () => {
  assert.deepEqual(decide(signupState({ unsubscribed: true }), new Date(t0.getTime() + 2 * 3_600_000)), { action: "stop", reason: "unsubscribed" });
  assert.deepEqual(decide(signupState({ planStatus: "paid" }), new Date(t0.getTime() + 2 * 3_600_000)), { action: "stop", reason: "converted" });
});

test("missing project placeholders hold: renderer leaves no literal tokens when fields absent; required fields empty for signup", () => {
  assert.deepEqual(missingLinkFields(1, {}, "signup_finish_setup"), []);
  assert.deepEqual(missingLinkFields(5, {}, "generic_softphone"), ["accountName", "trial_ends_date"]);
  // Softphone without trial end / account must hold at step 5
  const body = copyFor("generic_softphone", 5)!.body;
  const rendered = render(body, "Jo", { product: "generic_softphone", step: 5 });
  assert.match(rendered, UNFILLED_PLACEHOLDER_RE); // still has {accountName} or {trial_ends_date}
  // Signup gap bodies never introduce project tokens
  const gap = render(copyFor("signup_finish_setup", 1)!.body, "Jo", {});
  assert.doesNotMatch(gap, UNFILLED_PLACEHOLDER_RE);
});

test("trial.started product mapping and signup app id", () => {
  assert.equal(productFromTrialStarted({ product: "generic_softphone" }), "generic_softphone");
  assert.equal(productFromTrialStarted({ product: "hosted_pbx" }), "hosted_pbx");
  assert.equal(productFromTrialStarted({ product: "teams_phone" }), "teams_phone");
  assert.equal(productFromTrialStarted({ trial_type: "teams_hosted" }), "teams_phone");
  assert.equal(signupAppId("abc"), "signup:abc");
  assert.equal(isSignupAppId("signup:abc"), true);
  assert.equal(isSignupAppId("acme01"), false);
});

test("upgrade mapping: signup steps do not pre-mark product steps (no dupes)", () => {
  assert.deepEqual(SIGNUP_TO_PRODUCT_STEP_MAP, { 1: null, 2: null });
  assert.deepEqual(productStepsAlreadyCoveredBySignup([1, 2]), []);
  // After upgrade, product sequence starts clean — step 1 not considered already sent
  const afterUpgrade = signupState({ product: "generic_softphone", projectCreatedAt: t0, sentSteps: [] });
  assert.deepEqual(decide(afterUpgrade, new Date(t0.getTime() + 2 * 3_600_000)), { step: 1, action: "send" });
});
