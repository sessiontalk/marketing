import { NEWSLETTER_FROM_EMAIL, NEWSLETTER_REPLY_TO, LIST_UNSUBSCRIBE_MAILTO, type SendEmailParams } from "./email";
import { isValidUnsubscribeToken, listUnsubscribeHeaders, publicUnsubscribeUrl } from "./unsubscribe";

/**
 * Newsletter / broadcast message builder. Pure (no DB, no network). Every newsletter send must:
 *  1. pass assertSendable() (suppression.ts) for the recipient immediately before sending,
 *  2. use a fresh per-send unsubscribe_tokens row (token tied to the recipient's contacts row),
 *  3. go out with the headers built here: List-Unsubscribe <https one-click>, <mailto:support@>
 *     and List-Unsubscribe-Post (RFC 8058), From/Reply-To support@,
 *  4. be logged as a `newsletter_sent` activity with the SES MessageId (sendNewsletterAndLog()).
 *
 * SES event publishing is opt-in: only when SES_CONFIGURATION_SET is set does a send carry
 * ConfigurationSetName and the contact_id / campaign / variant tags. Unset = neither is sent.
 */
export const UNSUBSCRIBE_PLACEHOLDER = "{{unsubscribe_url}}";
export const NEWSLETTER_SENT_ACTIVITY = "newsletter_sent";
export const NEWSLETTER_SEED_SOURCE = "newsletter_seed";

export interface NewsletterTracking {
  contactId: string;
  campaign: string; // e.g. newsletter-2026-10
  variant: string; // A1 | A2alt | B
}

export interface NewsletterInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  token: string;
  /** Contact/campaign/variant for SES tags (only used when SES_CONFIGURATION_SET is set). */
  tracking?: NewsletterTracking;
  env?: Record<string, string | undefined>;
}

/** SES tag values allow [A-Za-z0-9_.-] only (max 256): anything else becomes "_". */
export function sanitizeTagValue(v: unknown): string {
  const s = String(v ?? "").replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 256);
  return s || "_";
}

/** ConfigurationSetName + tags when SES_CONFIGURATION_SET is set; {} (send exactly as before) when unset. */
export function newsletterSesOptions(
  tracking: NewsletterTracking | undefined,
  env: Record<string, string | undefined> = process.env
): Pick<SendEmailParams, "configurationSetName" | "tags"> {
  const configurationSetName = (env.SES_CONFIGURATION_SET || "").trim();
  if (!configurationSetName) return {};
  return {
    configurationSetName,
    ...(tracking
      ? {
          tags: {
            contact_id: sanitizeTagValue(tracking.contactId),
            campaign: sanitizeTagValue(tracking.campaign),
            variant: sanitizeTagValue(tracking.variant),
          },
        }
      : {}),
  };
}

/**
 * Add `ses:no-track` to the unsubscribe and privacy anchors at render time, so SES click tracking
 * never rewrites them (the approved template files stay byte-identical). Mailto links are never
 * tracked by SES, so they are left alone. Idempotent.
 */
export function addSesNoTrack(html: string): string {
  return html.replace(/<a\b([^>]*)>/gi, (tag, attrs: string) => {
    if (/\sses:no-track\b/i.test(attrs)) return tag;
    const m = attrs.match(/\shref\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (!m) return tag;
    const href = (m[2] ?? m[3] ?? "").trim();
    const noTrack = href === UNSUBSCRIBE_PLACEHOLDER || /\/api\/unsubscribe\b/i.test(href) || /^https?:\/\/(www\.)?sessiontalk\.(io|co\.uk)\/privacy\b/i.test(href);
    return noTrack ? `<a ses:no-track${attrs}>` : tag;
  });
}

export function buildNewsletterMessage(i: NewsletterInput): SendEmailParams {
  if (!isValidUnsubscribeToken(i.token)) throw new Error("invalid unsubscribe token");
  if (!i.html.includes(UNSUBSCRIBE_PLACEHOLDER)) throw new Error("html template has no {{unsubscribe_url}} link");
  if (!i.text.includes(UNSUBSCRIBE_PLACEHOLDER)) throw new Error("text template has no {{unsubscribe_url}} link");
  const url = publicUnsubscribeUrl(i.token, i.env);
  const fill = (s: string) => s.split(UNSUBSCRIBE_PLACEHOLDER).join(url);
  return {
    to: i.to,
    subject: i.subject,
    html: fill(addSesNoTrack(i.html)),
    text: fill(i.text),
    from: NEWSLETTER_FROM_EMAIL,
    replyTo: NEWSLETTER_REPLY_TO,
    headers: listUnsubscribeHeaders(url, LIST_UNSUBSCRIBE_MAILTO),
    ...newsletterSesOptions(i.tracking, i.env ?? process.env),
  };
}

export interface NewsletterActivityRow {
  contactId: string;
  type: string;
  subject: string;
  body: string;
  performedBy: string;
}

/** The `newsletter_sent` activity row (existing activities table; JSON meta in body, no migration). */
export function newsletterSentActivity(
  t: NewsletterTracking & { messageId: string; subject: string; seed?: boolean }
): NewsletterActivityRow {
  return {
    contactId: t.contactId,
    type: NEWSLETTER_SENT_ACTIVITY,
    subject: `${t.campaign} (${t.variant}): ${t.subject}`.slice(0, 500),
    body: JSON.stringify({ campaign: t.campaign, variant: t.variant, ses_message_id: t.messageId, ...(t.seed ? { seed: true } : {}) }),
    performedBy: "newsletter",
  };
}

export interface NewsletterSendDeps {
  send(msg: SendEmailParams): Promise<{ id?: string }>;
  logActivity(row: NewsletterActivityRow): Promise<unknown>;
}

/** Send one newsletter message, then log `newsletter_sent` with the SES MessageId. Throws if SES returns none. */
export async function sendNewsletterAndLog(
  msg: SendEmailParams,
  t: NewsletterTracking & { seed?: boolean },
  deps: NewsletterSendDeps
): Promise<{ id: string }> {
  const out = await deps.send(msg);
  if (!out?.id) throw new Error("SES returned no MessageId");
  await deps.logActivity(newsletterSentActivity({ ...t, messageId: out.id, subject: msg.subject }));
  return { id: out.id };
}

/** Does this activity row record a send of `campaign`? (re-run guard for seed and broadcast) */
export function isNewsletterSentFor(row: { type: string | null; body: string | null }, campaign: string): boolean {
  if (row.type !== NEWSLETTER_SENT_ACTIVITY || !row.body) return false;
  try { return JSON.parse(row.body)?.campaign === campaign; } catch { return false; }
}
