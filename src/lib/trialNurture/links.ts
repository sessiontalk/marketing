import type { Step } from "./schedule";

/** Forbidden in-app paths on cloud.sessiontalk.io (old marketing links). */
export const FORBIDDEN_CLOUD_PATH_RE =
  /https?:\/\/cloud\.sessiontalk\.io\/(team-members|call-routing)(\/|$)/i;

/** Non-.sip workspace host — *.uk.sessiontalk.io etc. resolves to cloudtest. Never emit. */
export const FORBIDDEN_NON_SIP_WORKSPACE_RE =
  /https?:\/\/[a-z0-9-]+\.(uk|us|asia)\.sessiontalk\.io(?!\.sip\.)/i;

/**
 * Europe-region tenants (region_key "europe") are stored as {slug}.uk.sip.sessiontalk.io.
 * UK TLS is broken, so their workspace links use {slug}.eu.sessiontalk.io (never .uk).
 * {slug}.eu[.sip].sessiontalk.io maps the same way. us/asia are unchanged.
 */
export const EU_SIP_DOMAIN_RE = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.(?:uk\.sip|eu(?:\.sip)?)\.sessiontalk\.io$/i;

export function isEuSipDomain(sipDomain: string | null | undefined): boolean {
  return EU_SIP_DOMAIN_RE.test((sipDomain || "").trim());
}

/** Host used in workspace links. Europe (uk.sip / eu) -> {slug}.eu.sessiontalk.io; us/asia unchanged (sip_domain as-is). */
export function workspaceHost(sipDomain: string): string {
  const s = sipDomain.trim();
  const m = EU_SIP_DOMAIN_RE.exec(s);
  return m ? `${m[1].toLowerCase()}.eu.sessiontalk.io` : s;
}

export function workspaceTeamUrl(sipDomain: string): string {
  return `https://${workspaceHost(sipDomain)}/admin/team`;
}

export function workspaceRoutingUrl(sipDomain: string): string {
  return `https://${workspaceHost(sipDomain)}/admin/routing`;
}

export function billingUrl(accountName: string): string {
  return `https://cloud.sessiontalk.io/billing/${encodeURIComponent(accountName)}`;
}

/** Which stored fields a step's body needs for its CTA links. */
export function requiredLinkFields(step: Step): Array<"sip_domain" | "accountName"> {
  switch (step) {
    case 1:
    case 2:
    case 3:
      return ["sip_domain"];
    case 5:
      return ["accountName"];
    case 4:
      return [];
  }
}

export function missingLinkFields(
  step: Step,
  fields: { sipDomain?: string | null; accountName?: string | null }
): Array<"sip_domain" | "accountName"> {
  const missing: Array<"sip_domain" | "accountName"> = [];
  for (const f of requiredLinkFields(step)) {
    if (f === "sip_domain" && !(fields.sipDomain || "").trim()) missing.push("sip_domain");
    if (f === "accountName" && !(fields.accountName || "").trim()) missing.push("accountName");
  }
  return missing;
}

export function assertSafeNurtureText(text: string, sipDomain?: string | null): void {
  if (isEuSipDomain(sipDomain) && /\.uk\.(sip\.)?sessiontalk\.io/i.test(text)) {
    throw new Error("EU tenant email contains a .uk workspace link");
  }
  if (FORBIDDEN_CLOUD_PATH_RE.test(text)) {
    throw new Error("forbidden cloud.sessiontalk.io/team-members or /call-routing link");
  }
  if (FORBIDDEN_NON_SIP_WORKSPACE_RE.test(text)) {
    throw new Error("forbidden non-.sip workspace host (would hit cloudtest wildcard)");
  }
}
