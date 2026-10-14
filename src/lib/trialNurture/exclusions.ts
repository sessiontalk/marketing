/**
 * Workspaces permanently excluded from trial-nurture auto-send (Nauman: VOXIOs, MaryamApp).
 * Matched case-insensitively against the sip_domain slug, accountName and appId.
 * Code config (no DB write); confirm the exact identifiers before enabling sending.
 */
export const EXCLUDED_WORKSPACES: readonly string[] = ["voxios", "maryamapp"];

/**
 * Contacts never auto-sent (internal + manual holds). Lowercase.
 * The 12 Oct email-01 recipients were removed 14 Oct (Nauman): they continue from email 02.
 * The admin test-send route is not subject to this list.
 */
export const EXCLUDED_EMAILS: ReadonlySet<string> = new Set([
  "naumansulaiman@googlemail.com",
  "nauman@sessiontalk.co.uk",
  "voxiotelecom@outlook.com",
  "rtownsend9999@gmail.com",
]);

export function isExcludedEmail(email: string | null | undefined): boolean {
  return EXCLUDED_EMAILS.has((email || "").trim().toLowerCase());
}

export function isExcludedWorkspace(
  t: { sipDomain?: string | null; accountName?: string | null; appId?: string | null },
  list: readonly string[] = EXCLUDED_WORKSPACES
): boolean {
  const ids = new Set(list.map((x) => x.toLowerCase()));
  const slug = (t.sipDomain || "").trim().split(".")[0].toLowerCase();
  return [slug, (t.accountName || "").trim().toLowerCase(), (t.appId || "").trim().toLowerCase()]
    .some((v) => v !== "" && ids.has(v));
}
/**
 * Email 05 (trial ends in 2 days) is sent manually by Sales 17-19 Oct for these tenants.
 * Only step 5 is skipped; steps 1-4 run normally. Matched on sip slug, accountName or appId.
 */
export const STEP5_MANUAL_WORKSPACES: readonly string[] = ["servyteam", "asimhussain", "zainmobile00"];

export function isStep5ManualWorkspace(
  t: { sipDomain?: string | null; accountName?: string | null; appId?: string | null }
): boolean {
  return isExcludedWorkspace(t, STEP5_MANUAL_WORKSPACES);
}
