import { NURTURE_COPY, NURTURE_SEQUENCES } from "./copy";
import { render, type Step } from "./schedule";
import { assertSafeNurtureText, UNFILLED_PLACEHOLDER_RE } from "./links";
import { renderNurtureHtml, htmlHasUnfilledPlaceholder, htmlToVisibleText, htmlHrefs } from "./htmlTemplate";
import { listUnsubscribeHeaders, publicUnsubscribeUrl } from "../unsubscribe";

export const TEAMS_PRODUCTS = ["teams_phone", "teams_business"] as const;
export function isTeamsProduct(p: string | null | undefined): boolean {
  return (TEAMS_PRODUCTS as readonly string[]).includes(p || "");
}

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const SIP_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:(?:uk|us|asia)\.sip|eu(?:\.sip)?)\.sessiontalk\.io$/i;
export const MAX_TEST_RECIPIENTS = 10;
const ALL_STEPS: Step[] = [1, 2, 3, 4, 5];

/** Placeholder token for test sends: the header has the production shape, but the link does nothing (no DB row). */
export const TEST_UNSUBSCRIBE_TOKEN = "test-send-no-token";

export interface TestSequenceInput {
  /** One address, a comma/semicolon/whitespace-separated list, or an array. Max MAX_TEST_RECIPIENTS. */
  to: string | string[];
  sipDomain: string;
  accountName?: string;
  firstName?: string;
  /** Subset of 1..5 to send (e.g. [1]). Default: all 5. */
  steps?: Array<number | string>;
  /** true: use the exact production subject (no "[TEST n/5]" prefix), for placement tests. */
  productionSubject?: boolean;
  /** Sequence to sample (default Teams "sessionpbx_trial"). */
  sequence?: keyof typeof NURTURE_SEQUENCES;
  /** Sample trial end (needed for generic_softphone step 5). Default: now + 2 days. */
  trialEndsAt?: Date | string;
}

export function parseRecipients(to: string | string[] | null | undefined): string[] {
  const parts = (Array.isArray(to) ? to : [to ?? ""]).flatMap((x) => String(x ?? "").split(/[\s,;]+/)).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) throw new Error("at least one recipient address is required");
  const out: string[] = [];
  for (const p of parts) {
    if (!EMAIL_RE.test(p)) throw new Error(`invalid recipient address: ${p}`);
    if (!out.some((o) => o.toLowerCase() === p.toLowerCase())) out.push(p);
  }
  if (out.length > MAX_TEST_RECIPIENTS) throw new Error(`at most ${MAX_TEST_RECIPIENTS} recipients`);
  return out;
}

export function parseSteps(steps: Array<number | string> | null | undefined): Step[] {
  if (steps == null || (Array.isArray(steps) && steps.length === 0)) return [...ALL_STEPS];
  if (!Array.isArray(steps)) throw new Error("steps must be an array of 1-5");
  const set = new Set<Step>();
  for (const s of steps) {
    const n = typeof s === "number" ? s : /^\d+$/.test(String(s).trim()) ? Number(String(s).trim()) : NaN;
    if (!ALL_STEPS.includes(n as Step)) throw new Error(`invalid step: ${String(s)}`);
    set.add(n as Step);
  }
  return ALL_STEPS.filter((s) => set.has(s));
}

/** Validate + render the selected approved steps for a sample tenant. Pure: no DB, no send. */
export function buildTestSequence(input: TestSequenceInput) {
  parseRecipients(input.to);
  const sipDomain = (input.sipDomain || "").trim();
  if (!SIP_RE.test(sipDomain)) throw new Error("invalid sample sip_domain");
  const accountName = (input.accountName || sipDomain.split(".")[0]).trim();
  const steps = parseSteps(input.steps);
  const seq = input.sequence ? NURTURE_SEQUENCES[input.sequence] : NURTURE_COPY;
  const product = input.sequence === "generic_softphone" || input.sequence === "hosted_pbx" ? input.sequence : null;
  const trialEndsAt = input.trialEndsAt ?? new Date(Date.now() + 2 * 24 * 3_600_000);
  return seq.filter((c) => steps.includes(c.step)).map((c) => {
    const fields = { sipDomain, accountName, trialEndsAt, product, step: c.step };
    const text = render(c.body, input.firstName ?? "", fields);
    const subj = render(c.subject, input.firstName ?? "", fields);
    if (UNFILLED_PLACEHOLDER_RE.test(text) || UNFILLED_PLACEHOLDER_RE.test(subj)) throw new Error(`unfilled placeholder in step ${c.step}`);
    assertSafeNurtureText(text, sipDomain);
    const subject = input.productionSubject ? subj : `[TEST ${c.step}/5] ${subj}`;
    const htmlBody = c.html ? render(c.html, input.firstName ?? "", fields) : undefined;
    const html = renderNurtureHtml({ textBody: text, unsubscribeUrl: publicUnsubscribeUrl(TEST_UNSUBSCRIBE_TOKEN), subject: subj, htmlBody });
    if (htmlHasUnfilledPlaceholder(html)) throw new Error(`unfilled placeholder in html step ${c.step}`);
    assertSafeNurtureText(htmlToVisibleText(html) + "\n" + htmlHrefs(html), sipDomain);
    return { step: c.step, subject, text, html };
  });
}

/** Everything the admin test-send route needs: recipients x steps, plus production-shaped headers. Pure. */
export function buildTestSend(input: TestSequenceInput, mailto: string) {
  const recipients = parseRecipients(input.to);
  const steps = buildTestSequence(input);
  const headers = listUnsubscribeHeaders(publicUnsubscribeUrl(TEST_UNSUBSCRIBE_TOKEN), mailto);
  return { recipients, steps, headers };
}
