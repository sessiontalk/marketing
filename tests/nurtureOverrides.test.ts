import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decide, dueAt, Step, TrialState } from "../src/lib/trialNurture/schedule";
import {
  lateFirstStepConfig, lateFirstStepAction, manualOverrideConfig, manualOverride, countsAsEmailed,
  parseContactList, matchesContactList, retireReason, MANUAL_CATCHUP_REASON, MANUAL_NO_EMAIL_REASON,
} from "../src/lib/trialNurture/queue";

const H = 3_600_000, D = 24 * H, MIN = 60_000;

/** The deploy env for the HoM/Nauman decision of 25 Nov 2026 10:48 GMT. */
export const DECISION_ENV = {
  NURTURE_LATE_FIRST_STEP_POLICY: "send",
  // Unscoped emails: the CRM product of each row (teams_phone vs teams_business) was not read, and
  // skip-first only touches a row's overdue first step, so no product scope is needed here.
  NURTURE_LATE_FIRST_STEP_SKIP: "jacopman247@protonmail.com,shellanunnain@gmail.com,vickers@daskob.com,admintel@arkys.com,mahlodireuben88@gmail.com",
  NURTURE_SKIP_ALL_STEPS: "junction1153@gmail.com:signup_finish_setup",
};

interface StepRow { step: number; status: string; reason: string | null; createdAt: Date }
interface Sim { name: string; email: string; appId: string; state: TrialState; steps: StepRow[]; emails: Array<{ step: number; at: Date }>; retired: boolean }

function base(product: TrialState["product"], start: string, ends: string | null, extra: Partial<TrialState> = {}): TrialState {
  const s = new Date(start);
  const isSignup = product === "signup_finish_setup";
  return {
    enrolledAt: s, product, trialStartedAt: s, trialEndsAt: ends ? new Date(ends) : null,
    projectCreatedAt: isSignup ? null : s, extensionCount: 0, softphoneFirstLoginAt: null, firstCallAt: null,
    carrierConnectedAt: null, salesCallBookedAt: null, salesCallHeldAt: null, lastInboundReplyAt: null,
    paymentMethodAddedAt: null, planStatus: "trial", unsubscribed: false, emailVerified: true, sentSteps: [],
    ...(isSignup ? { signupCreatedAt: s, contactHasPriorProductTrial: false, contactHasProject: false } : {}), ...extra,
  };
}
/** Affected rows, from REPORT.md / drip-catchup-2026-11-25.md (trial ends from the Chargebee pull; unknown ends = +14d). */
function people(): Sim[] {
  const mk = (name: string, email: string, appId: string, state: TrialState): Sim => ({
    name, email, appId, state, emails: [], retired: false,
    steps: state.product === "generic_softphone" ? [{ step: 0, status: "skipped", reason: "softphone_seq_v2", createdAt: state.enrolledAt }] : [],
  });
  return [
    mk("Weathgroup", "jacopman247@protonmail.com", "Weathgroup", base("teams_phone", "2026-11-17T13:17:07Z", "2026-12-01T13:17:00Z")),
    mk("Shella", "shellanunnain@gmail.com", "Shella", base("teams_phone", "2026-11-18T03:50:47Z", "2026-12-02T03:50:00Z")),
    mk("Daskob", "vickers@daskob.com", "Daskob", base("teams_phone", "2026-11-21T16:27:53Z", "2026-12-05T16:27:00Z")),
    mk("ArkysVOIP", "admintel@arkys.com", "ArkysVOIP", base("generic_softphone", "2026-11-21T16:20:10Z", "2026-12-05T16:20:00Z")),
    mk("mahlodireuben88", "mahlodireuben88@gmail.com", "signup:B4rGUR8pja", base("signup_finish_setup", "2026-11-18T12:36:00Z", null)),
    mk("junction1153", "junction1153@gmail.com", "signup:bik3Z9bkyi", base("signup_finish_setup", "2026-11-18T23:45:00Z", null)),
    mk("Project1s", "aidt96752@gmail.com", "Project1s", base("teams_phone", "2026-11-24T04:20:12Z", "2026-12-08T04:20:00Z")),
    mk("fabio777", "molegard6253@yahoo.com", "fabio777", base("teams_phone", "2026-11-24T09:04:06Z", "2026-12-08T09:04:00Z")),
    mk("SkyhighTech", "info@skyhightechnologies.ca", "SkyhighTech", base("generic_softphone", "2026-11-24T18:34:27Z", "2026-12-08T18:34:00Z")),
    mk("chamsmarrakech35", "chamsmarrakech35@gmail.com", "signup:vSrtLuEkkS", base("signup_finish_setup", "2026-11-22T23:10:00Z", null)),
  ];
}

