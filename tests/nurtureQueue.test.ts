import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decide, dueAt, Step, TrialState } from "../src/lib/trialNurture/schedule";
import {
  NURTURE_BATCH, NURTURE_ENDED_STATUS, pickBatch, isQueueCandidate, retireReason,
  lateFirstStepConfig, lateFirstStepAction, QueueRow,
} from "../src/lib/trialNurture/queue";
import { assessNurtureHealth, HealthRow } from "../src/lib/trialNurture/nurtureHealth";
import { nurtureAlert, alertEmailConfig, errorMessage, DEFAULT_ALERT_TO } from "../src/lib/trialNurture/alerts";

const H = 3_600_000, D = 24 * H, MIN = 60_000;
const T0 = new Date("2026-11-17T21:40:00Z");

type SimRow = QueueRow & { state: TrialState; steps: number[]; label: string };
let seq = 0;
function row(label: string, over: Partial<TrialState>, steps: number[], insertedAt: Date): SimRow {
  const state: TrialState = {
    enrolledAt: insertedAt, product: "teams_phone", trialStartedAt: insertedAt, trialEndsAt: null,
    projectCreatedAt: insertedAt, extensionCount: 0, softphoneFirstLoginAt: null, firstCallAt: null,
    carrierConnectedAt: null, salesCallBookedAt: null, salesCallHeldAt: null, lastInboundReplyAt: null,
    paymentMethodAddedAt: null, planStatus: "trial", unsubscribed: false, emailVerified: true, sentSteps: [],
    ...over,
  };
  seq++;
  return { id: `r${String(seq).padStart(4, "0")}`, label, product: state.product, planStatus: "trial",
    trialEndsAt: state.trialEndsAt, updatedAt: insertedAt, state, steps };
}

/** 60 dead rows (finished signup sequences + trials past end) and 80 live rows mid-sequence, all older than the new trials. */
function backlog(): SimRow[] {
  const rows: SimRow[] = [];
  const old = new Date(T0.getTime() - 10 * D);
  for (let i = 0; i < 30; i++) rows.push(row("signup_done", { product: "signup_finish_setup", projectCreatedAt: null }, [1, 2], old));
  for (let i = 0; i < 30; i++) rows.push(row("trial_over", { trialEndsAt: new Date(T0.getTime() - D) }, [1, 2], old));
  // Live Teams trials started 2 days ago, steps 1-3 terminal, step 4 not due for 5 days.
  const live = new Date(T0.getTime() - 2 * D);
  for (let i = 0; i < 80; i++) rows.push(row("live_waiting", { trialStartedAt: live, enrolledAt: live, projectCreatedAt: live, trialEndsAt: new Date(live.getTime() + 14 * D) }, [1, 2, 3], live));
  return rows;
}
function newTrials(at: Date): SimRow[] {
  return ["Weathgroup", "Shella", "Daskob", "Project1s", "fabio777", "ArkysVOIP", "SkyhighTech"].map((n) =>
    row(n, { product: n.startsWith("Arkys") || n.startsWith("Skyhigh") ? "generic_softphone" : "teams_phone", trialEndsAt: new Date(at.getTime() + 14 * D) }, [], at));
}

/** One worker run over the in-memory table, mirroring the route: pick, touch, decide, retire. */
function runWorker(table: SimRow[], now: Date) {
  const batch = pickBatch(table, now);
  for (const r of batch) r.updatedAt = now;
  const firstSends: string[] = [];
  for (const r of batch) {
    const d = decide({ ...r.state, sentSteps: r.steps as Step[] }, now);
    if (d.action === "send" || d.action === "skip") { r.steps.push(d.step); if (d.action === "send" && d.step === 1) firstSends.push(r.label); continue; }
    if (retireReason(r.product, r.steps, d)) r.planStatus = NURTURE_ENDED_STATUS;
  }
  return { batch, firstSends };
}

