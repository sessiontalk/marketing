/**
 * Workspaces permanently excluded from trial-nurture auto-send (Nauman: VOXIOs, MaryamApp).
 * Matched case-insensitively against the sip_domain slug, accountName and appId.
 * Code config (no DB write); confirm the exact identifiers before enabling sending.
 */
export const EXCLUDED_WORKSPACES: readonly string[] = ["voxios", "maryamapp"];

export function isExcludedWorkspace(
  t: { sipDomain?: string | null; accountName?: string | null; appId?: string | null },
  list: readonly string[] = EXCLUDED_WORKSPACES
): boolean {
  const ids = new Set(list.map((x) => x.toLowerCase()));
  const slug = (t.sipDomain || "").trim().split(".")[0].toLowerCase();
  return [slug, (t.accountName || "").trim().toLowerCase(), (t.appId || "").trim().toLowerCase()]
    .some((v) => v !== "" && ids.has(v));
}