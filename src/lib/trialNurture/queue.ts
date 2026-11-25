/**
 * Trial-nurture worker queue rules (pure, no I/O, unit-tested in tests/nurtureQueue.test.ts).
 *
 * Incident 17-25 Nov 2026: the worker selected `plan_status='trial' LIMIT 50` with no ORDER BY
 * and never retired finished rows, so once more than 50 dead rows existed every run saw the same
 * 50 and no new signup/trial got a first email. These rules keep the queue to rows that can still
 * act, rotate it (least recently processed first) and retire rows that are done.
 * The SQL in src/app/api/worker/trial-nurture/route.ts must mirror isQueueCandidate/queueOrder.
 */
import type { Decision, Step } from "./schedule";
import { NURTURE_PRODUCTS } from "./schedule";
import { mapLegacySoftphoneSentSteps } from "./softphoneStepMap";

/** Rows the worker should pull per run. Rotation (queueOrder) means every row is reached. */
export const NURTURE_BATCH = 50;

/**
 * plan_status for a row whose nurture is finished (stop decision or every step terminal).
 * Not a SessionCloud plan state: SessionCloud sends trial | paid | cancelled. Revived to 'trial'
 * by trial.started (signup upgrade), email.verified (reminder → finish_setup) and plan.changed
 * with a future trial_ends_at (see reviveOnEvent).
 */
export const NURTURE_ENDED_STATUS = "ended";

export interface QueueRow {
  id: string;
  product: string;
  planStatus: string;
  trialEndsAt: Date | null;
  updatedAt: Date | null;
}

/** Same predicate as the worker SQL WHERE. */
export function isQueueCandidate(r: QueueRow, now: Date): boolean {
  if (r.planStatus !== "trial") return false;
  if (!(NURTURE_PRODUCTS as readonly string[]).includes(r.product)) return false;
  if (r.trialEndsAt && r.trialEndsAt.getTime() <= now.getTime()) return false;
  return true;
}

/** Same order as the worker SQL ORDER BY: updated_at ASC NULLS FIRST, id ASC. */
export function queueOrder(a: QueueRow, b: QueueRow): number {
  const ta = a.updatedAt ? a.updatedAt.getTime() : -Infinity;
  const tb = b.updatedAt ? b.updatedAt.getTime() : -Infinity;
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** In-memory twin of the worker SELECT (used by tests to prove rotation). */
export function pickBatch<T extends QueueRow>(rows: readonly T[], now: Date, batch = NURTURE_BATCH): T[] {
  return rows.filter((r) => isQueueCandidate(r, now)).sort(queueOrder).slice(0, batch);
}

/** Steps each sequence can ever send. Once all are terminal the row is finished. */
export const SEQUENCE_STEPS: Readonly<Record<string, readonly Step[]>> = {
  signup_finish_setup: [1, 2],
  signup_verify_reminder: [1],
  teams_phone: [1, 2, 3, 4, 5],
  teams_business: [1, 2, 3, 4, 5],
  hosted_pbx: [1, 2, 3, 4, 5],
  generic_softphone: [1, 2, 3, 4, 5, 6],
};

/** Stop reasons that are permanent for this row (paid/cancelled rows are already out of the queue). */
const RETIRE_ON_STOP = new Set(["trial_ended", "unsubscribed", "no_sequence"]);

/**
 * Reason to retire (plan_status='ended') after decide(), or null to keep the row queued.
 * `sentSteps` = terminal step numbers from trial_nurture_steps (sent/sending/skipped/failed).
 */
export function retireReason(product: string, sentSteps: readonly number[], d: Decision): string | null {
  if (d.action === "stop") return RETIRE_ON_STOP.has(d.reason) ? d.reason : null;
  if (d.action !== "wait" || d.nextAt) return null;
  const steps = SEQUENCE_STEPS[product];
  if (!steps) return null;
  const done = product === "generic_softphone" ? mapLegacySoftphoneSentSteps([...sentSteps] as Step[]) : sentSteps;
  return steps.every((s) => done.includes(s)) ? "sequence_complete" : null;
}

// ─── Backlog guard (HoM decides on late first emails) ─────────────────────

export type LateFirstStepPolicy = "hold" | "skip" | "send";
export const DEFAULT_LATE_FIRST_STEP_POLICY: LateFirstStepPolicy = "hold";
export const DEFAULT_LATE_FIRST_STEP_MAX_HOURS = 12;

/**
 * NURTURE_LATE_FIRST_STEP_POLICY: hold (default; don't send, don't claim, retried every run),
 * skip (record step skipped reason late_first_step; later steps continue at 1/day) or send.
 * NURTURE_LATE_FIRST_STEP_MAX_HOURS: how overdue a never-emailed row's first email may be (default 12).
 * NURTURE_LATE_FIRST_STEP_ENROLLED_BEFORE (optional ISO time): limit the guard to rows enrolled before
 * it (e.g. the deploy time), so post-fix enrolments that are legitimately late (verified days after
 * the trial started) are not held. Unset = the guard applies to every never-emailed row.
 * Unset or invalid values fall back to the defaults, so a deploy with no env change HOLDS the backlog.
 */
export function lateFirstStepConfig(env: Record<string, string | undefined> = process.env): { policy: LateFirstStepPolicy; maxHours: number; enrolledBefore?: Date } {
  const p = (env.NURTURE_LATE_FIRST_STEP_POLICY || "").trim().toLowerCase();
  const policy: LateFirstStepPolicy = p === "skip" || p === "send" || p === "hold" ? p : DEFAULT_LATE_FIRST_STEP_POLICY;
  const n = Number(env.NURTURE_LATE_FIRST_STEP_MAX_HOURS);
  const maxHours = Number.isFinite(n) && n > 0 ? n : DEFAULT_LATE_FIRST_STEP_MAX_HOURS;
  const eb = env.NURTURE_LATE_FIRST_STEP_ENROLLED_BEFORE ? new Date(env.NURTURE_LATE_FIRST_STEP_ENROLLED_BEFORE) : null;
  return eb && !Number.isNaN(eb.getTime()) ? { policy, maxHours, enrolledBefore: eb } : { policy, maxHours };
}

/**
 * For a row that has never been emailed, returns "hold" | "skip" when the email about to go out
 * was due more than maxHours ago; null = send normally. Rows already emailed are unaffected.
 */
export function lateFirstStepAction(o: {
  everEmailed: boolean;
  dueAt: Date | null;
  now: Date;
  policy: LateFirstStepPolicy;
  maxHours: number;
  enrolledAt?: Date | null;
  enrolledBefore?: Date;
}): "hold" | "skip" | null {
  if (o.everEmailed || !o.dueAt || o.policy === "send") return null;
  if (o.enrolledBefore && o.enrolledAt && o.enrolledAt.getTime() >= o.enrolledBefore.getTime()) return null;
  if (o.now.getTime() - o.dueAt.getTime() <= o.maxHours * 3_600_000) return null;
  return o.policy;
}

// ─── Per-contact overrides (HoM/Nauman decision 25 Nov 2026 10:48 GMT) ───────────

/** Step reason when a manual catch-up email (sent outside the worker) replaces the overdue first step. */
export const MANUAL_CATCHUP_REASON = "late_first_step_manual";
/** Step reason when a contact must get no email at all from this sequence. */
export const MANUAL_NO_EMAIL_REASON = "manual_no_email";

/** One entry: `email`, `email:product`, `app_id` or `app_id:product` (case-insensitive). */
export interface ContactMatcher { email?: string; appId?: string; product?: string }

/**
 * Parse a comma/whitespace list. An entry with "@" matches contacts.email (stored lowercased by
 * every CRM insert path); otherwise it matches trial_accounts.app_id (SessionCloud app id, or
 * `signup:<objectId>` for signup rows). Optional `:product` restricts the entry to one product.
 */
export function parseContactList(raw: string | undefined): ContactMatcher[] {
  return (raw || "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map((entry) => {
    const lower = entry.toLowerCase();
    // app ids can contain ':' (signup:<objectId>), so only a known product suffix is split off.
    const m = lower.match(/^(.*):(teams_phone|teams_business|hosted_pbx|generic_softphone|signup_finish_setup|signup_verify_reminder)$/);
    const id = m ? m[1] : lower;
    const product = m ? m[2] : undefined;
    return id.includes("@") ? { email: id, product } : { appId: id, product };
  });
}

