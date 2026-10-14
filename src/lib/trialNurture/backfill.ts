import { isTeamsProduct } from "./testSequence";

export const STEP1_SENT_AT = new Date("2026-10-12T16:05:00Z");

export interface BackfillInput {
  email: string; firstname?: string | null; appId: string; accountName: string;
  sipDomain?: string | null; slug?: string | null; product: string; planStatus: string;
  trialStartedAt: string; trialEndsAt?: string | null;
}
export interface BackfillRow {
  email: string; firstname: string | null; appId: string; accountName: string; sipDomain: string | null; slug: string;
  product: "teams_phone" | "teams_business"; trialStartedAt: Date; trialEndsAt: Date | null;
}

/** Pure: only active Teams trials (plan 'trial', not ended) are enrolled; others reported as skipped. */
export function planBackfill(input: BackfillInput[], now: Date) {
  const eligible: BackfillRow[] = []; const skipped: Array<{ slug: string; reason: string }> = [];
  for (const r of input) {
    const slug = (r.slug || (r.sipDomain || "").split(".")[0] || r.accountName || "?").toLowerCase();
    if (!isTeamsProduct(r.product)) { skipped.push({ slug, reason: "not_teams" }); continue; }
    if (r.planStatus !== "trial") { skipped.push({ slug, reason: `plan_${r.planStatus}` }); continue; }
    const end = r.trialEndsAt ? new Date(r.trialEndsAt) : null;
    if (end && end <= now) { skipped.push({ slug, reason: "trial_ended" }); continue; }
    if (!r.email?.includes("@") || !r.appId) { skipped.push({ slug, reason: "missing_fields" }); continue; }
    eligible.push({ email: r.email.trim().toLowerCase(), firstname: r.firstname ?? null, appId: r.appId, accountName: r.accountName,
      sipDomain: r.sipDomain ?? null, slug, product: r.product as BackfillRow["product"], trialStartedAt: new Date(r.trialStartedAt), trialEndsAt: end });
  }
  return { eligible, skipped };
}