/**
 * Newsletter issue #1 SEED send: exactly ONE copy each of A1 (customers), A2alt (signups) and B (win-back) = 3 emails,
 * all to naumansulaiman@googlemail.com (hard-coded test inbox; no other recipient is possible).
 *
 * Templates (approved copy) are NOT committed (this repo is public). Copy them next to this file first:
 *   cp /workspace/newsletter/issue-01/seed-send/issue-01-{A1-customers,A2alt-signups,B-winback}.template.{html,txt} scripts/newsletter-issue01/
 *
 *   npx tsx scripts/newsletter-issue01/seed-newsletter-issue01.ts                  # DRY RUN (default)
 *   npx tsx scripts/newsletter-issue01/seed-newsletter-issue01.ts --confirm-seed   # sends 3 emails
 *   optional: --suppression-csv=/path/to/ses-suppression.csv (checked case-insensitively)
 *   optional: --allow-reseed  (re-run guard override: needed if the seed contact already has a
 *             newsletter_sent activity for this campaign, i.e. a logged seed already went out)
 *
 * DRY RUN touches no database, no SES and not the CRM app: it checks templates, banned terms, the
 * {{unsubscribe_url}} placeholders and that the 3 images return 200 (HEAD), then prints the plan.
 * --confirm-seed additionally needs DATABASE_URL, SES credentials and an https NEXT_PUBLIC_APP_URL;
 * it probes /api/unsubscribe (GET must not unsubscribe), checks the suppression (contacts.unsubscribed)
 * for the seed address, refuses to re-send if a seed for this campaign is already logged (unless
 * --allow-reseed), sends via sendEmail() with a fresh per-send unsubscribe token, and logs a
 * newsletter_sent activity (SES MessageId) on the seed contact row.
 * SES_CONFIGURATION_SET (optional): when set, sends carry ConfigurationSetName + contact_id/campaign/variant tags.
 */
import fs from "fs";
import { buildNewsletterMessage, sendNewsletterAndLog, isNewsletterSentFor, NEWSLETTER_SEED_SOURCE, NEWSLETTER_SENT_ACTIVITY } from "../../src/lib/newsletter";
import { NEWSLETTER_FROM_EMAIL, NEWSLETTER_REPLY_TO } from "../../src/lib/email";
import { publicBaseUrl } from "../../src/lib/unsubscribe";
import { normalizeEmail } from "../../src/lib/suppression";
import { generateUnsubscribeToken } from "../../src/lib/tokens";
import { CAMPAIGN, VERSIONS, readTemplates, templatePreflight, readSuppressionCsv } from "./issue01";

export const SEED_TO = "naumansulaiman@googlemail.com"; // hard-coded; no other recipient is possible

const args = process.argv.slice(2);
const CONFIRM = args.includes("--confirm-seed");
const ALLOW_RESEED = args.includes("--allow-reseed");
const SUPP_CSV = args.find((a) => a.startsWith("--suppression-csv="))?.slice("--suppression-csv=".length);

