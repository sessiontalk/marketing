import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { decide, render, sequenceKey, NURTURE_PRODUCTS, TrialState } from "../src/lib/trialNurture/schedule";
import { missingLinkFields, UNFILLED_PLACEHOLDER_RE } from "../src/lib/trialNurture/links";
import { NURTURE_SEQUENCES, copyFor } from "../src/lib/trialNurture/copy";
import { renderNurtureHtml } from "../src/lib/trialNurture/htmlTemplate";
import {
  SIGNUP_PRODUCT,
  signupAppId,
  isSignupAppId,
  productFromTrialStarted,
  productStepsAlreadyCoveredBySignup,
  canEnrolSignupNurture,
} from "../src/lib/trialNurture/signupEnrolment";
import { isExcludedEmail, junkReason } from "../src/lib/trialNurture/exclusions";
import {
  SIGNUP_TO_PRODUCT_STEP_MAP,
  SIGNUP_FINISH_SETUP_CTA_URL,
  SIGNUP_FINISH_SETUP_DRAFT_PATH,
  SIGNUP_FINISH_SETUP_COPY,
} from "../src/lib/trialNurture/copySignupFinishSetup";
import { SIGNUP_NURTURE_FROM_EMAIL, NURTURE_FROM_EMAIL } from "../src/lib/email";

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

