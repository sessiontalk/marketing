/** BCC the internal reviewer on the first N trials enrolled after sending is enabled. */

export const DEFAULT_TRIAL_NURTURE_BCC = "maryam@sessiontalk.co.uk";
export const DEFAULT_TRIAL_NURTURE_BCC_COUNT = 10;

export function trialNurtureBccAddress(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): string {
  const v = (env.TRIAL_NURTURE_BCC ?? DEFAULT_TRIAL_NURTURE_BCC).trim();
  return v || DEFAULT_TRIAL_NURTURE_BCC;
}

export function trialNurtureBccCount(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): number {
  const raw = env.TRIAL_NURTURE_BCC_COUNT;
  if (raw === undefined || raw === "") return DEFAULT_TRIAL_NURTURE_BCC_COUNT;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TRIAL_NURTURE_BCC_COUNT;
}

/**
 * Set once at enrolment. True only while drip sending is enabled and fewer than
 * TRIAL_NURTURE_BCC_COUNT earlier trials already have bcc_internal=true.
 * Stable thereafter — worker must not recompute.
 */
export function assignBccInternal(opts: {
  sendingEnabled: boolean;
  earlierFlaggedCount: number;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): boolean {
  if (!opts.sendingEnabled) return false;
  return opts.earlierFlaggedCount < trialNurtureBccCount(opts.env);
}
