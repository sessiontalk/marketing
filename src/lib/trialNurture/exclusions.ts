/**
 * Workspaces permanently excluded from trial-nurture auto-send (Nauman: VOXIOs, MaryamApp).
 * Matched case-insensitively against the sip_domain slug, accountName and appId.
 * Code config (no DB write); confirm the exact identifiers before enabling sending.
 */
export const EXCLUDED_WORKSPACES: readonly string[] = [
  "voxios", "maryamapp",
  // NorthwindDemo screenshot demo (Nauman yes 4 Nov 21:51): sip slug, accountName, appId.
  "northwind-demo", "northwinddemo", "nz9fr84qdy",
];

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
  "demo-screens+20261104@sessiontalk.co.uk", // NorthwindDemo demo account
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

/**
 * Junk / abuse signups: HOLD (no send, no claim) so a real trial resumes if it later verifies.
 * - unverified email (contacts.email_verified false/null)
 * - Rome/Romebumann cluster (HoM audit 5 Nov): workspace slugs rome<digits>, romebum*, and
 *   known cluster mailboxes (3cxdemo*, cxdemo*, *bumann*, dylan<digits>@).
 * - random-letter names: firstname/workspace with no vowel run, 5+ consonant run, or keyboard mash.
 */
const ABUSE_WORKSPACE = /^(rome\d*|romebum\w*)$/i;
const ABUSE_EMAIL = /^(3?cxdemo\d*|\w*bumann\w*|dylan\d+)@/i;

export function looksRandom(s: string | null | undefined): boolean {
  const v = (s || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (v.length < 4) return false;
  if (!/[aeiouy]/.test(v)) return true;
  if (/[bcdfghjklmnpqrstvwxz]{5,}/.test(v)) return true;
  if (/(.)\1{3,}/.test(v)) return true; // e.g. Workaaaasas
  return false;
}

export function junkReason(
  t: { sipDomain?: string | null; accountName?: string | null },
  c: { email?: string | null; firstname?: string | null; emailVerified?: boolean | null },
  opts?: { allowUnverified?: boolean },
): string | null {
  if (!opts?.allowUnverified && !c.emailVerified) return "unverified_email";
  const slug = (t.sipDomain || "").trim().split(".")[0];
  if ([slug, t.accountName || ""].some((v) => ABUSE_WORKSPACE.test(v.trim()))) return "abuse_cluster_workspace";
  if (ABUSE_EMAIL.test((c.email || "").trim())) return "abuse_cluster_email";
  if (looksRandom(c.firstname) || looksRandom(t.accountName)) return "random_name";
  return null;
}
