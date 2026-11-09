import { workspaceHost, stepLinkFields, formatTrialEndsDate } from "./links";
/**
 * SessionPBX (Teams Phone / Teams Business) trial nurture — activity-triggered.
 * Pure decision logic, no I/O, so it is unit-testable. Skip rules are re-checked at send time.
 * Source of truth for rules: sales/sessionpbx/nurture-sequence/README.md
 */
export type Step = 1 | 2 | 3 | 4 | 5;
export type Product = "teams_phone" | "teams_business" | "hosted" | "hosted_pbx" | "generic_softphone" | "signup_finish_setup";
/** Products enrolled in a nurture sequence (sequence key = sequenceKey(product)). */
export const NURTURE_PRODUCTS = ["teams_phone", "teams_business", "hosted_pbx", "generic_softphone", "signup_finish_setup"] as const;
export type SequenceKey = "sessionpbx_trial" | "hosted_pbx" | "generic_softphone" | "signup_finish_setup";
export function sequenceKey(product: string): SequenceKey | null {
  if (product === "teams_phone" || product === "teams_business") return "sessionpbx_trial";
  if (product === "hosted_pbx" || product === "generic_softphone" || product === "signup_finish_setup") return product;
  return null;
}

export interface TrialState {
  enrolledAt: Date;
  product: Product;               // when the CRM first saw trial.started (go-forward only)
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
  /** When the last nurture email actually went out (sent/sending). At most one email per trial per 24h. */
  lastSentAt?: Date | null;
}

export type Decision =
  | { step: Step; action: "send" }
  | { step: Step; action: "skip"; reason: string }
  | { action: "stop"; reason: string }
  | { action: "wait"; nextAt: Date | null };

const H = 3_600_000;
const D = 24 * H;

export function dueAt(step: Step, s: TrialState): Date | null {
  // Signup finish-setup: no project yet. Clock from enrolment / trialStartedAt (= signup time).
  if (s.product === "signup_finish_setup") {
    switch (step) {
      case 1: return s.enrolledAt; // draft: right after signup
      case 2: return new Date(s.enrolledAt.getTime() + 2 * D); // ~2 days later
      default: return null; // only 2 steps
    }
  }
  switch (step) {
    case 1: return s.projectCreatedAt ? new Date(s.projectCreatedAt.getTime() + H) : null;
    case 2: return new Date(s.trialStartedAt.getTime() + D);
    case 3: return new Date(s.trialStartedAt.getTime() + 3 * D);
    case 4: return new Date(s.trialStartedAt.getTime() + 7 * D);
    case 5: return s.trialEndsAt ? new Date(s.trialEndsAt.getTime() - 2 * D) : null;
  }
}

export function skipReason(step: Step, s: TrialState, now: Date): string | null {
  // Signup finish-setup: skip remaining steps once a project / trial exists.
  if (s.product === "signup_finish_setup") {
    if (s.projectCreatedAt) return "has_project";
    return null;
  }
  switch (step) {
    case 1: return s.extensionCount > 0 ? "has_extension" : null;
    case 2:
      // Generic Softphone: calls go through the customer's PBX, so a login is the signal.
      if (s.product === "generic_softphone") return s.softphoneFirstLoginAt ? "softphone_login_done" : null;
      return s.softphoneFirstLoginAt && s.firstCallAt ? "softphone_and_call_done" : null;
    // Nauman 12 Oct: Call Routing/Trunks needs Teams Business, so email 3 never goes to Teams Phone trials.
    case 3:
      if (s.product === "generic_softphone") return null; // app logo email: no skip
      return s.product === "teams_phone" ? "teams_phone_plan" : s.carrierConnectedAt ? "carrier_connected" : null;
    case 4: {
      // Nauman/CoS 12 Oct: no booked-call skip; only recent reply (+ short-trial collision).
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
  if (!sequenceKey(s.product)) return { action: "stop", reason: "no_sequence" };
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
    if (why) return { step, action: "skip", reason: why };
    // Max one email per trial per day, no catch-up blast: overdue steps wait >=24h after the last send.
    if (s.lastSentAt && now.getTime() - s.lastSentAt.getTime() < D) {
      return { action: "wait", nextAt: new Date(s.lastSentAt.getTime() + D) };
    }
    return { step, action: "send" };
  }
  return { action: "wait", nextAt: next };
}

export interface RenderFields {
  accountName?: string | null;
  /** SessionCloud public.tenants.sip_domain — use as-is (includes .sip). Never derive a non-.sip host. */
  sipDomain?: string | null;
  /** Explicit link overrides; otherwise filled from stepLinkFields(step, product). */
  workspaceUrl?: string | null;
  trialEndsAt?: Date | string | null;
  product?: string | null;
  step?: Step;
}

/** Fill placeholders. Caller must hold when missingLinkFields(step, fields) is non-empty. */
export function render(body: string, firstName: string | null | undefined, fields: RenderFields = {}): string {
  const name = (firstName || "").trim();
  let out = name
    ? body.replace(/\{first_name\}/g, name)
    : body.replace(/Hi \{first_name\},/g, "Hi there,").replace(/\{first_name\}/g, "there");
  const sip = (fields.sipDomain || "").trim();
  if (sip) out = out.replace(/\{sip_domain\}/g, workspaceHost(sip));
  const acct = (fields.accountName || "").trim();
  if (acct) out = out.replace(/\{accountName\}/g, encodeURIComponent(acct));
  const def = fields.step ? stepLinkFields(fields.step, fields.product) : {};
  const ws = (fields.workspaceUrl || def.workspaceUrl || "").trim();
  if (ws) out = out.replace(/\{workspace_url\}/g, ws);
  for (const [k, v] of Object.entries(def)) {
    if (k === "workspaceUrl" || k === "workspace_url" || !v) continue;
    out = out.split(`{${k}}`).join(v);
  }
  const ends = formatTrialEndsDate(fields.trialEndsAt);
  if (ends) out = out.replace(/\{trial_ends_date\}/g, ends);
  return out;
}

/** Render a subject line with the same fields (no "Hi {first_name}," fallback needed). */
export function renderSubject(subject: string, firstName: string | null | undefined, fields: RenderFields = {}): string {
  return render(subject, firstName, fields);
}