async function preflight(): Promise<string[]> {
  const fail: string[] = [];
  if (NEWSLETTER_FROM_EMAIL !== "SessionTalk <support@sessiontalk.co.uk>") fail.push("unexpected From");
  fail.push(...(await templatePreflight()));
  if (SUPP_CSV) {
    if (!fs.existsSync(SUPP_CSV)) fail.push(`suppression CSV not found: ${SUPP_CSV}`);
    else if (readSuppressionCsv(SUPP_CSV).has(SEED_TO)) fail.push(`${SEED_TO} is on the SES suppression CSV`);
  }
  if (CONFIRM) {
    const env = process.env.NEXT_PUBLIC_APP_URL || "";
    if (!/^https:\/\//.test(env)) fail.push("NEXT_PUBLIC_APP_URL must be https for --confirm-seed");
    if (!process.env.DATABASE_URL) fail.push("DATABASE_URL is not set");
    // GET with a well-formed but unknown token must be a read-only 404 (GET never unsubscribes).
    try {
      const probe = await fetch(`${publicBaseUrl()}/api/unsubscribe?token=${"0".repeat(64)}`);
      if (probe.status !== 404) fail.push(`unsubscribe probe returned ${probe.status} (expected 404)`);
    } catch (e: any) { fail.push(`unsubscribe probe failed: ${e?.name || "error"}`); }
  }
  return fail;
}

async function main() {
  const fail = await preflight();
  if (VERSIONS.length !== 3) fail.push("expected exactly 3 versions");
  if (fail.length) { console.error("PREFLIGHT FAILED, nothing sent:\n - " + fail.join("\n - ")); process.exit(1); }
  const templates = readTemplates();
  const cfgSet = (process.env.SES_CONFIGURATION_SET || "").trim() ? "set" : "unset";
  // Build all 3 messages with a dummy token to prove the headers/placeholders before any DB access.
  for (const t of templates) {
    const m = buildNewsletterMessage({ to: SEED_TO, subject: t.subject, html: t.html, text: t.text, token: "0".repeat(64) });
    if (m.to !== SEED_TO || m.from !== NEWSLETTER_FROM_EMAIL || m.replyTo !== NEWSLETTER_REPLY_TO) throw new Error("bad envelope");
    if (!m.headers?.["List-Unsubscribe"] || m.headers?.["List-Unsubscribe-Post"] !== "List-Unsubscribe=One-Click") throw new Error("missing List-Unsubscribe headers");
    if (!CONFIRM) console.log(`[dry run] would send ${t.key} "${t.subject}" from ${m.from} to ${SEED_TO}; List-Unsubscribe: ${m.headers!["List-Unsubscribe"].replace(/token=[a-f0-9]+/, "token=<per-send>")}; SES_CONFIGURATION_SET ${cfgSet}`);
  }
  if (!CONFIRM) { console.log("Dry run only: no DB, no SES. Re-run with --confirm-seed to send 3 emails to " + SEED_TO); return; }

  // Lazy imports: only the confirmed path loads the DB client and SES.
  const { db } = await import("../../src/db");
  const { contacts, unsubscribeTokens, activities } = await import("../../src/db/schema");
  const { sql, and, eq } = await import("drizzle-orm");
  const { sendEmail } = await import("../../src/lib/email");
  const { dbSuppressionStore } = await import("../../src/lib/suppressionDb");
  const { assertSendable } = await import("../../src/lib/suppression");

  await assertSendable(SEED_TO, dbSuppressionStore); // throws if contacts.unsubscribed for naumansulaiman@
  let [c] = await db.select().from(contacts).where(sql`lower(${contacts.email}) = ${normalizeEmail(SEED_TO)}`);
  if (!c) [c] = await db.insert(contacts).values({ email: SEED_TO, username: SEED_TO, firstname: "Nauman", source: NEWSLETTER_SEED_SOURCE }).returning();

  // Re-run guard: a logged seed for this campaign blocks another unless --allow-reseed.
  const prior = await db.select({ type: activities.type, body: activities.body }).from(activities)
    .where(and(eq(activities.contactId, c.id), eq(activities.type, NEWSLETTER_SENT_ACTIVITY)));
  const priorCount = prior.filter((r) => isNewsletterSentFor(r, CAMPAIGN)).length;
  if (priorCount && !ALLOW_RESEED) {
    console.error(`RE-RUN GUARD: ${priorCount} newsletter_sent activities for ${CAMPAIGN} already on the seed contact. Nothing sent. Pass --allow-reseed only with a new go.`);
    process.exit(1);
  }

  for (const t of templates) {
    await assertSendable(SEED_TO, dbSuppressionStore);
    const token = generateUnsubscribeToken();
    await db.insert(unsubscribeTokens).values({ token, contactId: c.id });
    const tracking = { contactId: c.id, campaign: CAMPAIGN, variant: t.key };
    const msg = buildNewsletterMessage({ to: SEED_TO, subject: t.subject, html: t.html, text: t.text, token, tracking });
    const out = await sendNewsletterAndLog(msg, { ...tracking, seed: true }, {
      send: sendEmail,
      logActivity: (row) => db.insert(activities).values(row),
    });
    console.log(`SENT ${t.key} -> ${SEED_TO} MessageId=${out.id}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(String(e?.message || e).replace(/[A-Za-z0-9_\-+/=]{24,}/g, "<redacted>")); process.exit(1); });
