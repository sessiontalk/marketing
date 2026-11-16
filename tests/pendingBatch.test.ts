import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decide, TrialState } from "../src/lib/trialNurture/schedule";
import {
  TRIAL_NURTURE_BATCH,
  isPendingTrialNurture,
  nextStepDueAt,
  selectPendingTrialNurtureBatch,
} from "../src/lib/trialNurture/pendingBatch";

const H = 3_600_000;
const D = 24 * H;
const NOW = new Date("2026-11-15T09:00:00Z");

const base = (o: Partial<TrialState> = {}): TrialState => ({
  enrolledAt: NOW,
  product: "teams_business",
  trialStartedAt: NOW,
  trialEndsAt: new Date(NOW.getTime() + 14 * D),
  projectCreatedAt: NOW,
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

function idOf(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

test("batch size stays 50", () => {
  assert.equal(TRIAL_NURTURE_BATCH, 50);
});

test("verify-reminder too_old and eligible send are pending; not-yet-due and complete are not", () => {
  const tooOld = base({
    product: "signup_verify_reminder",
    enrolledAt: new Date(NOW.getTime() - 54 * H),
    trialStartedAt: new Date(NOW.getTime() - 54 * H),
    trialEndsAt: null,
    projectCreatedAt: null,
  });
  const eligible = base({
    product: "signup_verify_reminder",
    enrolledAt: new Date(NOW.getTime() - 36 * H),
    trialStartedAt: new Date(NOW.getTime() - 36 * H),
    trialEndsAt: null,
    projectCreatedAt: null,
  });
  const notDue = base({
    product: "signup_verify_reminder",
    enrolledAt: new Date(NOW.getTime() - 10 * H),
    trialStartedAt: new Date(NOW.getTime() - 10 * H),
    trialEndsAt: null,
    projectCreatedAt: null,
  });
  const alreadySkipped = { ...tooOld, sentSteps: [1] as TrialState["sentSteps"] };

  assert.equal(isPendingTrialNurture(tooOld, NOW), true);
  assert.deepEqual(decide(tooOld, NOW), { step: 1, action: "skip", reason: "verify_reminder_too_old" });
  assert.equal(isPendingTrialNurture(eligible, NOW), true);
  assert.deepEqual(decide(eligible, NOW), { step: 1, action: "send" });
  assert.equal(isPendingTrialNurture(notDue, NOW), false);
  assert.equal(decide(notDue, NOW).action, "wait");
  assert.equal(isPendingTrialNurture(alreadySkipped, NOW), false);
  assert.equal(decide(alreadySkipped, NOW).action, "wait");
});

test("regression: 50 non-pending rows cannot hide later pending verify-reminders", () => {
  const candidates = [];

  for (let i = 1; i <= 40; i++) {
    const enrolledAt = new Date(NOW.getTime() - (200 - i) * D);
    candidates.push({
      id: idOf(i),
      state: base({
        enrolledAt,
        trialStartedAt: enrolledAt,
        projectCreatedAt: enrolledAt,
        trialEndsAt: new Date(enrolledAt.getTime() + 14 * D),
        sentSteps: [1, 2, 3, 4, 5],
      }),
      row: { n: i, kind: "complete_teams" },
    });
  }
  for (let i = 41; i <= 50; i++) {
    const enrolledAt = new Date(NOW.getTime() - 30 * 60_000); // step 1 due at projectCreatedAt+1h, still in the future
    candidates.push({
      id: idOf(i),
      state: base({
        enrolledAt,
        trialStartedAt: enrolledAt,
        projectCreatedAt: enrolledAt,
        trialEndsAt: new Date(enrolledAt.getTime() + 14 * D),
        sentSteps: [],
      }),
      row: { n: i, kind: "not_due_teams" },
    });
  }

  const tooOldEnrolled = new Date(NOW.getTime() - 54 * H);
  candidates.push({
    id: idOf(51),
    state: base({
      product: "signup_verify_reminder",
      enrolledAt: tooOldEnrolled,
      trialStartedAt: tooOldEnrolled,
      trialEndsAt: null,
      projectCreatedAt: null,
    }),
    row: { n: 51, kind: "verify_too_old" },
  });
  const eligibleEnrolled = new Date(NOW.getTime() - 36 * H);
  candidates.push({
    id: idOf(52),
    state: base({
      product: "signup_verify_reminder",
      enrolledAt: eligibleEnrolled,
      trialStartedAt: eligibleEnrolled,
      trialEndsAt: null,
      projectCreatedAt: null,
    }),
    row: { n: 52, kind: "verify_eligible" },
  });
  const softEnrolled = new Date(NOW.getTime() - 2 * D);
  candidates.push({
    id: idOf(53),
    state: base({
      product: "generic_softphone",
      enrolledAt: softEnrolled,
      trialStartedAt: softEnrolled,
      projectCreatedAt: softEnrolled,
      trialEndsAt: new Date(softEnrolled.getTime() + 14 * D),
      sentSteps: [],
    }),
    row: { n: 53, kind: "softphone_due" },
  });

  assert.ok(candidates.length > TRIAL_NURTURE_BATCH);

  const selected = selectPendingTrialNurtureBatch(candidates, NOW);
  const kinds = selected.map((c) => (c.row as { kind: string }).kind);
  const ids = selected.map((c) => c.id);

  assert.ok(!ids.includes(idOf(1)) && !ids.includes(idOf(40)) && !ids.includes(idOf(50)),
    "complete / not-yet-due rows in the first 50 must not be selected");
  assert.ok(ids.includes(idOf(51)), "verify-reminder too_old (row 51) must be selected");
  assert.ok(ids.includes(idOf(52)), "eligible verify-reminder send (row 52) must be selected");
  assert.ok(ids.includes(idOf(53)), "due generic_softphone (row 53) must still be selected");
  assert.equal(selected.length, 3);
  assert.ok(selected.length <= TRIAL_NURTURE_BATCH);

  const tooOld = selected.find((c) => c.id === idOf(51))!;
  const eligible = selected.find((c) => c.id === idOf(52))!;
  const soft = selected.find((c) => c.id === idOf(53))!;
  assert.deepEqual(decide(tooOld.state, NOW), { step: 1, action: "skip", reason: "verify_reminder_too_old" });
  assert.deepEqual(decide(eligible.state, NOW), { step: 1, action: "send" });
  assert.equal(decide(soft.state, NOW).action, "send");

  // Due-first: softphone step 1 (projectCreatedAt+1h, ~47h ago), then too_old (enrolled+24h, 30h ago), then eligible (12h ago).
  assert.deepEqual(kinds, ["softphone_due", "verify_too_old", "verify_eligible"]);
  assert.ok(nextStepDueAt(soft.state)! < nextStepDueAt(tooOld.state)!);
  assert.ok(nextStepDueAt(tooOld.state)! < nextStepDueAt(eligible.state)!);
});

test("id is the tie-break when due and enrolled_at match", () => {
  const enrolledAt = new Date(NOW.getTime() - 36 * H);
  const a = {
    id: idOf(2),
    state: base({
      product: "signup_verify_reminder",
      enrolledAt,
      trialStartedAt: enrolledAt,
      trialEndsAt: null,
      projectCreatedAt: null,
    }),
    row: null,
  };
  const b = {
    id: idOf(1),
    state: { ...a.state },
    row: null,
  };
  const selected = selectPendingTrialNurtureBatch([a, b], NOW);
  assert.deepEqual(selected.map((c) => c.id), [idOf(1), idOf(2)]);
});

test("trial-nurture worker uses pending due-first batch selection instead of unordered LIMIT 50", () => {
  const src = readFileSync("src/app/api/worker/trial-nurture/route.ts", "utf8");
  assert.match(src, /selectPendingTrialNurtureBatch/);
  assert.match(src, /TRIAL_NURTURE_BATCH/);
  assert.doesNotMatch(src, /inArray\(trialAccounts\.product,\s*\[\.\.\.NURTURE_PRODUCTS\]\)\)\.limit\(/);
});
