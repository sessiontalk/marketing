import { NURTURE_COPY } from "./copy";
import { render } from "./schedule";
import { assertSafeNurtureText } from "./links";

export const TEAMS_PRODUCTS = ["teams_phone", "teams_business"] as const;
export function isTeamsProduct(p: string | null | undefined): boolean {
  return (TEAMS_PRODUCTS as readonly string[]).includes(p || "");
}

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const SIP_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:(?:uk|us|asia)\.sip|eu(?:\.sip)?)\.sessiontalk\.io$/i;

export interface TestSequenceInput { to: string; sipDomain: string; accountName?: string; firstName?: string }

/** Validate + render all 5 approved steps for a sample tenant. Pure: no DB, no send. */
export function buildTestSequence(input: TestSequenceInput) {
  const to = (input.to || "").trim();
  if (!EMAIL_RE.test(to)) throw new Error("to must be a single email address");
  const sipDomain = (input.sipDomain || "").trim();
  if (!SIP_RE.test(sipDomain)) throw new Error("invalid sample sip_domain");
  const accountName = (input.accountName || sipDomain.split(".")[0]).trim();
  return NURTURE_COPY.map((c) => {
    const text = render(c.body, input.firstName ?? "", { sipDomain, accountName });
    if (/\{(sip_domain|accountName|first_name)\}/.test(text)) throw new Error(`unfilled placeholder in step ${c.step}`);
    assertSafeNurtureText(text, sipDomain);
    return { step: c.step, subject: `[TEST ${c.step}/5] ${c.subject}`, text };
  });
}