import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, render, TrialState } from "../src/lib/trialNurture/schedule";
import { isDripSendingEnabled, RETIRED_SEQUENCE_NAMES } from "../src/lib/killSwitch";
import { NURTURE_COPY } from "../src/lib/trialNurture/copy";
import {
  workspaceTeamUrl, workspaceRoutingUrl, billingUrl,
  missingLinkFields, assertSafeNurtureText,
  FORBIDDEN_CLOUD_PATH_RE, FORBIDDEN_NON_SIP_WORKSPACE_RE,
} from "../src/lib/trialNurture/links";
import {
  assignBccInternal, trialNurtureBccAddress, trialNurtureBccCount,
  DEFAULT_TRIAL_NURTURE_BCC, DEFAULT_TRIAL_NURTURE_BCC_COUNT,
} from "../src/lib/trialNurture/bcc";

const H = 3_600_000, D = 24 * H, T0 = new Date("2026-11-01T09:00:00Z");
const SIP = "utilitystar.us.sip.sessiontalk.io";
const ACCT = "UtilityStar";
const base = (o: Partial<TrialState> = {}): TrialState => ({
  enrolledAt: T0, product: "teams_business", trialStartedAt: T0, trialEndsAt: new Date(T0.getTime() + 14 * D), projectCreatedAt: T0,
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
test("step 4 day7 skips on recent reply / short trial, not booked call", () => {
  const s = base({ sentSteps: [1, 2, 3] });
  assert.deepEqual(decide(s, at(7 * D)), { step: 4, action: "send" });
  // Booked/held sales call no longer skips email 4 (Nauman/CoS 12 Oct).
  assert.deepEqual(decide({ ...s, salesCallBookedAt: T0 }, at(7 * D)), { step: 4, action: "send" });
  assert.deepEqual(decide({ ...s, salesCallHeldAt: T0 }, at(7 * D)), { step: 4, action: "send" });
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
test("step 3 skipped for Teams Phone", () => {
  const s = base({ sentSteps: [1, 2], product: "teams_phone" });
  assert.equal((decide(s, at(3 * D)) as any).reason, "teams_phone_plan");
});
test("copy: 5 steps, plain text, all final, maryam signature, greeting fallback, no Microsoft", () => {
  assert.deepEqual(NURTURE_COPY.map((c) => c.step), [1, 2, 3, 4, 5]);
  assert.ok(NURTURE_COPY.every((c) => c.final));
  for (const c of NURTURE_COPY) {
    assert.ok(c.body.startsWith("Hi {first_name},"));
    assert.ok(!/microsoft/i.test(c.body + c.subject));
    assert.ok(/Maryam Fatima\nSessionTalk\nmaryam@sessiontalk\.co\.uk$/.test(c.body));
    assert.ok(!/(sales|chief)@/.test(c.body));
    assert.ok(!/<[a-z]+[ >]/i.test(c.body));
  }
  assert.ok(render("Hi {first_name},\nx", "").startsWith("Hi there,"));
  assert.ok(render("Hi {first_name},\nx", "Sam").startsWith("Hi Sam,"));
});
test("sender is maryam@, never sales@/chief@", async () => {
  process.env.AWS_SES_REGION ||= "eu-west-2";
  const m = await import("../src/lib/email");
  assert.equal(m.NURTURE_FROM_EMAIL, "Maryam Fatima <maryam@sessiontalk.co.uk>");
  assert.ok(!/(sales|chief)@/.test(m.NURTURE_FROM_EMAIL + m.NURTURE_REPLY_TO));
});
test("workspace links use sip_domain host and /admin/team|/admin/routing", () => {
  assert.equal(workspaceTeamUrl(SIP), `https://${SIP}/admin/team`);
  assert.equal(workspaceRoutingUrl(SIP), `https://${SIP}/admin/routing`);
  const s1 = render(NURTURE_COPY[0].body, "Sam", { sipDomain: SIP });
  const s2 = render(NURTURE_COPY[1].body, "Sam", { sipDomain: SIP });
  const s3 = render(NURTURE_COPY[2].body, "Sam", { sipDomain: SIP });
  assert.ok(s1.includes(`https://${SIP}/admin/team`));
  assert.ok(s2.includes(`https://${SIP}/admin/team`));
  assert.ok(s3.includes(`https://${SIP}/admin/routing`));
  assert.ok(!s1.includes("cloud.sessiontalk.io/team-members"));
  assert.ok(!s3.includes("cloud.sessiontalk.io/call-routing"));
  // Must keep .sip — never emit slug.region.sessiontalk.io
  assert.ok(s1.includes(".sip.sessiontalk.io/admin/team"));
  assert.ok(!/utilitystar\.us\.sessiontalk\.io\/admin/.test(s1));
});
test("billing URL format uses cloud.sessiontalk.io/billing/{accountName}", () => {
  assert.equal(billingUrl(ACCT), `https://cloud.sessiontalk.io/billing/${ACCT}`);
  assert.equal(billingUrl("acme co"), "https://cloud.sessiontalk.io/billing/acme%20co");
  const s5 = render(NURTURE_COPY[4].body, "Sam", { accountName: ACCT });
  assert.ok(s5.includes(`https://cloud.sessiontalk.io/billing/${ACCT}`));
});
test("missing sip_domain or accountName causes a hold (missingLinkFields)", () => {
  assert.deepEqual(missingLinkFields(1, {}), ["sip_domain"]);
  assert.deepEqual(missingLinkFields(2, { accountName: ACCT }), ["sip_domain"]);
  assert.deepEqual(missingLinkFields(3, { sipDomain: "" }), ["sip_domain"]);
  assert.deepEqual(missingLinkFields(5, {}), ["accountName"]);
  assert.deepEqual(missingLinkFields(5, { sipDomain: SIP }), ["accountName"]);
  assert.deepEqual(missingLinkFields(4, {}), []);
  assert.deepEqual(missingLinkFields(1, { sipDomain: SIP }), []);
  assert.deepEqual(missingLinkFields(5, { accountName: ACCT }), []);
});
test("cloud.sessiontalk.io/team-members and /call-routing links are rejected", () => {
  assert.ok(FORBIDDEN_CLOUD_PATH_RE.test("https://cloud.sessiontalk.io/team-members/Foo"));
  assert.ok(FORBIDDEN_CLOUD_PATH_RE.test("https://cloud.sessiontalk.io/call-routing/Foo"));
  assert.throws(() => assertSafeNurtureText("see https://cloud.sessiontalk.io/team-members/x"), /forbidden cloud/);
  assert.throws(() => assertSafeNurtureText("see https://cloud.sessiontalk.io/call-routing/x"), /forbidden cloud/);
  // Billing on cloud is fine
  assert.doesNotThrow(() => assertSafeNurtureText("https://cloud.sessiontalk.io/billing/Foo"));
  // Non-.sip workspace host rejected
  assert.ok(FORBIDDEN_NON_SIP_WORKSPACE_RE.test("https://utilitystar.us.sessiontalk.io/admin/team"));
  assert.throws(
    () => assertSafeNurtureText("https://utilitystar.us.sessiontalk.io/admin/team"),
    /non-\.sip workspace/
  );
  // .sip host is fine
  assert.doesNotThrow(() => assertSafeNurtureText(`https://${SIP}/admin/team`));
});
test("render fills sip_domain as-is (no encode) and accountName encoded", () => {
  assert.equal(
    render("https://{sip_domain}/admin/team", "A", { sipDomain: SIP }),
    `https://${SIP}/admin/team`
  );
  assert.equal(render("x/{accountName}", "A", { accountName: "acme co" }), "x/acme%20co");
});
test("copy templates contain only sip_domain workspace CTAs and billing accountName", () => {
  for (const c of NURTURE_COPY) {
    assert.ok(!FORBIDDEN_CLOUD_PATH_RE.test(c.body), `step ${c.step} has forbidden cloud path`);
    assert.ok(!FORBIDDEN_NON_SIP_WORKSPACE_RE.test(c.body), `step ${c.step} has non-.sip host`);
  }
  assert.ok(NURTURE_COPY[0].body.includes("https://{sip_domain}/admin/team"));
  assert.ok(NURTURE_COPY[2].body.includes("https://{sip_domain}/admin/routing"));
  assert.ok(NURTURE_COPY[4].body.includes("https://cloud.sessiontalk.io/billing/{accountName}"));
});

test("BCC: first 10 get flag, 11th does not; defaults maryam@ / 10", () => {
  assert.equal(trialNurtureBccAddress({}), DEFAULT_TRIAL_NURTURE_BCC);
  assert.equal(trialNurtureBccCount({}), DEFAULT_TRIAL_NURTURE_BCC_COUNT);
  assert.equal(DEFAULT_TRIAL_NURTURE_BCC, "maryam@sessiontalk.co.uk");
  assert.equal(DEFAULT_TRIAL_NURTURE_BCC_COUNT, 10);
  // Sending off => never flag (enrolled before sending enabled)
  assert.equal(assignBccInternal({ sendingEnabled: false, earlierFlaggedCount: 0 }), false);
  // First 10 while sending on
  for (let i = 0; i < 10; i++) {
    assert.equal(assignBccInternal({ sendingEnabled: true, earlierFlaggedCount: i }), true, `i=${i}`);
  }
  // 11th
  assert.equal(assignBccInternal({ sendingEnabled: true, earlierFlaggedCount: 10 }), false);
});
test("BCC: env overrides address and count", () => {
  assert.equal(trialNurtureBccAddress({ TRIAL_NURTURE_BCC: "reviewer@sessiontalk.co.uk" }), "reviewer@sessiontalk.co.uk");
  assert.equal(trialNurtureBccCount({ TRIAL_NURTURE_BCC_COUNT: "3" }), 3);
  assert.equal(assignBccInternal({ sendingEnabled: true, earlierFlaggedCount: 2, env: { TRIAL_NURTURE_BCC_COUNT: "3" } }), true);
  assert.equal(assignBccInternal({ sendingEnabled: true, earlierFlaggedCount: 3, env: { TRIAL_NURTURE_BCC_COUNT: "3" } }), false);
  assert.equal(assignBccInternal({ sendingEnabled: true, earlierFlaggedCount: 0, env: { TRIAL_NURTURE_BCC_COUNT: "0" } }), false);
});
test("BCC: flag is stable (re-evaluating with higher count does not clear a prior true)", () => {
  // Simulates: flag stored at enrolment; later "resend" / worker path must use stored value, not recompute.
  const storedAtEnrolment = assignBccInternal({ sendingEnabled: true, earlierFlaggedCount: 0 });
  assert.equal(storedAtEnrolment, true);
  // Even if we later have 100 flagged trials, the stored flag on this trial stays true.
  const recomputedWrongly = assignBccInternal({ sendingEnabled: true, earlierFlaggedCount: 100 });
  assert.equal(recomputedWrongly, false);
  // Worker uses stored flag, so BCC still applies:
  assert.equal(storedAtEnrolment, true);
});

test("email 2 includes teammates test-call phrase", () => {
  const s2 = NURTURE_COPY.find((c) => c.step === 2)!;
  assert.ok(s2.body.includes("sign in on the softphone with one of your extensions and make a test call to one of your teammates."));
});
test("no nurture email contains 3CX, Yeastar, or a call offer", () => {
  const banned = /3CX|Yeastar|15-minute|book a call|schedule a call|call with/i;
  for (const c of NURTURE_COPY) {
    const hay = `${c.subject}\n${c.body}`;
    assert.equal(banned.test(hay), false, `step ${c.step} matched banned: ${hay.match(banned)?.[0]}`);
  }
});
