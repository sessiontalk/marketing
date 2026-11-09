/**
 * Signup → trial-nurture enrolment (no project yet) and upgrade on trial.started.
 *
 * Synthetic appId: `signup:<objectId>` (trial_accounts.app_id is NOT NULL UNIQUE).
 * On trial.started we rewrite that row to the real app_id + product sequence.
 *
 * Upgrade step mapping: see SIGNUP_TO_PRODUCT_STEP_MAP in copySignupFinishSetup.ts.
 * Signup COPY_GAP steps are final=false so nothing is sent before upgrade; product
 * sentSteps start empty (no duplicate product emails).
 */
import { SIGNUP_TO_PRODUCT_STEP_MAP } from "./copySignupFinishSetup";
import type { Product } from "./schedule";
import { sequenceKey } from "./schedule";

export const SIGNUP_PRODUCT: Product = "signup_finish_setup";

export function signupAppId(objectId: string): string {
  return `signup:${objectId}`;
}

export function isSignupAppId(appId: string | null | undefined): boolean {
  return !!appId && appId.startsWith("signup:");
}

/** Map product from a live trial.started payload (existing CRM contract). */
export function productFromTrialStarted(e: {
  product?: string | null;
  trial_type?: string | null;
}): Product | null {
  if (e.product === "teams_phone" || e.product === "teams_business" || e.product === "hosted_pbx" || e.product === "generic_softphone") {
    return e.product;
  }
  // Fallback from trial_type if product omitted
  if (e.trial_type === "teams_hosted") return "teams_phone";
  if (e.trial_type === "hosted_pbx") return "hosted_pbx";
  if (e.trial_type === "generic_softphone") return "generic_softphone";
  return null;
}

/**
 * Given signup steps already terminal (sent/skipped), which product steps should
 * be pre-marked so we never re-send an equivalent email. Today all map to null
 * (no equivalence); documented for HoM when signup copy is approved.
 */
export function productStepsAlreadyCoveredBySignup(sentSignupSteps: number[]): number[] {
  const out = new Set<number>();
  for (const s of sentSignupSteps) {
    const mapped = SIGNUP_TO_PRODUCT_STEP_MAP[s];
    if (typeof mapped === "number") out.add(mapped);
  }
  return [...out].sort((a, b) => a - b);
}

export function canEnrolSignupNurture(opts: {
  email: string;
  emailVerified: boolean | null | undefined;
  unsubscribed: boolean;
  isExcludedEmail: boolean;
  junkReason: string | null;
  alreadyHasActiveTrial: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (opts.isExcludedEmail) return { ok: false, reason: "excluded_email" };
  if (opts.unsubscribed) return { ok: false, reason: "unsubscribed" };
  if (!opts.emailVerified) return { ok: false, reason: "unverified_email" };
  if (opts.junkReason) return { ok: false, reason: opts.junkReason };
  if (opts.alreadyHasActiveTrial) return { ok: false, reason: "already_enrolled" };
  if (!sequenceKey(SIGNUP_PRODUCT)) return { ok: false, reason: "no_sequence" };
  return { ok: true };
}