test("regression: the old query (first 50 'trial' rows, no ORDER BY, no retire) starves new trials", () => {
  const table = [...backlog(), ...newTrials(new Date(T0.getTime() + H))];
  assert.ok(table.length > 2 * NURTURE_BATCH);
  for (let run = 0; run < 20; run++) {
    // Postgres heap order ≈ insertion order; LIMIT 50 with no filter returns the same oldest 50.
    const batch = table.filter((r) => r.planStatus === "trial").slice(0, 50);
    assert.ok(batch.every((r) => r.label === "signup_done" || r.label === "trial_over"), "old query only ever sees dead rows");
  }
});

test(">50 rows: every new trial gets its first email within ceil(N/50) runs, dead rows are retired and never re-picked", () => {
  const table = backlog();
  const insertedAt = new Date(T0.getTime() + H);
  table.push(...newTrials(insertedAt));
  assert.equal(table.length, 147);
  const sentFirst = new Set<string>();
  let now = new Date(insertedAt.getTime() + 2 * H); // step 1 due at project+1h
  const runsNeeded = Math.ceil(table.length / NURTURE_BATCH);
  for (let run = 0; run < runsNeeded; run++) {
    const { firstSends } = runWorker(table, now);
    firstSends.forEach((l) => sentFirst.add(l));
    now = new Date(now.getTime() + 10 * MIN);
  }
  assert.deepEqual([...sentFirst].sort(), ["ArkysVOIP", "Daskob", "Project1s", "Shella", "SkyhighTech", "Weathgroup", "fabio777"]);
  // Dead rows: past-end trials never even enter the queue; finished signup rows are retired once seen.
  assert.ok(table.filter((r) => r.label === "signup_done").every((r) => r.planStatus === NURTURE_ENDED_STATUS));
  assert.ok(table.filter((r) => r.label === "trial_over").every((r) => !isQueueCandidate(r, now)));
  // Live rows keep 'trial' and stay queued.
  assert.ok(table.filter((r) => r.label === "live_waiting").every((r) => r.planStatus === "trial"));
  // A later batch never contains retired or ended rows.
  assert.ok(pickBatch(table, now).every((r) => r.planStatus === "trial" && r.label !== "signup_done"));
});

test("rotation: with 120 live rows and no dead rows at all, a new row is still reached within 3 runs", () => {
  const table = backlog().filter((r) => r.label === "live_waiting");
  const live2 = new Date(T0.getTime() - D);
  for (let i = 0; i < 40; i++) table.push(row("live_waiting", { trialStartedAt: live2, enrolledAt: live2, projectCreatedAt: live2, trialEndsAt: new Date(live2.getTime() + 14 * D) }, [1, 2], live2));
  const at = new Date(T0.getTime() + H);
  const [fresh] = newTrials(at);
  table.push(fresh);
  let now = new Date(at.getTime() + 2 * H);
  let reachedOn = -1;
  for (let run = 0; run < 5 && reachedOn < 0; run++) {
    const { batch } = runWorker(table, now);
    if (batch.includes(fresh)) reachedOn = run;
    now = new Date(now.getTime() + 10 * MIN);
  }
  assert.ok(reachedOn >= 0 && reachedOn < Math.ceil(table.length / NURTURE_BATCH), `reached on run ${reachedOn}`);
});

test("retireReason: permanent stops and completed sequences retire; waiting rows stay", () => {
  assert.equal(retireReason("teams_phone", [1], { action: "stop", reason: "trial_ended" }), "trial_ended");
  assert.equal(retireReason("teams_phone", [], { action: "stop", reason: "unsubscribed" }), "unsubscribed");
  assert.equal(retireReason("teams_phone", [], { action: "stop", reason: "converted" }), null);
  assert.equal(retireReason("signup_finish_setup", [1, 2], { action: "wait", nextAt: null }), "sequence_complete");
  assert.equal(retireReason("signup_verify_reminder", [1], { action: "wait", nextAt: null }), "sequence_complete");
  assert.equal(retireReason("signup_finish_setup", [1], { action: "wait", nextAt: new Date() }), null);
  // Softphone with no trial end yet: step 6 can still become due (plan.changed) → keep.
  assert.equal(retireReason("generic_softphone", [0, 1, 2, 3, 4, 5], { action: "wait", nextAt: null }), null);
  assert.equal(retireReason("generic_softphone", [0, 1, 2, 3, 4, 5, 6], { action: "wait", nextAt: null }), "sequence_complete");
  assert.equal(retireReason("teams_phone", [1, 2, 3, 4, 5], { action: "send", step: 1 } as any), null);
});