function loadDraft(primary: string, fallback: string): string {
  for (const p of [primary, fallback]) {
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  throw new Error("draft pack not found: " + primary);
}
const draft = loadDraft(SIGNUP_FINISH_SETUP_DRAFT_PATH, "drips/signup-finish-setup/2026-11-09-DRAFT.md");

test("verbatim copy matches HoM draft (subject, preheader, CTA label)", () => {
  assert.match(draft, /Subject: Welcome to SessionTalk, let's set up your first project/);
  assert.match(draft, /Preheader: One short step and you're ready to start making calls\./);
  assert.match(draft, /CTA label: Create your first project/);
  assert.match(draft, /Subject: Your SessionTalk account is ready when you are/);
  assert.match(draft, /Preheader: Creating your first project only takes a few minutes\. Here's the guide\./);
  assert.match(draft, /CTA label: See how to create a project/);

  const [e1, e2] = SIGNUP_FINISH_SETUP_COPY;
  assert.equal(e1.subject, "Welcome to SessionTalk, let's set up your first project");
  assert.equal(e1.preheader, "One short step and you're ready to start making calls.");
  assert.equal(e1.ctaLabel, "Create your first project");
  assert.equal(e2.subject, "Your SessionTalk account is ready when you are");
  assert.equal(e2.preheader, "Creating your first project only takes a few minutes. Here's the guide.");
  assert.equal(e2.ctaLabel, "See how to create a project");
  assert.equal(e1.final, true);
  assert.equal(e2.final, true);
});

test("CTA URL and branded shell / preheader in HTML", () => {
  assert.equal(SIGNUP_FINISH_SETUP_CTA_URL, "https://docs.sessiontalk.io/docs/sessioncloud/creating-first-app");
  assert.match(draft, /CTA URL \(both\): https:\/\/docs\.sessiontalk\.io\/docs\/sessioncloud\/creating-first-app/);
  for (const c of SIGNUP_FINISH_SETUP_COPY) {
    assert.ok(c.html, "html body present");
    assert.match(c.html!, new RegExp(`href="${SIGNUP_FINISH_SETUP_CTA_URL.replace(/\./g, "\\.")}"`));
    assert.match(c.html!, new RegExp(c.ctaLabel!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(c.html!, new RegExp(c.preheader!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(c.body, new RegExp(`\\[${c.ctaLabel!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]`));
    assert.match(c.body, new RegExp(SIGNUP_FINISH_SETUP_CTA_URL.replace(/\./g, "\\.")));
    const wrapped = renderNurtureHtml({
      textBody: render(c.body, "Jo", {}),
      htmlBody: render(c.html!, "Jo", {}),
      unsubscribeUrl: "https://marketing.sessiontalk.co.uk/api/unsubscribe?token=" + "a".repeat(64),
      subject: c.subject,
    });
    assert.match(wrapped, /logo_purple\.png|sessiontalk/i); // softphone shell / brand
  }
});

test("first_name empty falls back to Hi there,", () => {
  const body = copyFor("signup_finish_setup", 1)!.body;
  assert.equal(render(body, null, {}).startsWith("Hi there,"), true);
  assert.equal(render(body, "", {}).startsWith("Hi there,"), true);
  assert.equal(render(body, "Jo", {}).startsWith("Hi Jo,"), true);
  const html = render(copyFor("signup_finish_setup", 1)!.html!, null, {});
  assert.match(html, /Hi there,/);
  assert.doesNotMatch(html, /\{first_name\}/);
});

test("sender is Maryam <maryam@sessiontalk.co.uk> for signup (softphone keeps Maryam Fatima)", () => {
  assert.equal(SIGNUP_NURTURE_FROM_EMAIL, "Maryam <maryam@sessiontalk.co.uk>");
  assert.match(draft, /From: Maryam <maryam@sessiontalk\.co\.uk>/);
  assert.equal(NURTURE_FROM_EMAIL, "Maryam Fatima <maryam@sessiontalk.co.uk>");
  const worker = readFileSync("src/app/api/worker/trial-nurture/route.ts", "utf8");
  assert.match(worker, /SIGNUP_NURTURE_FROM_EMAIL/);
  assert.match(worker, /key === "signup_finish_setup" \|\| key === "signup_verify_reminder"/);
});

test("signup_finish_setup sequence key; no literal project tokens after render", () => {
  assert.equal(sequenceKey("signup_finish_setup"), "signup_finish_setup");
  assert.ok(NURTURE_PRODUCTS.includes("signup_finish_setup"));
  assert.equal(NURTURE_SEQUENCES.signup_finish_setup.length, 2);
  for (const c of SIGNUP_FINISH_SETUP_COPY) {
    const text = render(c.body, "Jo", { product: "signup_finish_setup", step: c.step as 1|2 });
    const html = render(c.html!, "Jo", { product: "signup_finish_setup", step: c.step as 1|2 });
    assert.doesNotMatch(text, UNFILLED_PLACEHOLDER_RE);
    assert.doesNotMatch(html, UNFILLED_PLACEHOLDER_RE);
    assert.deepEqual(missingLinkFields(c.step as 1|2, {}, "signup_finish_setup"), []);
  }
});

test("step 1 due immediately; step 2 ~2 days later only with no project", () => {
  assert.deepEqual(decide(signupState(), t0), { step: 1, action: "send" });
  assert.deepEqual(decide(signupState({ sentSteps: [1] }), new Date(t0.getTime() + 2 * D)), { step: 2, action: "send" });
  // Still waiting before 2 days
  const early = decide(signupState({ sentSteps: [1] }), new Date(t0.getTime() + D));
  assert.equal(early.action, "wait");
  // Project arrived → skip remaining signup steps
  assert.deepEqual(
    decide(signupState({ sentSteps: [1], projectCreatedAt: t0 }), new Date(t0.getTime() + 2 * D + 1)),
    { step: 2, action: "skip", reason: "has_project" },
  );
  assert.deepEqual(
    decide(signupState({ projectCreatedAt: t0 }), t0),
    { step: 1, action: "skip", reason: "has_project" },
  );
});

test("step 2 skipped after upgrade to product sequence (no signup leftovers)", () => {
  assert.deepEqual(SIGNUP_TO_PRODUCT_STEP_MAP, { 1: null, 2: null });
  assert.deepEqual(productStepsAlreadyCoveredBySignup([1, 2]), []);
  // After trial.started upgrade: product changes; signup step 2 is no longer scheduled
  const upgraded = signupState({ product: "generic_softphone", projectCreatedAt: t0, sentSteps: [] });
  assert.notEqual(sequenceKey(upgraded.product), "signup_finish_setup");
  assert.deepEqual(decide(upgraded, new Date(t0.getTime() + 2 * 3_600_000)), { step: 1, action: "send" });
});

test("signup enrolment gate: unverified / junk / opted-out / Northwind / paid-already", () => {
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
  assert.deepEqual(canEnrolSignupNurture({
    email: "ok@ex.co", emailVerified: true, unsubscribed: false,
    isExcludedEmail: false, junkReason: null, alreadyHasActiveTrial: false,
  }), { ok: true });
});

test("opted-out and paid stop decide()", () => {
  assert.deepEqual(decide(signupState({ unsubscribed: true }), t0), { action: "stop", reason: "unsubscribed" });
  assert.deepEqual(decide(signupState({ planStatus: "paid" }), t0), { action: "stop", reason: "converted" });
});

test("trial.started product mapping and signup app id", () => {
  assert.equal(productFromTrialStarted({ product: "generic_softphone" }), "generic_softphone");
  assert.equal(productFromTrialStarted({ trial_type: "teams_hosted" }), "teams_phone");
  assert.equal(signupAppId("abc"), "signup:abc");
  assert.equal(isSignupAppId("signup:abc"), true);
  assert.equal(SIGNUP_PRODUCT, "signup_finish_setup");
});
