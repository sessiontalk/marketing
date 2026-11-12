/**
 * Softphone sequence v2 (6 emails). Live drip before this PR was 5 emails (#14 / b656036).
 * In-flight rows in trial_nurture_steps use OLD indices. Remap by content key at read time.
 *
 * Content keys: 1 provisioning | 2 qr_desktop | 3 push_branding | 4 messaging (NEW)
 *               5 check_in (was 4) | 6 trial_ending (was 5)
 *
 * Legacy index → v2: 1→1, 2→2, 3→3, 4→5, 5→6
 *
 * Version marker: step 0 / reason softphone_seq_v2 (lazy, per trial). Once present, stored
 * step numbers are v2 and must not be remapped. scripts/migrations/softphone-v2-renumber.sql
 * bulk-renumbers + stamps markers (DO NOT auto-run; required before go-live to avoid
 * UNIQUE (trial_account_id, step) conflicts when claiming new messaging as step 4).
 *
 * Messaging catch-up (Nauman decision; code default = send once unless trial-ending done):
 * - trial_ending (6) already terminal → skip messaging (treat 4 as sent)
 * - else → allow messaging once as catch-up / on schedule (recommended default)
 * Alternate: also skip when check_in (5) already sent — set messagingCatchup:false
 */
export const SOFTPHONE_SEQUENCE_VERSION = 2;
export const SOFTPHONE_SEQ_MARKER_STEP = 0;
export const SOFTPHONE_SEQ_MARKER_REASON = "softphone_seq_v2";

export const LEGACY_SOFTPHONE_STEP_TO_V2: Readonly<Record<number, number>> = {
  1: 1,
  2: 2,
  3: 3,
  4: 5,
  5: 6,
};

export const SOFTPHONE_CONTENT_KEY: Readonly<Record<number, string>> = {
  1: "provisioning",
  2: "qr_desktop",
  3: "push_branding",
  4: "messaging",
  5: "check_in",
  6: "trial_ending",
};

/** Recommended default: catch-up messaging unless trial-ending already sent. */
export const SOFTPHONE_MESSAGING_CATCHUP_DEFAULT = true;

export function isSoftphoneSeqV2(sent: readonly number[]): boolean {
  if (sent.includes(SOFTPHONE_SEQ_MARKER_STEP) || sent.includes(6)) return true;
  // Migrated check-in without messaging: has 5, no 4, no 6 (legacy never had 5 without 4).
  if (sent.includes(5) && !sent.includes(4)) return true;
  // Only 1..3 (or empty): identity under both schemes.
  if (!sent.includes(4) && !sent.includes(5)) return true;
  return false;
}

/**
 * Map legacy sent/skipped step numbers to v2 content indices + messaging catch-up.
 * Idempotent for already-v2 lists. Strips the step-0 marker from the returned array.
 */
export function mapLegacySoftphoneSentSteps(
  sent: readonly number[],
  opts: { messagingCatchup?: boolean } = {},
): number[] {
  const catchup = opts.messagingCatchup ?? SOFTPHONE_MESSAGING_CATCHUP_DEFAULT;
  const raw = sent.filter((s) => s !== SOFTPHONE_SEQ_MARKER_STEP);
  let mapped: number[];
  if (isSoftphoneSeqV2(sent)) {
    mapped = [...raw];
  } else {
    mapped = raw.map((s) => LEGACY_SOFTPHONE_STEP_TO_V2[s] ?? s);
  }
  const out = [...new Set(mapped)].filter((s) => s >= 1 && s <= 6).sort((a, b) => a - b);

  if (!out.includes(4)) {
    if (out.includes(6)) {
      out.push(4); // ending already sent → skip messaging
    } else if (!catchup && out.includes(5)) {
      out.push(4); // alternate: past check-in → skip messaging
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/** True when DB still has legacy indices that would collide with claiming v2 step 4. */
export function softphoneDbNeedsRenumber(sent: readonly number[]): boolean {
  if (isSoftphoneSeqV2(sent)) return false;
  return sent.includes(4) || sent.includes(5);
}
