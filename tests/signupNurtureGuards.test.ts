import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decide, TrialState } from "../src/lib/trialNurture/schedule";
import {
  canEnrolSignupNurture,
  SIGNUP_NURTURE_MAX_ACCOUNT_AGE_DAYS,
  isTrialRowActive,
  isTrialRowStale,
  contactTrialHistory,
  signupCreatedAtOf,
  signupAccountTooOld,
} from "../src/lib/trialNurture/signupEnrolment";

const D = 86_400_000;
const now = new Date("2026-11-10T13:14:00Z");
const base = {
  email: "ok@ex.co", emailVerified: true, unsubscribed: false,
  isExcludedEmail: false, junkReason: null, alreadyHasActiveTrial: false,
  now,
};

const signupState = (o: Partial<TrialState> = {}): TrialState => ({
  enrolledAt: now,
  product: "signup_finish_setup",
  trialStartedAt: now,
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
  emailVerified: true,
  sentSteps: [],
  ...o,
});

test("age cap constant is 14 days", () => {
  assert.equal(SIGNUP_NURTURE_MAX_ACCOUNT_AGE_DAYS, 14);
});

test("cancelled prior product trial excludes signup nurture", () => {
  const rows = [{ product: "teams_phone", planStatus: "cancelled", trialEndsAt: new Date(now.getTime() - 20 * D), projectCreatedAt: null }];
  const h = contactTrialHistory(rows);
  assert.equal(h.hasPriorProductTrial, true);
  assert.deepEqual(canEnrolSignupNurture({ ...base, ...h, signupCreatedAt: new Date(now.getTime() - 2 * D) }),
    { ok: false, reason: "has_prior_product_trial" });
});

test("a project (any row) excludes signup nurture", () => {
  const h = contactTrialHistory([{ product: "signup_finish_setup", planStatus: "cancelled", projectCreatedAt: new Date(now.getTime() - D) }]);
  assert.deepEqual(h, { hasPriorProductTrial: false, hasProject: true });
  assert.deepEqual(canEnrolSignupNurture({ ...base, ...h }), { ok: false, reason: "has_project" });
});

test("signup-only rows are not a prior product trial", () => {
  const h = contactTrialHistory([{ product: "signup_verify_reminder", planStatus: "trial", projectCreatedAt: null }]);
  assert.deepEqual(h, { hasPriorProductTrial: false, hasProject: false });
  assert.deepEqual(canEnrolSignupNurture({ ...base, ...h, signupCreatedAt: now }), { ok: true });
});

test("stale 'trial' row is judged by trial_ends_at: not active, still a prior trial", () => {
  const stale = { product: "teams_phone", planStatus: "trial", trialEndsAt: new Date(now.getTime() - D), projectCreatedAt: null };
  const live = { ...stale, trialEndsAt: new Date(now.getTime() + D) };
  assert.equal(isTrialRowStale(stale, now), true);
  assert.equal(isTrialRowActive(stale, now), false);
  assert.equal(isTrialRowActive(live, now), true);
  assert.equal(isTrialRowActive({ ...stale, trialEndsAt: null }, now), true);
  assert.equal(isTrialRowActive({ ...stale, planStatus: "paid" }, now), true);
  assert.equal(isTrialRowActive({ ...stale, planStatus: "cancelled", trialEndsAt: null }, now), false);
  assert.equal(contactTrialHistory([stale]).hasPriorProductTrial, true);
});

test("15+ day accounts are rejected, 13-day accepted, measured at enrolment", () => {
  assert.deepEqual(canEnrolSignupNurture({ ...base, signupCreatedAt: new Date(now.getTime() - 15 * D) }),
    { ok: false, reason: "account_too_old" });
  assert.deepEqual(canEnrolSignupNurture({ ...base, signupCreatedAt: new Date(now.getTime() - 35 * D) }),
    { ok: false, reason: "account_too_old" });
  assert.deepEqual(canEnrolSignupNurture({ ...base, signupCreatedAt: new Date(now.getTime() - 13 * D) }), { ok: true });
  assert.equal(signupAccountTooOld(new Date(now.getTime() - 14 * D), now), false);
  assert.equal(signupAccountTooOld(null, now), false);
});

test("signup created date: original_created_at, then created_at", () => {
  const orig = new Date("2026-10-06T16:06:23Z");
  const crm = new Date("2026-10-06T16:06:24Z");
  assert.equal(signupCreatedAtOf({ originalCreatedAt: orig, createdAt: crm }), orig);
  assert.equal(signupCreatedAtOf({ originalCreatedAt: null, createdAt: crm }), crm);
  assert.equal(signupCreatedAtOf({}), null);
});

test("worker: already-enrolled contact with a cancelled prior trial is skipped at step 2", () => {
  const s = signupState({ sentSteps: [1], contactHasPriorProductTrial: true, signupCreatedAt: new Date(now.getTime() - 5 * D) });
  assert.deepEqual(decide(s, new Date(now.getTime() + 2 * D + 60_000)), { step: 2, action: "skip", reason: "has_prior_product_trial" });
});

test("worker: project on another row skips step 1", () => {
  assert.deepEqual(decide(signupState({ contactHasProject: true }), now), { step: 1, action: "skip", reason: "has_project" });
});

test("worker: old account (age at enrolment > 14d) is skipped", () => {
  const s = signupState({ sentSteps: [1], signupCreatedAt: new Date(now.getTime() - 35 * D) });
  assert.deepEqual(decide(s, new Date(now.getTime() + 2 * D + 60_000)), { step: 2, action: "skip", reason: "account_too_old" });
});

test("worker: 9-day-old account keeps step 2 even after it ages past 14 days by send time", () => {
  const s = signupState({ sentSteps: [1], signupCreatedAt: new Date(now.getTime() - 9 * D) });
  // Send 6 days later → 15 days old at send time, but the cap is measured at enrolment.
  assert.deepEqual(decide(s, new Date(now.getTime() + 6 * D)), { step: 2, action: "send" });
});

test("worker: guard fields unset keeps existing behaviour", () => {
  assert.deepEqual(decide(signupState(), now), { step: 1, action: "send" });
});

test("worker route passes the re-check into both decide() calls", () => {
  const src = readFileSync("src/app/api/worker/trial-nurture/route.ts", "utf8");
  assert.equal((src.match(/\.\.\.signupGuard \}, now\)/g) || []).length, 2);
  assert.match(src, /ne\(trialAccounts\.id, t\.id\)/);
});

test("trial route no longer hard-codes alreadyHasActiveTrial: false", () => {
  const src = readFileSync("src/app/api/events/trial/route.ts", "utf8");
  assert.doesNotMatch(src, /alreadyHasActiveTrial:\s*false/);
  assert.match(src, /hasPriorProductTrial: history\.hasPriorProductTrial/);
});