test("backlog guard: default config HOLDS never-emailed rows whose first email is >12h overdue", () => {
  const cfg = lateFirstStepConfig({});
  assert.deepEqual(cfg, { policy: "hold", maxHours: 12 });
  assert.deepEqual(lateFirstStepConfig({ NURTURE_LATE_FIRST_STEP_POLICY: "bogus", NURTURE_LATE_FIRST_STEP_MAX_HOURS: "-1" }), { policy: "hold", maxHours: 12 });
  const now = new Date("2026-11-25T12:00:00Z");
  const weathgroupStep1 = new Date("2026-11-17T14:13:00Z");
  assert.equal(lateFirstStepAction({ everEmailed: false, dueAt: weathgroupStep1, now, ...cfg }), "hold");
  assert.equal(lateFirstStepAction({ everEmailed: false, dueAt: new Date(now.getTime() - H), now, ...cfg }), null, "fresh first email sends");
  assert.equal(lateFirstStepAction({ everEmailed: true, dueAt: weathgroupStep1, now, ...cfg }), null, "already-emailed rows unaffected");
  assert.equal(lateFirstStepAction({ everEmailed: false, dueAt: weathgroupStep1, now, policy: "skip", maxHours: 12 }), "skip");
  assert.equal(lateFirstStepAction({ everEmailed: false, dueAt: weathgroupStep1, now, policy: "send", maxHours: 12 }), null);
  const scoped = lateFirstStepConfig({ NURTURE_LATE_FIRST_STEP_ENROLLED_BEFORE: "2026-11-26T09:00:00Z" });
  assert.equal(lateFirstStepAction({ everEmailed: false, dueAt: weathgroupStep1, now, enrolledAt: weathgroupStep1, ...scoped }), "hold", "backlog row held");
  assert.equal(lateFirstStepAction({ everEmailed: false, dueAt: new Date("2026-11-27T09:00:00Z"), now: new Date("2026-11-29T09:00:00Z"), enrolledAt: new Date("2026-11-27T09:00:00Z"), ...scoped }), null, "post-cutoff enrolment not held");
});

test("daily health check flags the starvation pattern (first email overdue >2h, 0 sent in 24h) and failures", () => {
  const now = new Date("2026-11-25T07:00:00Z");
  const r = row("Weathgroup", { trialEndsAt: new Date("2026-12-01T13:13:00Z"), projectCreatedAt: new Date("2026-11-17T13:13:00Z"), trialStartedAt: new Date("2026-11-17T13:13:00Z"), enrolledAt: new Date("2026-11-17T13:13:00Z") }, [], new Date("2026-11-17T13:13:00Z"));
  const healthRow: HealthRow = { id: r.id, appId: "app1", product: "teams_phone", state: r.state, emailedSteps: [], holdReason: null };
  const junk: HealthRow = { ...healthRow, id: "junk", holdReason: "random_name" };
  const res = assessNurtureHealth({ now, rows: [healthRow, junk], sentLast24h: 0, failedLast24h: [{ trialAccountId: "x", step: 2, reason: "Throttling" }], lateFirstStepMaxHours: 12 });
  assert.equal(res.ok, false);
  assert.deepEqual(res.alerts.map((a) => a.kind).sort(), ["first_step_sla", "no_sends_24h", "send_failed"]);
  assert.equal(res.overdue.length, 1);
  assert.equal(res.overdue[0].backlogHeld, true);
  const fresh = row("new", {}, [], new Date(now.getTime() - 30 * MIN));
  const ok = assessNurtureHealth({ now, rows: [{ ...healthRow, id: "f", state: fresh.state }], sentLast24h: 3, failedLast24h: [], lateFirstStepMaxHours: 12 });
  assert.equal(ok.ok, true);
});

