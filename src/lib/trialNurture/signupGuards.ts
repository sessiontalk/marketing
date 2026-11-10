/**
 * Signup finish-setup eligibility guards (pure, no I/O, no imports so schedule.ts and
 * signupEnrolment.ts can both use it without an import cycle).
 *
 * Used at enrol-on-verify (canEnrolSignupNurture) AND re-checked by the worker before
 * every signup_finish_setup send (schedule.ts skipReason), so a contact enrolled before
 * these guards existed is still skipped with a recorded reason.
 */

/** Enrol-on-verify cap: the SessionCloud signup must be at most this old when enrolled. */
export const SIGNUP_NURTURE_MAX_ACCOUNT_AGE_DAYS = 14;

const DAY_MS = 86_400_000;
const SIGNUP_SEQUENCE_PRODUCT_NAMES: readonly string[] = ["signup_finish_setup", "signup_verify_reminder"];

export interface TrialRowLike {
  product?: string | null;
  planStatus?: string | null;
  trialEndsAt?: Date | null;
  projectCreatedAt?: Date | null;
}

/** A 'trial' row whose trial_ends_at has passed (SessionCloud never sent a cancel/paid). */
export function isTrialRowStale(r: TrialRowLike, now: Date): boolean {
  return r.planStatus === "trial" && !!r.trialEndsAt && r.trialEndsAt.getTime() <= now.getTime();
}

/** Active = paid, or 'trial' whose trial_ends_at is null or still in the future. */
export function isTrialRowActive(r: TrialRowLike, now: Date): boolean {
  if (r.planStatus === "paid") return true;
  return r.planStatus === "trial" && !isTrialRowStale(r, now);
}

export function isSignupSequenceProduct(product: string | null | undefined): boolean {
  return !!product && SIGNUP_SEQUENCE_PRODUCT_NAMES.includes(product);
}

/**
 * Prior product history for a contact, whatever the plan_status
 * (trial / stale trial / paid / cancelled all count).
 */
export function contactTrialHistory(rows: readonly TrialRowLike[]): { hasPriorProductTrial: boolean; hasProject: boolean } {
  return {
    hasPriorProductTrial: rows.some((r) => !isSignupSequenceProduct(r.product)),
    hasProject: rows.some((r) => !!r.projectCreatedAt),
  };
}

/**
 * Signup created date used for the age cap: contacts.original_created_at (the SessionCloud
 * user createdAt sent on the signup webhook / CSV import); falls back to contacts.created_at
 * (CRM insert time) when SessionCloud's date was never stored.
 */
export function signupCreatedAtOf(c: { originalCreatedAt?: Date | null; createdAt?: Date | null }): Date | null {
  return c.originalCreatedAt ?? c.createdAt ?? null;
}

/** True when the signup was more than SIGNUP_NURTURE_MAX_ACCOUNT_AGE_DAYS old at `at` (enrolment time). Unknown date → false. */
export function signupAccountTooOld(signupCreatedAt: Date | null | undefined, at: Date): boolean {
  if (!signupCreatedAt) return false;
  return at.getTime() - signupCreatedAt.getTime() > SIGNUP_NURTURE_MAX_ACCOUNT_AGE_DAYS * DAY_MS;
}

/** Shared reason (null = eligible) for the enrol gate and the worker re-check. */
export function signupHistoryReason(opts: {
  hasProject?: boolean;
  hasPriorProductTrial?: boolean;
  signupCreatedAt?: Date | null;
  at: Date;
}): "has_project" | "has_prior_product_trial" | "account_too_old" | null {
  if (opts.hasProject) return "has_project";
  if (opts.hasPriorProductTrial) return "has_prior_product_trial";
  if (signupAccountTooOld(opts.signupCreatedAt, opts.at)) return "account_too_old";
  return null;
}
