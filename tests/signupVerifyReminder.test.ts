import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { decide, render, sequenceKey, NURTURE_PRODUCTS, TrialState, dueAt } from "../src/lib/trialNurture/schedule";
import { missingLinkFields, UNFILLED_PLACEHOLDER_RE } from "../src/lib/trialNurture/links";
import { NURTURE_SEQUENCES, copyFor } from "../src/lib/trialNurture/copy";
import { renderNurtureHtml } from "../src/lib/trialNurture/htmlTemplate";
import {
  SIGNUP_PRODUCT,
  VERIFY_REMINDER_PRODUCT,
  canEnrolSignupNurture,
  canEnrolVerifyReminder,
} from "../src/lib/trialNurture/signupEnrolment";
import { junkReason, looksRandom } from "../src/lib/trialNurture/exclusions";
import {
  SIGNUP_VERIFY_REMINDER_COPY,
  SIGNUP_VERIFY_REMINDER_DRAFT_PATH,
} from "../src/lib/trialNurture/copySignupVerifyReminder";
import { SIGNUP_NURTURE_FROM_EMAIL } from "../src/lib/email";
import {
  confirmEmailMac,
  confirmEmailUrl,
  buildVerifyUrl,
  CONFIRM_EMAIL_PATH,
  CONFIRM_EMAIL_TTL_SECONDS,
  DEFAULT_SESSIONCLOUD_ORIGIN,
} from "../src/lib/trialNurture/confirmEmailLink";
import {
  emailDeliverabilityReason,
  isCarrierGatewayDomain,
  isDisposableDomain,
  clearMxCache,
} from "../src/lib/trialNurture/mailQuality";

const D = 86_400_000;
const t0 = new Date("2026-11-09T12:00:00Z");
const reminderState = (o: Partial<TrialState> = {}): TrialState => ({
  enrolledAt: t0,
  product: "signup_verify_reminder",
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
  emailVerified: false,
  sentSteps: [],
  ...o,
});

