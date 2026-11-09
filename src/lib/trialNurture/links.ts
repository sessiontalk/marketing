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

/**
 * generic_softphone placeholder defaults — HoM pack html/sequence.json placeholder_defaults (5 Nov 2026).
 * Old {docs_url} / {provider_directory_url} are no longer in the copy (provider directory dropped 07:25 GMT).
 */
export const SOFTPHONE_PLACEHOLDER_DEFAULTS: Record<string, string> = {
  "workspace_url": "https://cloud.sessiontalk.io",
  "getting_started_docs_url": "https://docs.sessiontalk.io/docs/sessioncloud/creating-first-app",
  "provisioning_docs_url": "https://docs.sessiontalk.io/docs/sessioncloud/provisioning",
  "qr_docs_url": "https://docs.sessiontalk.io/docs/sessioncloud/qr-codes/using-qr-codes-without-a-provisioning-server",
  "desktop_link_docs_url": "https://docs.sessiontalk.io/docs/sessioncloud/desktop-links",
  "desktop_setup_docs_url": "https://docs.sessiontalk.io/docs/desktop-softphones/external-provisioning",
  "push_docs_url": "https://docs.sessiontalk.io/docs/pushserver/troubleshooting",
  "push_overview_docs_url": "https://docs.sessiontalk.io/docs/pushserver/overview",
  "branding_docs_url": "https://docs.sessiontalk.io/docs/partners/branded-softphones",
  "misc_docs_url": "https://docs.sessiontalk.io/docs/sessioncloud/miscellaneous",
  "appstore_docs_url": "https://docs.sessiontalk.io/docs/sessioncloud/appstore-data",
  "sms_docs_url": "https://docs.sessiontalk.io/docs/sessioncloud/messaging/overview",
  "sms_providers_docs_url": "https://docs.sessiontalk.io/docs/sessioncloud/messaging/providers",
  "sms_troubleshooting_docs_url": "https://docs.sessiontalk.io/docs/sessioncloud/messaging/troubleshooting",
  "sip_im_docs_url": "https://docs.sessiontalk.io/docs/mobile-softphones/messaging/enable-messaging",
  "xmpp_docs_url": "https://docs.sessiontalk.io/docs/mobile-softphones/messaging/setting-up-im",
  "rooms_docs_url": "https://docs.sessiontalk.io/docs/mobile-softphones/messaging/rooms",
  "messaging_settings_docs_url": "https://docs.sessiontalk.io/docs/sessioncloud/xmpp",
  "sip_im_desktop_docs_url": "https://docs.sessiontalk.io/docs/desktop-softphones/messaging/enable-messaging",
  "sending_im_docs_url": "https://docs.sessiontalk.io/docs/mobile-softphones/messaging/sending-im-messages",
  "provider_sms_docs_url": "https://docs.sessiontalk.io/docs/mobile-softphones/messaging/provider-sms",
  "customer_hosted_docs_url": "https://docs.sessiontalk.io/docs/sessioncloud/messaging/customer-hosted"
};

/** Static link tokens for a product/step (empty for Teams/Hosted). Keys are {token} names. */
export function stepLinkFields(_step: Step, product?: string | null): Record<string, string> & { workspaceUrl?: string } {
  if (product !== "generic_softphone") return {};
  return { ...SOFTPHONE_PLACEHOLDER_DEFAULTS, workspaceUrl: SOFTPHONE_WORKSPACE_URL };
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
  // generic_softphone: steps 1-4 use workspace defaults; step 6 needs billing accountName + {trial_ends_date}.
  // signup_finish_setup: COPY_GAP bodies must not use project tokens; hold is via final=false.
  if (product === "signup_finish_setup") return [];
  if (product === "generic_softphone") {
    // v2: steps 1-4 (and check-in 5) use workspace defaults; step 6 needs billing + trial end date.
    if (step === 6) return ["accountName", "trial_ends_date"];
    if (step <= 4) return ["workspace_url"];
    return [];
  }
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
    case 6:
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
