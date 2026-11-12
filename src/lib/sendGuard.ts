import { createHash } from "crypto";
import { isPlausibleEmail, normalizeEmail, type SuppressionStore } from "./suppression";

/**
 * Pre-send guard + configuration set for every CRM sender (Nauman, 12 Nov 2026: an address that
 * complained or hard-bounced is never emailed again by any SessionTalk sender).
 *
 * Suppression source: contacts.unsubscribed on ANY contacts row with the same lower(email)
 * (dbSuppressionStore). That flag is set by /api/unsubscribe, the CRM PATCH, scripts/suppress-emails.ts
 * and, once the SES events worker is live, by SES complaints / permanent bounces / SES unsubscribes
 * (it also sets contacts.do_not_contact_reason). Checking the store, not the row already loaded by the
 * worker, also catches a duplicate contact row with different casing.
 *
 * A store error propagates: the caller records the send as failed rather than sending blind.
 */

export type SendStream = "newsletter" | "trial_nurture" | "sequence";

/** ConfigurationSetName for a stream; undefined (omit it, send exactly as today) when the env is unset. */
export function sesConfigurationSetFor(stream: SendStream, env: Record<string, string | undefined> = process.env): string | undefined {
  const general = (env.SES_CONFIGURATION_SET || "").trim();
  if (stream === "trial_nurture") return (env.SES_NURTURE_CONFIGURATION_SET || "").trim() || general || undefined;
  return general || undefined;
}

/** Short non-reversible tag for logs; the address itself is never logged. */
export function recipientTag(email: string): string {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex").slice(0, 16);
}

export type SkipReason = "suppressed" | "invalid";

/**
 * Null when `to` may be emailed now; otherwise the reason, after logging a skip line.
 * Call immediately before building and sending each message.
 */
export async function preSendSkipReason(
  to: string,
  stream: SendStream,
  store: SuppressionStore,
  log: (line: Record<string, unknown>) => void = (l) => console.log(JSON.stringify(l))
): Promise<SkipReason | null> {
  const n = normalizeEmail(to);
  let reason: SkipReason | null = null;
  if (!isPlausibleEmail(n)) reason = "invalid";
  else if ((await store.suppressed([n])).has(n)) reason = "suppressed";
  if (reason) log({ level: "info", msg: "email_send_skipped", stream, reason, recipient: recipientTag(n) });
  return reason;
}