function loadDraft(): string {
  const candidates = [
    SIGNUP_VERIFY_REMINDER_DRAFT_PATH,
    "drips/signup-verify-reminder/2026-11-10-DRAFT.md",
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  throw new Error("approved copy pack not found");
}

const draft = loadDraft();
const VERIFY = "https://cloud.sessiontalk.io/parse/confirm-email?uid=pC8Dwf94lT&exp=1800000000&sig=abcd";

test("verbatim approved copy (subject, preheader, body, CTA, sign-off)", () => {
  const c = SIGNUP_VERIFY_REMINDER_COPY[0];
  assert.equal(c.final, true);
  assert.equal(c.subject, "Please confirm your email to finish signing up");
  assert.equal(c.preheader, "One tap and your SessionTalk account is ready to use.");
  assert.equal(c.ctaLabel, "Confirm my email");
  assert.match(draft, /\*\*Subject:\*\* Please confirm your email to finish signing up/);
  assert.match(draft, /\*\*Preheader:\*\* One tap and your SessionTalk account is ready to use\./);
  assert.match(draft, /Yesterday we sent you an email to confirm your address/);
  assert.match(draft, /the link may have expired/);
  assert.match(draft, /the button below sorts it out/);
  assert.match(draft, /\[CTA: Confirm my email\] → \{\{verify_url\}\}/);
  assert.match(draft, /\*\*Plain-text CTA line:\*\* Confirm your email: \{\{verify_url\}\}/);
  assert.match(draft, /Once your email is confirmed, you can sign in at cloud\.sessiontalk\.io/);
  assert.match(draft, /If the button doesn't work or something else got in the way, just reply to this email and I'll help/);
  assert.match(c.body, /^Hi \{first_name\},/);
  assert.match(c.body, /Thanks for signing up to SessionTalk\. Yesterday we sent you an email to confirm your address, and it looks like it hasn't been confirmed yet\./);
  assert.match(c.body, /It might be sitting in your spam or promotions folder, or the link may have expired\. Either way, the button below sorts it out\./);
  assert.match(c.body, /Confirm your email: \{\{verify_url\}\}/);
  assert.match(c.body, /Once your email is confirmed, you can sign in at cloud\.sessiontalk\.io and create your first project\./);
  assert.match(c.body, /If the button doesn't work or something else got in the way, just reply to this email and I'll help\./);
  assert.match(c.body, /Thanks,\nMaryam\nSessionTalk$/);
  assert.match(c.html!, /Confirm my email/);
  assert.match(c.html!, /href="\{\{verify_url\}\}"/);
  assert.match(c.html!, /One tap and your SessionTalk account is ready to use\./);
});

test("first_name empty falls back to Hi there,; {{verify_url}} is replaced and never left literal", () => {
  const c = copyFor("signup_verify_reminder", 1)!;
  const fields = { product: "signup_verify_reminder" as const, step: 1 as const, verifyUrl: VERIFY };
  assert.equal(render(c.body, null, fields).startsWith("Hi there,"), true);
  assert.equal(render(c.body, "Emine", fields).startsWith("Hi Emine,"), true);
  const text = render(c.body, "Emine", fields);
  const html = render(c.html!, "Emine", fields);
  assert.doesNotMatch(text, UNFILLED_PLACEHOLDER_RE);
  assert.doesNotMatch(html, UNFILLED_PLACEHOLDER_RE);
  assert.match(text, /Confirm your email: https:\/\/cloud\.sessiontalk\.io\/parse\/confirm-email/);
  assert.match(html, /href="https:\/\/cloud\.sessiontalk\.io\/parse\/confirm-email/);
  assert.doesNotMatch(text, /\{\{verify_url\}\}/);
  const unfilled = render(c.body, "Emine", { product: "signup_verify_reminder", step: 1 });
  assert.match(unfilled, /\{\{verify_url\}\}/);
  assert.match(unfilled, UNFILLED_PLACEHOLDER_RE);
  assert.deepEqual(missingLinkFields(1, {}, "signup_verify_reminder"), ["verify_url"]);
  assert.deepEqual(missingLinkFields(1, { verifyUrl: VERIFY }, "signup_verify_reminder"), []);
});

test("sequence registration, sender, and HTML shell", () => {
  assert.equal(sequenceKey("signup_verify_reminder"), "signup_verify_reminder");
  assert.ok(NURTURE_PRODUCTS.includes("signup_verify_reminder"));
  assert.equal(NURTURE_SEQUENCES.signup_verify_reminder.length, 1);
  assert.equal(VERIFY_REMINDER_PRODUCT, "signup_verify_reminder");
  assert.equal(SIGNUP_NURTURE_FROM_EMAIL, "Maryam <maryam@sessiontalk.co.uk>");
  const worker = readFileSync("src/app/api/worker/trial-nurture/route.ts", "utf8");
  assert.match(worker, /signup_verify_reminder/);
  assert.match(worker, /SIGNUP_NURTURE_FROM_EMAIL/);
  assert.match(worker, /allowUnverified/);
  assert.match(worker, /buildVerifyUrl/);
  const wrapped = renderNurtureHtml({
    textBody: render(SIGNUP_VERIFY_REMINDER_COPY[0].body, "Jo", { verifyUrl: VERIFY }),
    htmlBody: render(SIGNUP_VERIFY_REMINDER_COPY[0].html!, "Jo", { verifyUrl: VERIFY }),
    unsubscribeUrl: "https://marketing.sessiontalk.co.uk/api/unsubscribe?token=" + "a".repeat(64),
    subject: SIGNUP_VERIFY_REMINDER_COPY[0].subject,
  });
  assert.match(wrapped, /logo_purple\.png|sessiontalk/i);
});

test("due at enrolledAt+24h; skipped once verified; finish_setup stays immediate", () => {
  assert.deepEqual(dueAt(1, reminderState()), new Date(t0.getTime() + D));
  const early = decide(reminderState(), new Date(t0.getTime() + D - 1));
  assert.equal(early.action, "wait");
  assert.deepEqual(decide(reminderState(), new Date(t0.getTime() + D)), { step: 1, action: "send" });
  assert.deepEqual(
    decide(reminderState({ emailVerified: true }), new Date(t0.getTime() + D)),
    { step: 1, action: "skip", reason: "already_verified" },
  );
  // finish_setup step 1 is still due immediately (regression)
  assert.deepEqual(
    decide({ ...reminderState(), product: "signup_finish_setup", emailVerified: true }, t0),
    { step: 1, action: "send" },
  );
});

test("enrolment gates: reminder allows unverified; finish_setup does not; junk still blocks both", () => {
  const base = {
    email: "e@aile.gov.tr", unsubscribed: false, isExcludedEmail: false,
    junkReason: null, alreadyHasActiveTrial: false,
  };
  assert.deepEqual(canEnrolVerifyReminder(base), { ok: true });
  assert.equal((canEnrolSignupNurture({ ...base, emailVerified: false }) as any).reason, "unverified_email");
  assert.deepEqual(canEnrolSignupNurture({ ...base, emailVerified: true }), { ok: true });
  assert.equal(canEnrolVerifyReminder({ ...base, junkReason: "carrier_gateway" }).ok, false);
  assert.equal(canEnrolVerifyReminder({ ...base, unsubscribed: true }).ok, false);
  assert.equal(junkReason({ accountName: "Kacper" }, { email: "n@macsnipe.com", firstname: "Kacper", emailVerified: false }, { allowUnverified: true }), null);
  assert.equal(junkReason({ accountName: "Kacper" }, { email: "n@macsnipe.com", firstname: "Kacper", emailVerified: false }), "unverified_email");
  assert.equal(junkReason({ accountName: "Nvkcjnf" }, { email: "z@tranzan.si", firstname: "Nvkcjnf", emailVerified: false }, { allowUnverified: true }), "random_name");
});

test("{{verify_url}} is an HMAC confirm-email link, never a raw token, and is held when inputs are missing", () => {
  const secret = "test-webhook-secret-for-confirm-email";
  const uid = "pC8Dwf94lT";
  const exp = 1_800_000_000;
  const url = confirmEmailUrl(DEFAULT_SESSIONCLOUD_ORIGIN, uid, exp, secret);
  assert.equal(url.startsWith(`https://cloud.sessiontalk.io${CONFIRM_EMAIL_PATH}?`), true);
  assert.match(url, /uid=pC8Dwf94lT/);
  assert.match(url, /exp=1800000000/);
  assert.match(url, new RegExp(`sig=${confirmEmailMac(uid, exp, secret)}`));
  assert.doesNotMatch(url, /token=/);
  assert.equal(CONFIRM_EMAIL_TTL_SECONDS, 7 * 24 * 60 * 60);
  assert.equal(buildVerifyUrl({ objectId: uid, secret, now: new Date(0) })?.includes("uid=pC8Dwf94lT"), true);
  assert.equal(buildVerifyUrl({ objectId: null, secret }), null);
  assert.equal(buildVerifyUrl({ objectId: uid, secret: "" }), null);
  assert.equal(buildVerifyUrl({ objectId: uid, secret: "   " }), null);
});

test("mail quality: carrier gateways, disposable domains, MX fail-safe; att.net and o2.co.uk are not gateways", async () => {
  clearMxCache();
  assert.equal(isCarrierGatewayDomain("tmomail.net"), true);
  assert.equal(isCarrierGatewayDomain("vtext.com"), true);
  assert.equal(isCarrierGatewayDomain("txt.att.net"), true);
  assert.equal(isCarrierGatewayDomain("messaging.sprintpcs.com"), true);
  assert.equal(isCarrierGatewayDomain("att.net"), false);
  assert.equal(isCarrierGatewayDomain("o2.co.uk"), false);
  assert.equal(isDisposableDomain("mailinator.com"), true);
  assert.equal(isDisposableDomain("gmail.com"), false);

  const okMx = async () => [{ priority: 10, exchange: "mx.example.com" }];
  assert.equal(await emailDeliverabilityReason("n@macsnipe.com", okMx), null);
  assert.equal(await emailDeliverabilityReason("6@tmomail.net", okMx), "carrier_gateway");
  assert.equal(await emailDeliverabilityReason("a@mailinator.com", okMx), "disposable_domain");
  assert.equal(looksRandom("Wtwkokk"), false); // still not random; gateway check is what holds it

  clearMxCache();
  const noMx = async () => { const e: any = new Error("no mx"); e.code = "ENODATA"; throw e; };
  assert.equal(await emailDeliverabilityReason("x@no-mx.invalid", noMx), "no_mx");

  clearMxCache();
  const hang = () => new Promise<never>(() => { /* never resolves */ });
  assert.equal(await emailDeliverabilityReason("x@slow.test", hang, Date.now(), 30), "mx_lookup_failed");
});