/** Mirror of the worker route's per-row path (decide → manual override → late guard → claim). */
function workerStep(p: Sim, now: Date, env: Record<string, string>) {
  if (p.retired) return;
  const late = lateFirstStepConfig(env);
  const overrides = manualOverrideConfig(env);
  const sentTimes = p.steps.filter(countsAsEmailed).map((r) => r.createdAt.getTime());
  const lastSentAt = sentTimes.length ? new Date(Math.max(...sentTimes)) : null;
  const st = { ...p.state, sentSteps: p.steps.map((r) => r.step as Step), lastSentAt };
  let d = decide(st, now);
  if (d.action === "wait" || d.action === "stop") { if (retireReason(p.state.product, p.steps.map((r) => r.step), d)) p.retired = true; return; }
  if (d.action === "send") {
    const due = dueAt(d.step, st);
    const manual = manualOverride({ cfg: overrides, email: p.email, appId: p.appId, product: p.state.product, hasAnyStep: p.steps.some((r) => r.step > 0), dueAt: due, now, maxHours: late.maxHours });
    const lateAction = manual ? null : lateFirstStepAction({ everEmailed: sentTimes.length > 0, dueAt: due, now, enrolledAt: p.state.enrolledAt, ...late });
    if (manual) d = { step: d.step, action: "skip", reason: manual.reason };
    if (lateAction === "hold") return;
    if (lateAction === "skip") d = { step: d.step, action: "skip", reason: "late_first_step" };
  }
  if (p.steps.some((r) => r.step === d.step)) return; // unique (trial, step)
  if (d.action === "skip") { p.steps.push({ step: d.step, status: "skipped", reason: d.reason, createdAt: now }); return; }
  p.steps.push({ step: d.step, status: "sent", reason: null, createdAt: now });
  p.emails.push({ step: d.step, at: now });
}

export function simulate(env: Record<string, string>, deploy: Date, days = 16) {
  const ps = people();
  for (let t = deploy.getTime(); t < deploy.getTime() + days * D; t += 10 * MIN) for (const p of ps) workerStep(p, new Date(t), env);
  return Object.fromEntries(ps.map((p) => [p.name, p]));
}

const DEPLOY = new Date("2026-11-26T09:00:00Z");

test("parseContactList: emails (lowercased), app ids incl. signup:<objectId>, optional :product", () => {
  const l = parseContactList(" Jacopman247@ProtonMail.com:teams_phone , signup:B4rGUR8pja\nWeathgroup ");
  assert.deepEqual(l, [{ email: "jacopman247@protonmail.com", product: "teams_phone" }, { appId: "signup:b4rgur8pja", product: undefined }, { appId: "weathgroup", product: undefined }]);
  assert.ok(matchesContactList(l, { email: "jacopman247@protonmail.com", appId: "x", product: "teams_phone" }));
  assert.ok(!matchesContactList(l, { email: "jacopman247@protonmail.com", appId: "x", product: "generic_softphone" }), "product scope respected");
  assert.ok(matchesContactList(l, { email: "a@b.c", appId: "signup:B4rGUR8pja", product: "signup_finish_setup" }));
  assert.deepEqual(parseContactList(undefined), []);
});