test("alerts: always logged; email only when NURTURE_ALERT_EMAIL_ENABLED=true, default recipient Nauman, from support@", async () => {
  const lines: string[] = []; const sends: any[] = [];
  const off = await nurtureAlert("send_failed", "1 failed", { a: 1 }, { env: {}, log: (l) => lines.push(l), send: async (p: any) => { sends.push(p); return { id: "m" }; } });
  assert.deepEqual(off, { logged: true, emailed: false });
  assert.equal(sends.length, 0);
  assert.match(lines[0], /"level":"alert"/);
  assert.deepEqual(alertEmailConfig({}).to, [DEFAULT_ALERT_TO]);
  const on = await nurtureAlert("no_sends_24h", "0 sent", {}, { env: { NURTURE_ALERT_EMAIL_ENABLED: "true" }, log: () => {}, send: async (p: any) => { sends.push(p); return { id: "m" }; } });
  assert.equal(on.emailed, true);
  assert.equal(sends[0].to, "naumansulaiman@googlemail.com");
  assert.match(sends[0].from, /support@sessiontalk\.co\.uk/);
  const boom = await nurtureAlert("send_failed", "x", {}, { env: { NURTURE_ALERT_EMAIL_ENABLED: "true" }, log: () => {}, send: async () => { throw new Error("ses down"); } });
  assert.equal(boom.emailed, false, "alert email failure never throws");
  assert.equal(errorMessage(Object.assign(new Error("Message rejected: address blacklisted"), { name: "MessageRejected" })), "MessageRejected: Message rejected: address blacklisted");
});

test("worker route: filtered + ordered queue, rotation touch, retire, backlog guard, loud failures", () => {
  const src = readFileSync("src/app/api/worker/trial-nurture/route.ts", "utf8");
  assert.ok(!/\.limit\(BATCH\)/.test(src) && !/const BATCH = 50/.test(src), "old unordered LIMIT 50 is gone");
  assert.match(src, /orderBy\(sql`\$\{trialAccounts\.updatedAt\} asc nulls first`, asc\(trialAccounts\.id\)\)/);
  assert.match(src, /or\(isNull\(trialAccounts\.trialEndsAt\), gt\(trialAccounts\.trialEndsAt, now\)\)/);
  assert.match(src, /\.limit\(NURTURE_BATCH\)/);
  assert.match(src, /set\(\{ updatedAt: now \}\)\.where\(inArray\(trialAccounts\.id/);
  assert.match(src, /planStatus: NURTURE_ENDED_STATUS/);
  assert.equal((src.match(/await retire\(/g) || []).length, 2, "both decide() exits retire");
  assert.match(src, /lateFirstStepAction\(/);
  assert.match(src, /console\.error\(JSON\.stringify\(\{ level: "error", msg: "trial_nurture_send_failed"/);
  assert.match(src, /nurtureAlert\("send_failed"/);
  // Senders unchanged: nurture stays Maryam.
  assert.match(src, /SIGNUP_NURTURE_FROM_EMAIL : NURTURE_FROM_EMAIL/);
});

test("event route revives retired rows: trial.started upgrade, email.verified reminder, plan.changed extension", () => {
  const src = readFileSync("src/app/api/events/trial/route.ts", "utf8");
  assert.match(src, /planStatus: "trial", \/\/ the worker may have retired the signup row/);
  assert.match(src, /r\.planStatus === NURTURE_ENDED_STATUS\)/);
  assert.match(src, /case when \$\{trialAccounts\.planStatus\} = \$\{NURTURE_ENDED_STATUS\} then 'trial'/);
});

test("daily health cron is scheduled under the public /api/worker/ prefix", () => {
  const v = JSON.parse(readFileSync("vercel.json", "utf8"));
  assert.ok(v.crons.some((c: any) => c.path === "/api/worker/nurture-health"));
});
