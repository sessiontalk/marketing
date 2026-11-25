/**
 * Daily trial-nurture health check (pure; route: /api/worker/nurture-health).
 * Flags, from the CRM's own records (trial_nurture_steps = what the worker handed to SES):
 *  - first_step_sla: a queued row that has never been emailed and whose next email was due more
 *    than FIRST_STEP_SLA_HOURS ago (the 17-25 Nov starvation would have tripped this within a day);
 *  - no_sends_24h: rows are overdue but nothing at all was sent in the last 24h;
 *  - send_failed: any step marked failed in the last 24h.
 * The SES-side cross-check (S3 SES event archive vs these sends) is outside the app; see README.
 */
import { decide, dueAt, type Step, type TrialState } from "./schedule";

export const FIRST_STEP_SLA_HOURS = 2;
const H = 3_600_000;

export interface HealthRow {
  id: string;
  appId: string;
  product: string;
  /** Decision input (as the worker builds it). */
  state: TrialState;
  /** Steps with status sent/sending (actually emailed). */
  emailedSteps: number[];
  /** Why the worker holds this row by design (excluded, junk, copy not final), or null. */
  holdReason: string | null;
}

export interface HealthInput {
  now: Date;
  rows: HealthRow[];
  sentLast24h: number;
  failedLast24h: Array<{ trialAccountId: string; step: number; reason: string | null }>;
  lateFirstStepMaxHours: number;
}

export interface Overdue { trialAccountId: string; appId: string; product: string; step: Step; dueAt: string; hoursLate: number; backlogHeld: boolean }

export function assessNurtureHealth(i: HealthInput) {
  const overdue: Overdue[] = [];
  for (const r of i.rows) {
    if (r.holdReason || r.emailedSteps.length) continue;
    const d = decide(r.state, i.now);
    if (d.action !== "send") continue; // wait/stop, or a skip the next run records (not an email)
    const at = dueAt(d.step, r.state);
    if (!at) continue;
    const late = (i.now.getTime() - at.getTime()) / H;
    if (late > FIRST_STEP_SLA_HOURS) {
      overdue.push({ trialAccountId: r.id, appId: r.appId, product: r.product, step: d.step, dueAt: at.toISOString(),
        hoursLate: Math.round(late * 10) / 10, backlogHeld: late > i.lateFirstStepMaxHours });
    }
  }
  const alerts: Array<{ kind: "first_step_sla" | "no_sends_24h" | "send_failed"; summary: string }> = [];
  if (overdue.length) alerts.push({ kind: "first_step_sla", summary: `${overdue.length} new signup/trial(s) without a first email more than ${FIRST_STEP_SLA_HOURS}h after it was due` });
  if (overdue.length && i.sentLast24h === 0) alerts.push({ kind: "no_sends_24h", summary: `0 nurture emails sent in 24h while ${overdue.length} are overdue` });
  if (i.failedLast24h.length) alerts.push({ kind: "send_failed", summary: `${i.failedLast24h.length} nurture send(s) failed in the last 24h` });
  return { ok: alerts.length === 0, alerts, overdue, sentLast24h: i.sentLast24h, failedLast24h: i.failedLast24h };
}
