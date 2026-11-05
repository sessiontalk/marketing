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

/**
 * Generic Softphone has no hosted .sip workspace. No SessionCloud project deep link exists in this
 * codebase, so {workspace_url} is the SessionCloud project home (HoM fallback, 5 Nov 2026).
 */
export const SOFTPHONE_WORKSPACE_URL = "https://cloud.sessiontalk.io";

/** Per-step {docs_url} / {provider_directory_url} for generic_softphone (HoM defaults, 5 Nov 2026). */
export const SOFTPHONE_STEP_LINKS: Partial<Record<Step, { docsUrl?: string; providerDirectoryUrl?: string }>> = {
  1: { docsUrl: "https://docs.sessiontalk.io/docs/mobile-softphones/accounts/create-account", providerDirectoryUrl: "https://sessiontalk.io/voip-providers" },
  2: { docsUrl: "https://docs.sessiontalk.io/docs/desktop-softphones/app-set-up" },
  3: { docsUrl: "https://docs.sessiontalk.io/docs/voip-providers/getting-started", providerDirectoryUrl: "https://cloud.sessiontalk.io/providers/" },
};

/**
 * Upcoming softphone rewrite placeholders (HoM pack 2026-11-05 §defaults). Copy is still final:false;
 * render fills these; any token left unfilled holds the send via UNFILLED_PLACEHOLDER_RE.
 */
export const SOFTPHONE_PROVISIONING_LINKS = {
  qrDocsUrl: "https://docs.sessiontalk.io/docs/sessioncloud/qr-codes/using-qr-codes-without-a-provisioning-server",
  // Alt if trial uses an external provisioning server: .../qr-codes/using-qr-codes-with-your-provisioning-server
  desktopLinkDocsUrl: "https://docs.sessiontalk.io/docs/sessioncloud/desktop-links",
  pushDocsUrl: "https://docs.sessiontalk.io/docs/pushserver/troubleshooting",
} as const;

/** Static link fields for a product/step (empty for Teams/Hosted). */
export function stepLinkFields(step: Step, product?: string | null): { workspaceUrl?: string; docsUrl?: string; providerDirectoryUrl?: string; qrDocsUrl?: string; desktopLinkDocsUrl?: string; pushDocsUrl?: string } {
  if (product !== "generic_softphone") return {};
  return { workspaceUrl: SOFTPHONE_WORKSPACE_URL, ...SOFTPHONE_PROVISIONING_LINKS, ...(SOFTPHONE_STEP_LINKS[step] || {}) };
}

/** en-GB human date, e.g. "5 November 2026" (UTC so it never shifts by a day). */
export function formatTrialEndsDate(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Matches any placeholder left after render. Sending text with this is never allowed. */
export const UNFILLED_PLACEHOLDER_RE = /\{[a-zA-Z_]+\}/;

export type LinkField = "sip_domain" | "accountName" | "workspace_url" | "trial_ends_date";

/** Which stored fields a step's body needs for its CTA links. */
export function requiredLinkFields(step: Step, product?: string): LinkField[] {
  // generic_softphone: steps 1-3 link {workspace_url}; step 5 needs billing accountName + {trial_ends_date}.
  if (product === "generic_softphone") return step === 5 ? ["accountName", "trial_ends_date"] : step <= 3 ? ["workspace_url"] : [];
  // hosted_pbx copy links only to cloud.sessiontalk.co.uk: billing needs accountName.
  if (product === "hosted_pbx") return step === 5 ? ["accountName"] : [];
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
  fields: { sipDomain?: string | null; accountName?: string | null; trialEndsAt?: Date | string | null },
  product?: string
): LinkField[] {
  const missing: LinkField[] = [];
  for (const f of requiredLinkFields(step, product)) {
    if (f === "workspace_url" && !(stepLinkFields(step, product).workspaceUrl || "").trim()) missing.push("workspace_url");
    if (f === "trial_ends_date" && !formatTrialEndsDate(fields.trialEndsAt)) missing.push("trial_ends_date");
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
