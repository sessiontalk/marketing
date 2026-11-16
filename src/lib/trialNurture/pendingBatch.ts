import { decide, dueAt, Step, TrialState } from "./schedule";
import { mapLegacySoftphoneSentSteps } from "./softphoneStepMap";

/** Matches the historical trial-nurture worker batch size. */
export const TRIAL_NURTURE_BATCH = 50;

export type PendingBatchCandidate<T = unknown> = {
  id: string;
  state: TrialState;
  row: T;
};

/**
 * Next unclaimed step due time, using the same clocks as dueAt()/decide().
 * Softphone sent steps are remapped first so legacy indices do not hide a pending v2 step.
 * Returns null when the sequence has no remaining step with a due date (complete, or blocked on a missing clock such as projectCreatedAt).
 */
export function nextStepDueAt(s: TrialState): Date | null {
  if (s.product === "generic_softphone") {
    s = { ...s, sentSteps: mapLegacySoftphoneSentSteps(s.sentSteps) as Step[] };
  }
  let next: Date | null = null;
  for (const step of [1, 2, 3, 4, 5, 6] as Step[]) {
    if (s.sentSteps.includes(step)) continue;
    const at = dueAt(step, s);
    if (!at) continue;
    if (!next || at < next) next = at;
  }
  return next;
}

/**
 * True when the worker would record a decision or send on this run: action send or skip
 * (including verify_reminder_too_old), or a verify-reminder contact who has already verified
 * and must be promoted to finish_setup (that path runs before decide()).
 * Wait (not yet due, or 24h send throttle) and stop (unsubscribed, trial ended, ...) are not pending.
 */
export function isPendingTrialNurture(s: TrialState, now: Date): boolean {
  if (s.product === "signup_verify_reminder" && s.emailVerified) return true;
  const d = decide(s, now);
  return d.action === "send" || d.action === "skip";
}

/**
 * Drop non-pending rows, sort earliest due (then enrolled_at, then id), then apply the batch limit.
 * Call this before processing so complete / not-yet-due rows cannot occupy the 50 slots.
 */
export function selectPendingTrialNurtureBatch<T>(
  candidates: PendingBatchCandidate<T>[],
  now: Date,
  limit = TRIAL_NURTURE_BATCH,
): PendingBatchCandidate<T>[] {
  return candidates
    .filter((c) => isPendingTrialNurture(c.state, now))
    .sort((a, b) => {
      const dueA = nextStepDueAt(a.state);
      const dueB = nextStepDueAt(b.state);
      const ka = dueA ? dueA.getTime() : a.state.enrolledAt.getTime();
      const kb = dueB ? dueB.getTime() : b.state.enrolledAt.getTime();
      if (ka !== kb) return ka - kb;
      const enrolled = a.state.enrolledAt.getTime() - b.state.enrolledAt.getTime();
      if (enrolled !== 0) return enrolled;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    })
    .slice(0, limit);
}
