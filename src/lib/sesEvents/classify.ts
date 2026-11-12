import type { SesEvent } from "./parse";

/**
 * Bot / security-scanner / prefetch heuristics. Pure: given every stored event for ONE
 * SES messageId (+recipient), return is_bot + reason for each open/click.
 * Re-run whenever new events for that message arrive (delivery may land after a click).
 */
export const FAST_CLICK_MS = 60_000;   // click within 60s of delivery
export const BURST_MS = 5_000;         // >=2 distinct links clicked within 5s
export const FAST_OPEN_MS = 5_000;     // open within 5s of delivery = prefetch/scanner
export const SCANNER_UA = /python-requests|curl\/|wget|go-http-client|okhttp|java\/|libwww|httpclient|aiohttp|node-fetch|axios|headlesschrome|phantomjs|bot\b|crawler|spider|barracuda|mimecast|proofpoint|ppops|forcepoint|symantec|messagelabs|trendmicro|sophos|fortiguard|safelinks|safebrowsing|urldefense|bitdefender|zscaler|ironport/i;
/** Cheap known scanner prefixes (Microsoft Defender/ATP Safe Links egress, Google security scans). Extend as needed. */
export const SCANNER_IP_PREFIXES = ["40.94.", "40.92.", "40.93.", "40.107.", "52.100.", "52.101.", "52.102.", "52.103.", "104.47."];
/** Apple Mail Privacy Protection: generic UA, Apple egress (17.0.0.0/8) or bare "Mozilla/5.0". */
export function isAppleMpp(ua: string | null, ip: string | null): boolean {
  const u = (ua ?? "").trim();
  return u === "Mozilla/5.0" || (!!ip && ip.startsWith("17.") && !/Chrome|Firefox|Edg\//.test(u));
}

export interface Verdict { isBot: boolean; reason: string | null }

export function classifyMessage(events: SesEvent[]): Map<string, Verdict> {
  const out = new Map<string, Verdict>();
  const delivery = events.filter((e) => e.kind === "delivery").map((e) => e.occurredAt.getTime()).sort()[0];
  const clicks = events.filter((e) => e.kind === "click").sort((a, b) => +a.occurredAt - +b.occurredAt);
  const distinctLinks = new Set(clicks.map((c) => c.link));
  const allFast = delivery != null && clicks.length > 0 && clicks.every((c) => +c.occurredAt - delivery <= FAST_CLICK_MS);

  for (const e of events) {
    if (e.kind !== "click" && e.kind !== "open") continue;
    const ua = e.userAgent ?? "";
    let reason: string | null = null;
    if (SCANNER_UA.test(ua)) reason = "scanner_user_agent";
    else if (e.ipAddress && SCANNER_IP_PREFIXES.some((p) => e.ipAddress!.startsWith(p))) reason = "scanner_ip";
    else if (e.kind === "click") {
      const dt = delivery != null ? +e.occurredAt - delivery : null;
      if (allFast && distinctLinks.size >= 2) reason = "all_links_within_60s";
      else if (dt != null && dt >= 0 && dt <= FAST_CLICK_MS) reason = "click_within_60s_of_delivery";
      else if (clicks.some((o) => o !== e && o.link !== e.link && Math.abs(+o.occurredAt - +e.occurredAt) <= BURST_MS)) reason = "multi_link_burst";
      else if (e.sesBotHint === "Likely") reason = "ses_bot_hint";
    } else {
      const dt = delivery != null ? +e.occurredAt - delivery : null;
      if (isAppleMpp(ua, e.ipAddress)) reason = "apple_mpp";
      else if (dt != null && dt >= 0 && dt <= FAST_OPEN_MS) reason = "open_within_5s_of_delivery";
      else if (e.sesBotHint === "Likely") reason = "ses_bot_hint";
    }
    out.set(e.eventKey, { isBot: !!reason, reason });
  }
  return out;
}

/** Group by (messageId, recipient) and classify all. */
export function classifyAll(events: SesEvent[]): Map<string, Verdict> {
  const groups = new Map<string, SesEvent[]>();
  for (const e of events) { const k = `${e.sesMessageId}|${e.recipient}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(e); }
  const out = new Map<string, Verdict>();
  for (const g of groups.values()) for (const [k, v] of classifyMessage(g)) out.set(k, v);
  return out;
}
