/**
 * SessionPBX (Teams Phone / Teams Business) trial nurture — activity-triggered.
 * Pure decision logic, no I/O, so it is unit-testable. Skip rules are re-checked at send time.
 * Source of truth for rules: sales/sessionpbx/nurture-sequence/README.md
 */
export type Step = 1 | 2 | 3 | 4 | 5;

export interface TrialState {
  enrolledAt: Date;               // when the CRM first saw trial.started (go-forward only)
  trialStartedAt: Date;
  trialEndsAt: Date | null;
  projectCreatedAt: Date | null;
  extensionCount: number;
  softphoneFirstLoginAt: Date | null;
  firstCallAt: Date | null;
  carrierConnectedAt: Date | null;
  salesCallBookedAt: Date | null;
  salesCallHeldAt: Date | null;
  lastInboundReplyAt: Date | null;
  paymentMethodAddedAt: Date | null;
  planStatus: "trial" | "paid" | "cancelled";
  unsubscribed: boolean;
  sentSteps: Step[];              // steps already sent OR skipped (terminal per step)
}

export type Decision =
  | { step: Step; action: "send" }
  | { step: Step; action: "skip"; reason: string }
  | { action: "stop"; reason: string }
  | { action: "wait"; nextAt: Date | null };

const H = 3_600_000;
const D = 24 * H;

export function dueAt(step: Step, s: TrialState): Date | null {
  switch (step) {
    case 1: return s.projectCreatedAt ? new Date(s.projectCreatedAt.getTime() + H) : null;
    case 2: return new Date(s.trialStartedAt.getTime() + D);
    case 3: return new Date(s.trialStartedAt.getTime() + 3 * D);
    case 4: return new Date(s.trialStartedAt.getTime() + 7 * D);
    case 5: return s.trialEndsAt ? new Date(s.trialEndsAt.getTime() - 2 * D) : null;
  }
}

export function skipReason(step: Step, s: TrialState, now: Date): string | null {
  switch (step) {
    case 1: return s.extensionCount > 0 ? "has_extension" : null;
    case 2: return s.softphoneFirstLoginAt && s.firstCallAt ? "softphone_and_call_done" : null;
    case 3: return s.carrierConnectedAt ? "carrier_connected" : null;
    case 4: {
      if (s.salesCallBookedAt || s.salesCallHeldAt) return "sales_call";
      if (s.lastInboundReplyAt && now.getTime() - s.lastInboundReplyAt.getTime() < 7 * D) return "recent_reply";
      // Short trial: don't let step 4 land on the same day as step 5.
      const d5 = dueAt(5, s);
      if (d5 && d5.getTime() - (dueAt(4, s) as Date).getTime() < D) return "collides_with_step5";
      return null;
    }
    case 5: return s.paymentMethodAddedAt || s.planStatus === "paid" ? "card_or_paid" : null;
  }
}

/** Returns the single next action for this trial (worker calls repeatedly). */
export function decide(s: TrialState, now: Date): Decision {
  if (s.unsubscribed) return { action: "stop", reason: "unsubscribed" };
  if (s.planStatus === "paid") return { action: "stop", reason: "converted" };
  if (s.planStatus === "cancelled") return { action: "stop", reason: "cancelled" };
  if (s.trialEndsAt && now >= s.trialEndsAt) return { action: "stop", reason: "trial_ended" };

  let next: Date | null = null;
  for (const step of [1, 2, 3, 4, 5] as Step[]) {
    if (s.sentSteps.includes(step)) continue;
    const at = dueAt(step, s);
    if (!at) continue;
    // Go-forward only: never send a step whose due time predates enrolment by > 1 day (no backfill).
    if (at.getTime() < s.enrolledAt.getTime() - D) return { step, action: "skip", reason: "before_enrolment" };
    if (at > now) { if (!next || at < next) next = at; continue; }
    const why = skipReason(step, s, now);
    return why ? { step, action: "skip", reason: why } : { step, action: "send" };
  }
  return { action: "wait", nextAt: next };
}

export function render(body: string, firstName: string | null | undefined): string {
  const name = (firstName || "").trim();
  return name ? body.replace(/\{first_name\}/g, name) : body.replace(/Hi \{first_name\},/g, "Hi there,").replace(/\{first_name\}/g, "there");
}
