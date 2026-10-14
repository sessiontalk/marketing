/**
 * Workspaces permanently excluded from trial-nurture auto-send (Nauman: VOXIOs, MaryamApp).
 * Matched case-insensitively against the sip_domain slug, accountName and appId.
 * Code config (no DB write); confirm the exact identifiers before enabling sending.
 */
export const EXCLUDED_WORKSPACES: readonly string[] = ["voxios", "maryamapp"];

/**
 * Contacts never auto-sent (SessionCloud/HoD 14 Oct: 12 Oct email-01 recipients, internal, manual holds).
 * Lowercase. The admin test-send route is not subject to this list.
 */
export const EXCLUDED_EMAILS: ReadonlySet<string> = new Set([
  "abdulazeez@servy.ae",
  "mustaqim.agt@gmail.com",
  "choudharytayyab302@gmail.com",
  "lambaonam2509@gmail.com",
  "v13256756@gmail.com",
  "manan@superproducer.ai",
  "beforejeryy@gmail.com",
  "henhenbak2000@gmail.com",
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