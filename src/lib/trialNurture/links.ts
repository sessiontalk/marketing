import type { Step } from "./schedule";

/** Forbidden in-app paths on cloud.sessiontalk.io (old marketing links). */
export const FORBIDDEN_CLOUD_PATH_RE =
  /https?:\/\/cloud\.sessiontalk\.io\/(team-members|call-routing)(\/|$)/i;

/** Non-.sip workspace host — *.uk.sessiontalk.io etc. resolves to cloudtest. Never emit. */
export const FORBIDDEN_NON_SIP_WORKSPACE_RE =
  /https?:\/\/[a-z0-9-]+\.(uk|us|asia)\.sessiontalk\.io(?!\.sip\.)/i;

export function workspaceTeamUrl(sipDomain: string): string {
  return `https://${sipDomain}/admin/team`;
}

export function workspaceRoutingUrl(sipDomain: string): string {
  return `https://${sipDomain}/admin/routing`;
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

export function assertSafeNurtureText(text: string): void {
  if (FORBIDDEN_CLOUD_PATH_RE.test(text)) {
    throw new Error("forbidden cloud.sessiontalk.io/team-members or /call-routing link");
  }
  if (FORBIDDEN_NON_SIP_WORKSPACE_RE.test(text)) {
    throw new Error("forbidden non-.sip workspace host (would hit cloudtest wildcard)");
  }
}