test("manualOverride: skip-first only for an overdue first step with no step recorded; skip-all always", () => {
  const cfg = manualOverrideConfig(DECISION_ENV);
  const now = DEPLOY;
  const old = new Date("2026-11-17T14:17:07Z");
  const w = { cfg, email: "jacopman247@protonmail.com", appId: "Weathgroup", product: "teams_phone", now, maxHours: 12 };
  assert.deepEqual(manualOverride({ ...w, hasAnyStep: false, dueAt: old }), { reason: MANUAL_CATCHUP_REASON });
  assert.equal(manualOverride({ ...w, hasAnyStep: true, dueAt: old }), null, "later steps are not skipped");
  assert.deepEqual(manualOverride({ ...w, product: "teams_business", hasAnyStep: false, dueAt: old }), { reason: MANUAL_CATCHUP_REASON }, "matches whatever product the CRM row has");
  assert.equal(manualOverride({ ...w, hasAnyStep: false, dueAt: new Date(now.getTime() - H) }), null, "a fresh first step (e.g. a future trial) is not skipped");
  assert.equal(manualOverride({ ...w, email: "aidt96752@gmail.com", appId: "Project1s", hasAnyStep: false, dueAt: old }), null);
  const j = { cfg, email: "junction1153@gmail.com", appId: "signup:bik3Z9bkyi", product: "signup_finish_setup", now, maxHours: 12, dueAt: old };
  assert.deepEqual(manualOverride({ ...j, hasAnyStep: true }), { reason: MANUAL_NO_EMAIL_REASON });
  assert.equal(manualOverride({ ...j, product: "teams_phone", hasAnyStep: false }), null, "skip-all scoped to the welcome only");
  assert.ok(countsAsEmailed({ status: "skipped", reason: MANUAL_CATCHUP_REASON }));
  assert.ok(!countsAsEmailed({ status: "skipped", reason: MANUAL_NO_EMAIL_REASON }));
});

test("decision env: 5 overdue first steps skipped, junction gets nothing, 4 get the original first email at deploy", () => {
  const r = simulate(DECISION_ENV, DEPLOY);
  for (const n of ["Weathgroup", "Shella", "Daskob", "ArkysVOIP", "mahlodireuben88"]) {
    const s1 = r[n].steps.find((x) => x.step === 1)!;
    assert.equal(s1.reason, MANUAL_CATCHUP_REASON, n);
    assert.equal(s1.createdAt.getTime(), DEPLOY.getTime(), `${n} skip recorded on the first run`);
    assert.ok(!r[n].emails.some((e) => e.step === 1), `${n}: original step 1 never sent`);
    assert.ok(r[n].emails[0].at.getTime() >= DEPLOY.getTime() + D, `${n}: next worker email >=24h after the catch-up skip`);
  }
  assert.equal(r.junction1153.emails.length, 0);
  assert.deepEqual(r.junction1153.steps.map((x) => [x.step, x.reason]), [[1, MANUAL_NO_EMAIL_REASON], [2, MANUAL_NO_EMAIL_REASON]]);
  assert.ok(r.junction1153.retired, "junction's welcome row completes and is retired");
  for (const n of ["Project1s", "fabio777", "SkyhighTech", "chamsmarrakech35"]) {
    assert.deepEqual(r[n].emails[0], { step: 1, at: DEPLOY }, `${n}: original first email on the first run`);
  }
  for (const p of Object.values(r)) {
    for (let i = 1; i < p.emails.length; i++) assert.ok(p.emails[i].at.getTime() - p.emails[i - 1].at.getTime() >= D, `${p.name}: max one email per 24h`);
  }
});

test("without the override env (default hold) nothing overdue goes out; policy=send without the list would send the 5 originals", () => {
  const held = simulate({}, DEPLOY, 3);
  for (const n of ["Weathgroup", "Shella", "Daskob", "ArkysVOIP", "mahlodireuben88", "junction1153", "Project1s", "fabio777", "SkyhighTech", "chamsmarrakech35"]) {
    assert.equal(held[n].emails.length, 0, n);
  }
  const noList = simulate({ NURTURE_LATE_FIRST_STEP_POLICY: "send" }, DEPLOY, 1);
  assert.deepEqual(noList.Weathgroup.emails[0], { step: 1, at: DEPLOY }, "the list is what prevents a duplicate of the catch-up");
});

test("worker route wires the per-contact overrides and counts the catch-up skip as an email", () => {
  const src = readFileSync("src/app/api/worker/trial-nurture/route.ts", "utf8");
  assert.match(src, /const overrides = manualOverrideConfig\(\)/);
  assert.match(src, /manualOverride\(\{ cfg: overrides, email: c\.email, appId: t\.appId, product: t\.product, hasAnyStep: done\.some\(\(r\) => r\.step > 0\)/);
  assert.match(src, /const lateAction = manual \? null : lateFirstStepAction/);
  assert.match(src, /const sentTimes = done\.filter\(countsAsEmailed\)/);
  assert.equal((src.match(/reason: trialNurtureSteps\.reason, createdAt: trialNurtureSteps\.createdAt/g) || []).length, 3);
  const health = readFileSync("src/app/api/worker/nurture-health/route.ts", "utf8");
  assert.match(health, /mine\.filter\(countsAsEmailed\)/);
});
