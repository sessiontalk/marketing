/**
 * Deterministic fingerprint of every nurture email the worker can send today
 * (NURTURE_SEQUENCES: raw copy, rendered subject, text and HTML through the
 * production render path). Used to prove the YouTube-thumbnail drafts leave
 * approved/live content byte-identical.
 *
 * Regenerate the fixture ONLY when approved copy changes on purpose:
 *   npx tsx scripts/approved-render-hashes.ts > tests/fixtures/approved-nurture-render-hashes.json
 */
import { createHash } from "node:crypto";
import { NURTURE_SEQUENCES } from "../../src/lib/trialNurture/copy";
import { render, renderSubject, type Step } from "../../src/lib/trialNurture/schedule";
import { renderNurtureHtml, escapeHtml } from "../../src/lib/trialNurture/htmlTemplate";

const PRODUCT: Record<string, string> = {
  sessionpbx_trial: "teams_phone",
  hosted_pbx: "hosted_pbx",
  generic_softphone: "generic_softphone",
  signup_finish_setup: "signup_finish_setup",
  signup_verify_reminder: "signup_verify_reminder",
};

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export const FIXTURE_FIELDS = {
  sipDomain: "acme.uk.sip.sessiontalk.io",
  accountName: "acme",
  trialEndsAt: new Date("2026-11-20T12:00:00Z"),
  verifyUrl: "https://cloud.sessiontalk.io/confirm-email?t=fixture",
};
export const FIXTURE_UNSUBSCRIBE_URL = "https://marketing.sessiontalk.co.uk/api/unsubscribe?token=fixture";

export function approvedRenderHashes(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, seq] of Object.entries(NURTURE_SEQUENCES)) {
    out[`${key}#meta`] = sha(JSON.stringify(seq.map((c) => [c.step, c.file, c.final])));
    for (const c of seq) {
      out[`${key}#${c.step}#raw`] = sha(JSON.stringify(c));
      for (const firstName of ["Sam", ""]) {
        const fields = { ...FIXTURE_FIELDS, product: PRODUCT[key], step: c.step as Step };
        const text = render(c.body, firstName, fields);
        const subject = renderSubject(c.subject, firstName, fields);
        const htmlBody = c.html ? render(c.html, escapeHtml(firstName), fields) : undefined;
        const html = renderNurtureHtml({ textBody: text, unsubscribeUrl: FIXTURE_UNSUBSCRIBE_URL, subject, htmlBody });
        const k = `${key}#${c.step}#${firstName ? "named" : "anon"}`;
        out[`${k}#subject`] = sha(subject);
        out[`${k}#text`] = sha(text);
        out[`${k}#html`] = sha(html);
      }
    }
  }
  return out;
}