export function matchesContactList(list: readonly ContactMatcher[], r: { email: string | null | undefined; appId: string | null | undefined; product: string }): boolean {
  const email = (r.email || "").trim().toLowerCase();
  const appId = (r.appId || "").trim().toLowerCase();
  return list.some((m) =>
    (m.product === undefined || m.product === r.product) &&
    ((m.email !== undefined && m.email === email) || (m.appId !== undefined && m.appId === appId)));
}

/**
 * NURTURE_LATE_FIRST_STEP_SKIP: the overdue first step of matching rows is recorded skipped
 * (MANUAL_CATCHUP_REASON) whatever NURTURE_LATE_FIRST_STEP_POLICY says. Only when the row has no
 * step recorded yet and that step is more than maxHours overdue; later steps follow the schedule,
 * spaced >= 24h after the skip (the skip counts as an email for the one-per-day rule).
 * NURTURE_SKIP_ALL_STEPS: every step of matching rows is recorded skipped (MANUAL_NO_EMAIL_REASON),
 * so the row completes and is retired without any email. Use `email:product` to scope it.
 */
export function manualOverrideConfig(env: Record<string, string | undefined> = process.env) {
  return { skipFirst: parseContactList(env.NURTURE_LATE_FIRST_STEP_SKIP), skipAll: parseContactList(env.NURTURE_SKIP_ALL_STEPS) };
}

export function manualOverride(o: {
  cfg: { skipFirst: readonly ContactMatcher[]; skipAll: readonly ContactMatcher[] };
  email: string | null | undefined;
  appId: string | null | undefined;
  product: string;
  /** Any real step (step > 0) already recorded for this row (sent/sending/skipped/failed). */
  hasAnyStep: boolean;
  dueAt: Date | null;
  now: Date;
  maxHours: number;
}): { reason: typeof MANUAL_CATCHUP_REASON | typeof MANUAL_NO_EMAIL_REASON } | null {
  const who = { email: o.email, appId: o.appId, product: o.product };
  if (matchesContactList(o.cfg.skipAll, who)) return { reason: MANUAL_NO_EMAIL_REASON };
  if (o.hasAnyStep || !o.dueAt) return null;
  if (o.now.getTime() - o.dueAt.getTime() <= o.maxHours * 3_600_000) return null;
  return matchesContactList(o.cfg.skipFirst, who) ? { reason: MANUAL_CATCHUP_REASON } : null;
}

/** Step rows that count as "an email went out" for spacing and the backlog guard. */
export function countsAsEmailed(r: { status: string; reason?: string | null }): boolean {
  return r.status === "sent" || r.status === "sending" || (r.status === "skipped" && r.reason === MANUAL_CATCHUP_REASON);
}
