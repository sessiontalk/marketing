import { NEWSLETTER_FROM_EMAIL, NEWSLETTER_REPLY_TO, LIST_UNSUBSCRIBE_MAILTO, type SendEmailParams } from "./email";
import { isValidUnsubscribeToken, listUnsubscribeHeaders, publicUnsubscribeUrl } from "./unsubscribe";

/**
 * Newsletter / broadcast message builder. Pure (no DB, no network). Every newsletter send must:
 *  1. pass assertSendable() (suppression.ts) for the recipient immediately before sending,
 *  2. use a fresh per-send unsubscribe_tokens row (token tied to the recipient's contacts row),
 *  3. go out with the headers built here: List-Unsubscribe <https one-click>, <mailto:support@>
 *     and List-Unsubscribe-Post (RFC 8058), From/Reply-To support@.
 */
export const UNSUBSCRIBE_PLACEHOLDER = "{{unsubscribe_url}}";

export interface NewsletterInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  token: string;
  tags?: Record<string, string>;
  env?: Record<string, string | undefined>;
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
    html: fill(i.html),
    text: fill(i.text),
    from: NEWSLETTER_FROM_EMAIL,
    replyTo: NEWSLETTER_REPLY_TO,
    headers: listUnsubscribeHeaders(url, LIST_UNSUBSCRIBE_MAILTO),
    tags: i.tags,
  };
}
