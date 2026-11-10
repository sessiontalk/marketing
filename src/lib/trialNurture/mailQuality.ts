/**
 * Pre-send mail-quality checks for signup follow-ups (verify reminder and drips).
 * Applied before both the verify-reminder and product/signup drips.
 *
 * - Disposable mailbox domains (built-in list).
 * - Carrier email-to-SMS/MMS gateways (tmomail.net, vtext.com, txt.att.net, …).
 *   att.net and o2.co.uk are real ISP domains, not gateways, and must not be flagged.
 * - MX lookup with an in-memory cache. Timeout / DNS error → hold (fail-safe, do not send).
 */
import { promises as dns } from "node:dns";

export const MX_LOOKUP_TIMEOUT_MS = 2000;
export const MX_CACHE_TTL_MS = 10 * 60 * 1000;
export const MX_CACHE_FAILURE_TTL_MS = 60 * 1000;

/** Well-known disposable / temporary mailbox domains. Lowercase, no leading dot. */
export const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamailblock.com", "sharklasers.com",
  "grr.la", "guerrillamail.net", "guerrillamail.org", "pokemail.net",
  "10minutemail.com", "10minutemail.net", "tempmail.com", "temp-mail.org",
  "tmpmail.org", "throwaway.email", "yopmail.com", "yopmail.fr", "yopmail.net",
  "trashmail.com", "trashmail.net", "getnada.com", "mailnesia.com", "maildrop.cc",
  "discard.email", "fakeinbox.com", "getairmail.com", "mintemail.com",
  "tempail.com", "moakt.com", "emailondeck.com", "mytemp.email", "mailcatch.com",
  "trash-mail.com", "tempr.email", "dispostable.com", "mailinator.net",
]);

/**
 * Carrier email-to-SMS / MMS gateways. Host must match exactly (or be a subdomain
 * of one of these). Do not put att.net or o2.co.uk here.
 */
export const CARRIER_GATEWAY_DOMAINS: ReadonlySet<string> = new Set([
  "tmomail.net",
  "vtext.com",
  "vzwpix.com",
  "txt.att.net",
  "mms.att.net",
  "cingularme.com",
  "mobile.mycingular.com",
  "messaging.sprintpcs.com",
  "pm.sprint.com",
  "sms.myboostmobile.com",
  "myboostmobile.com",
  "mms.cricketwireless.net",
  "sms.mycricket.com",
  "email.uscc.net",
  "mms.uscc.net",
  "msg.fi.google.com",
  "mymetropcs.com",
  "vmobl.com",
  "mailmymobile.net",
  "text.republicwireless.com",
  "sms.myboostmobile.com",
  "mmst5.tracfone.com",
  "tmomail.net",
]);

export type MxResolve = (domain: string) => Promise<Array<{ priority: number; exchange: string }>>;

type CacheEntry = { at: number; reason: string | null; ttl: number };
const mxCache = new Map<string, CacheEntry>();

export function clearMxCache(): void {
  mxCache.clear();
}

export function emailDomain(email: string | null | undefined): string | null {
  const at = (email || "").trim().toLowerCase().lastIndexOf("@");
  if (at < 0) return null;
  const d = (email || "").trim().toLowerCase().slice(at + 1).replace(/\.+$/, "");
  return d || null;
}

export function isDisposableDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase();
  if (DISPOSABLE_DOMAINS.has(d)) return true;
  // also match subdomains of a listed disposable host
  for (const root of DISPOSABLE_DOMAINS) {
    if (d.endsWith("." + root)) return true;
  }
  return false;
}

export function isCarrierGatewayDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase();
  if (CARRIER_GATEWAY_DOMAINS.has(d)) return true;
  for (const root of CARRIER_GATEWAY_DOMAINS) {
    if (d.endsWith("." + root)) return true;
  }
  return false;
}

export async function lookupMx(
  domain: string,
  resolveMx: MxResolve = (d) => dns.resolveMx(d),
  timeoutMs: number = MX_LOOKUP_TIMEOUT_MS,
): Promise<"ok" | "no_mx" | "mx_lookup_failed"> {
  try {
    const records = await Promise.race([
      resolveMx(domain),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(Object.assign(new Error("mx_timeout"), { code: "ETIMEOUT" })), timeoutMs);
      }),
    ]);
    if (!records || records.length === 0) return "no_mx";
    return "ok";
  } catch (err: any) {
    const code = String(err?.code || err?.errno || "");
    if (code === "ENODATA" || code === "ENOTFOUND" || code === "ENOENT") return "no_mx";
    return "mx_lookup_failed";
  }
}

/**
 * Returns a hold reason, or null if the address looks deliverable.
 * Disposable / gateway checks are sync and run first; MX is cached.
 */
export async function emailDeliverabilityReason(
  email: string | null | undefined,
  resolveMx?: MxResolve,
  now: number = Date.now(),
  timeoutMs: number = MX_LOOKUP_TIMEOUT_MS,
): Promise<string | null> {
  const domain = emailDomain(email);
  if (!domain) return "no_mx";
  if (isDisposableDomain(domain)) return "disposable_domain";
  if (isCarrierGatewayDomain(domain)) return "carrier_gateway";

  const cached = mxCache.get(domain);
  if (cached && now - cached.at < cached.ttl) return cached.reason;

  const result = await lookupMx(domain, resolveMx ?? ((d) => dns.resolveMx(d)), timeoutMs);
  const reason = result === "ok" ? null : result;
  const ttl = reason ? MX_CACHE_FAILURE_TTL_MS : MX_CACHE_TTL_MS;
  mxCache.set(domain, { at: now, reason, ttl });
  return reason;
}
