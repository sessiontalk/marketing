import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decide, dueAt, skipReason, TrialState } from "../src/lib/trialNurture/schedule";
import { GENERIC_SOFTPHONE_COPY } from "../src/lib/trialNurture/copyHostedGeneric";
import { NURTURE_FROM_EMAIL, NURTURE_REPLY_TO } from "../src/lib/email";
import { NURTURE_SHELL_HTML } from "../src/lib/trialNurture/shell.html";
import {
  mapLegacySoftphoneSentSteps,
  softphoneDbNeedsRenumber,
  SOFTPHONE_MESSAGING_CATCHUP_DEFAULT,
} from "../src/lib/trialNurture/softphoneStepMap";
import { productFromTrialStarted } from "../src/lib/trialNurture/signupEnrolment";

const D = 86_400_000;
const H = 3_600_000;
const t0 = new Date("2026-11-02T10:00:00Z");
const pack = "/workspace/marketing/drips/softphone-messaging-rev-2026-11-09";

const base = (o: Partial<TrialState> = {}): TrialState => ({
  enrolledAt: t0, product: "generic_softphone", trialStartedAt: t0,
  trialEndsAt: new Date(t0.getTime() + 14 * D), projectCreatedAt: t0,
  extensionCount: 0, softphoneFirstLoginAt: null, firstCallAt: null,
  carrierConnectedAt: null, salesCallBookedAt: null, salesCallHeldAt: null,
  lastInboundReplyAt: null, paymentMethodAddedAt: null, planStatus: "trial",
  unsubscribed: false, sentSteps: [], ...o,
});

test("verbatim copy vs pack html/*.txt bodies and sequence.json subjects", () => {
  const seq = JSON.parse(readFileSync(`${pack}/html/sequence.json`, "utf8"));
  assert.equal(GENERIC_SOFTPHONE_COPY.length, 6);
  for (const c of GENERIC_SOFTPHONE_COPY) {
    const txt = readFileSync(`${pack}/html/${String(c.step).padStart(2, "0")}.txt`, "utf8");
    const packBody = txt.replace(/\n$/, "");
    assert.equal(c.body, packBody, `step ${c.step} body`);
    const stepMeta = seq.steps.find((s: { step: number }) => s.step === c.step);
    assert.equal(c.subject, stepMeta.subject, `step ${c.step} subject`);
    assert.equal(c.preheader, stepMeta.preheader, `step ${c.step} preheader`);
    assert.equal(c.final, true);
  }
});

test("sender Reply-To and softphone footer support@", () => {
  assert.equal(NURTURE_FROM_EMAIL, "Maryam Fatima <maryam@sessiontalk.co.uk>");
  assert.equal(NURTURE_REPLY_TO, "maryam@sessiontalk.co.uk");
  assert.match(NURTURE_SHELL_HTML, /support@sessiontalk\.co\.uk/);
  assert.doesNotMatch(NURTURE_SHELL_HTML, /Reply-To/);
});

test("timings: messaging +5d, check-in +7d, ending end-2d", () => {
  const s = base();
  assert.equal(dueAt(1, s)!.getTime(), t0.getTime() + H);
  assert.equal(dueAt(2, s)!.getTime(), t0.getTime() + D);
  assert.equal(dueAt(3, s)!.getTime(), t0.getTime() + 3 * D);
  assert.equal(dueAt(4, s)!.getTime(), t0.getTime() + 5 * D);
  assert.equal(dueAt(5, s)!.getTime(), t0.getTime() + 7 * D);
  assert.equal(dueAt(6, s)!.getTime(), s.trialEndsAt!.getTime() - 2 * D);
});

test("white-label and generic map to generic_softphone sequence", () => {
  assert.equal(productFromTrialStarted({ product: "generic_softphone" }), "generic_softphone");
  assert.equal(productFromTrialStarted({ trial_type: "generic_softphone" }), "generic_softphone");
  // white-label softphone trials are stored as product/trial_type generic_softphone (no separate enum)
  assert.equal(sequenceMapsBoth(), true);
});
function sequenceMapsBoth() {
  return GENERIC_SOFTPHONE_COPY[0].body.includes("white-label") && GENERIC_SOFTPHONE_COPY[0].body.includes("Generic Softphone");
}

test("in-flight map: sent 1-3 legacy → next messaging at +5d", () => {
  assert.deepEqual(mapLegacySoftphoneSentSteps([1, 2, 3]), [1, 2, 3]);
  const d = decide(base({ sentSteps: [1, 2, 3] }), new Date(t0.getTime() + 5 * D + 1));
  assert.deepEqual(d, { step: 4, action: "send" });
});

test("in-flight map: sent 1-4 old (check-in) → catch-up messaging then ending path", () => {
  assert.deepEqual(mapLegacySoftphoneSentSteps([1, 2, 3, 4]), [1, 2, 3, 5]);
  assert.equal(softphoneDbNeedsRenumber([1, 2, 3, 4]), true);
  // catch-up default: messaging still due
  const d = decide(base({ sentSteps: [1, 2, 3, 4], lastSentAt: new Date(t0.getTime() + 7 * D) }), new Date(t0.getTime() + 8 * D + 1));
  assert.deepEqual(d, { step: 4, action: "send" });
  assert.equal(SOFTPHONE_MESSAGING_CATCHUP_DEFAULT, true);
});

test("in-flight map: sent 1-5 old (done) → skip messaging, wait/stop", () => {
  assert.deepEqual(mapLegacySoftphoneSentSteps([1, 2, 3, 4, 5]), [1, 2, 3, 4, 5, 6]);
  const d = decide(base({ sentSteps: [1, 2, 3, 4, 5] }), new Date(t0.getTime() + 12 * D));
  // all v2 steps terminal after remap+catchup skip of messaging
  assert.equal(d.action, "wait");
});

test("in-flight map: already done v2 with marker/step6 — no duplicates", () => {
  assert.deepEqual(mapLegacySoftphoneSentSteps([0, 1, 2, 3, 4, 5, 6]), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(mapLegacySoftphoneSentSteps([1, 2, 3, 5, 6]), [1, 2, 3, 4, 5, 6]); // catch-up skip
  assert.equal(softphoneDbNeedsRenumber([0, 1, 2, 3, 5]), false);
  const d = decide(base({ sentSteps: [0, 1, 2, 3, 4, 5, 6] as any }), new Date(t0.getTime() + 12 * D));
  assert.equal(d.action, "wait");
});

test("guards unchanged: unsubscribed / paid / no resend of sent steps", () => {
  assert.deepEqual(decide(base({ unsubscribed: true }), t0), { action: "stop", reason: "unsubscribed" });
  assert.deepEqual(decide(base({ planStatus: "paid" }), t0), { action: "stop", reason: "converted" });
  assert.deepEqual(decide(base({ sentSteps: [1, 2, 3, 4, 5, 6] }), new Date(t0.getTime() + 12 * D)).action, "wait");
  assert.equal(skipReason(6, base({ paymentMethodAddedAt: t0 }), t0), "card_or_paid");
});
