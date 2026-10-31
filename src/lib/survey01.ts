/**
 * Survey #1 ("What should we build next?") send helpers. Pure functions, no DB/SES, unit-tested
 * in tests/survey01.test.ts. CLI wiring: scripts/survey-01/send-survey01.ts.
 *
 * Reuses the newsletter safety model (planBroadcast/runBroadcast, buildNewsletterMessage:
 * From/Reply-To support@, List-Unsubscribe + one-click, SES config set + tags) and adds:
 *  - a placeholder gate (no TODO / PLACEHOLDER / FORMID / example URLs, real https://tally.so/r/<id> forms),
 *  - an account-reputation gate (refuse at/above a configurable bounce / complaint rate),
 *  - per-batch stop rules (pause on any complaint or 2+ hard bounces in the previous batch).
 */

export const SURVEY_CAMPAIGN = "survey-01";
export const SURVEY_VARIANT = "S01";
export const SURVEY_VERSION = "s01";
export const SURVEY_TEMPLATE_FILE = "survey01-invite";
export const surveyClaimKey = (contactId: string) => `survey:${SURVEY_CAMPAIGN}:${contactId}`;

/** Defaults match the newsletter stop rules. */
export const DEFAULT_MAX_BOUNCE_RATE = 0.045;
export const DEFAULT_MAX_COMPLAINT_RATE = 0.0008;
export const PAUSE_HARD_BOUNCES_PER_BATCH = 2;

const PLACEHOLDER_WORDS_RE = /\bTODO\b|PLACEHOLDER|FORMID|FRFORM|\bXXX+\b|https?:\/\/[^\s"'<>]*example\.(com|org|net)/i;
const TALLY_RE = /^https:\/\/tally\.so\/r\/[A-Za-z0-9]{4,16}$/;

/** Problems with a template body: placeholder words or example URLs. ({{survey_url}} tokens are fine: filled at send time.) */
export function templatePlaceholderProblems(name: string, s: string): string[] {
  return PLACEHOLDER_WORDS_RE.test(s) ? [`placeholder link/text in ${name}`] : [];
}

/** A form URL must be a real Tally form link: https://tally.so/r/<id>, no query, no placeholder words. */
export function formUrlProblems(label: string, url: string | undefined): string[] {
  if (!url) return [`${label} not given`];
  if (PLACEHOLDER_WORDS_RE.test(url) || /example\.(com|org|net)|\{\{/i.test(url)) return [`${label} is a placeholder`];
  if (!TALLY_RE.test(url)) return [`${label} must look like https://tally.so/r/<formId>`];
  return [];
}

/** Hidden fields (seg, v, optional signed t). Never the unsubscribe token. */
/** Survey links are tagged by segment and version only (no per-person token). */
export function surveyLink(base: string, f: { seg?: string; v?: string }): string {
  const u = new URL(base);
  u.searchParams.delete("t");
  if (f.seg) u.searchParams.set("seg", f.seg.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 64));
  u.searchParams.set("v", f.v || SURVEY_VERSION);
  return u.toString();
}

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** First name for the greeting: one plain word, else the fallback. */
export function safeFirstName(v: string | undefined): string | undefined {
  const s = String(v ?? "").trim();
  if (!s || s.length > 40 || /[@<>{}\/\\:]|\d{3,}/.test(s)) return undefined;
  return s.split(/\s+/)[0];
}

/** Fill {{first_name|fallback}}, {{survey_url}}, {{feature_request_url}}; leaves {{unsubscribe_url}} for buildNewsletterMessage. */
export function renderSurvey(tpl: string, v: { firstName?: string; surveyUrl: string; featureUrl: string }, html: boolean): string {
  const e = html ? escHtml : (s: string) => s;
  const out = tpl
    .replace(/\{\{\s*first_name\s*(?:\|\s*([^}]*))?\}\}/g, (_m, fb) => e(v.firstName || String(fb ?? "").trim() || "there"))
    .split("{{survey_url}}").join(e(v.surveyUrl))
    .split("{{feature_request_url}}").join(e(v.featureUrl));
  const left = (out.match(/\{\{[^}]*\}\}/g) || []).filter((m) => m !== "{{unsubscribe_url}}");
  if (left.length) throw new Error(`unfilled placeholder(s): ${Array.from(new Set(left)).join(", ")}`);
  return out;
}

export interface Rates { bounce: number | null; complaint: number | null }

/** Pre-send / between-batch account gate. Unreadable rates also refuse (fail closed). */
export function reputationGate(r: Rates, o: { maxBounce: number; maxComplaint: number }): string[] {
  const f: string[] = [];
  if (r.bounce == null || !Number.isFinite(r.bounce)) f.push("account bounce rate unreadable");
  else if (r.bounce >= o.maxBounce) f.push(`account bounce rate ${(r.bounce * 100).toFixed(2)}% >= ${(o.maxBounce * 100).toFixed(2)}%`);
  if (r.complaint == null || !Number.isFinite(r.complaint)) f.push("account complaint rate unreadable");
  else if (r.complaint >= o.maxComplaint) f.push(`account complaint rate ${(r.complaint * 100).toFixed(3)}% >= ${(o.maxComplaint * 100).toFixed(3)}%`);
  return f;
}

/** Per-batch rule from the previous batch's SES events: pause on any complaint or 2+ hard bounces. */
export function batchStopRule(m: { hardBounces: number; complaints: number }): string | null {
  if (m.complaints > 0) return `pause: ${m.complaints} complaint(s) in previous batch`;
  if (m.hardBounces >= PAUSE_HARD_BOUNCES_PER_BATCH) return `pause: ${m.hardBounces} hard bounces in previous batch`;
  return null;
}

/**
 * Smallest number of hard bounces in `newSends` that lifts a rolling account rate from `rate`
 * (over `windowSends`) to >= `threshold`. Approximation: SES uses a representative-volume window.
 */
export function bouncesToTrip(rate: number, windowSends: number, newSends: number, threshold: number): number {
  const base = rate * windowSends;
  for (let x = 0; x <= newSends; x++) if ((base + x) / (windowSends + newSends) >= threshold - 1e-12) return x;
  return Infinity;
}

export function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
