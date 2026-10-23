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
 *
 * DRY RUN touches no database, no SES and not the CRM app: it checks templates, banned terms, the
 * {{unsubscribe_url}} placeholders and that the 3 images return 200, then prints the plan.
 * --confirm-seed additionally needs DATABASE_URL, SES credentials and an https NEXT_PUBLIC_APP_URL;
 * it probes /api/unsubscribe (GET must not unsubscribe), checks the suppression (contacts.unsubscribed)
 * for the seed address, and sends via sendEmail() with a fresh per-send unsubscribe token.
 */
import fs from "fs";
import path from "path";
import { buildNewsletterMessage } from "../../src/lib/newsletter";
import { NEWSLETTER_FROM_EMAIL, NEWSLETTER_REPLY_TO } from "../../src/lib/email";
import { publicBaseUrl } from "../../src/lib/unsubscribe";
import { normalizeEmail } from "../../src/lib/suppression";
import { generateUnsubscribeToken } from "../../src/lib/tokens";

export const SEED_TO = "naumansulaiman@googlemail.com"; // hard-coded; no other recipient is possible
const IMG_BASE = "https://sessiontalk.io/img/newsletter/2026-10/";
const IMAGES = ["sessiontalk-logo.png", "hero-dark-sessioncloud-play.png", "light-vs-dark-appstore.png"];
const DIR = __dirname;
const VERSIONS = [
  { key: "A1", file: "issue-01-A1-customers", subject: "Dark mode is here, plus a few other new things" },
  { key: "A2alt", file: "issue-01-A2alt-signups", subject: "Dark mode is here, plus a few other new things" },
  { key: "B", file: "issue-01-B-winback", subject: "A lot has changed at SessionTalk since you left" },
] as const;
const BANNED = /3CX|Yeastar|VitalPBX|Vodia|SessionPBX|private label|PENDING/i;

const args = process.argv.slice(2);
const CONFIRM = args.includes("--confirm-seed");
const SUPP_CSV = args.find((a) => a.startsWith("--suppression-csv="))?.slice("--suppression-csv=".length);

function readTemplates() {
  return VERSIONS.map((v) => {
    const read = (ext: string) => fs.readFileSync(path.join(DIR, `${v.file}.template.${ext}`), "utf8");
    return { ...v, html: read("html"), text: read("txt") };
  });
}

async function preflight(): Promise<string[]> {
  const fail: string[] = [];
  if (NEWSLETTER_FROM_EMAIL !== "SessionTalk <support@sessiontalk.co.uk>") fail.push("unexpected From");
  for (const v of VERSIONS) for (const ext of ["html", "txt"]) {
    const p = path.join(DIR, `${v.file}.template.${ext}`);
    if (!fs.existsSync(p)) { fail.push(`missing template ${path.basename(p)} (copy it next to this script)`); continue; }
    const s = fs.readFileSync(p, "utf8");
    if (BANNED.test(s)) fail.push(`banned term in ${path.basename(p)}`);
    if (!s.includes("{{unsubscribe_url}}")) fail.push(`no {{unsubscribe_url}} in ${path.basename(p)}`);
  }
  for (const f of IMAGES) {
    try {
      const r = await fetch(IMG_BASE + f, { method: "HEAD" });
      if (r.status !== 200) fail.push(`image ${f} -> HTTP ${r.status}`);
    } catch (e: any) { fail.push(`image ${f} -> ${e?.name || "error"}`); }
  }
  if (SUPP_CSV) {
    if (!fs.existsSync(SUPP_CSV)) fail.push(`suppression CSV not found: ${SUPP_CSV}`);
    else if (fs.readFileSync(SUPP_CSV, "utf8").toLowerCase().split(/[\s,;"]+/).includes(SEED_TO)) fail.push(`${SEED_TO} is on the SES suppression CSV`);
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
  // Build all 3 messages with a dummy token to prove the headers/placeholders before any DB access.
  for (const t of templates) {
    const m = buildNewsletterMessage({ to: SEED_TO, subject: t.subject, html: t.html, text: t.text, token: "0".repeat(64) });
    if (m.to !== SEED_TO || m.from !== NEWSLETTER_FROM_EMAIL || m.replyTo !== NEWSLETTER_REPLY_TO) throw new Error("bad envelope");
    if (!CONFIRM) console.log(`[dry run] would send ${t.key} "${t.subject}" from ${m.from} to ${SEED_TO}; List-Unsubscribe: ${m.headers!["List-Unsubscribe"].replace(/token=[a-f0-9]+/, "token=<per-send>")}`);
  }
  if (!CONFIRM) { console.log("Dry run only: no DB, no SES. Re-run with --confirm-seed to send 3 emails to " + SEED_TO); return; }

  // Lazy imports: only the confirmed path loads the DB client and SES.
  const { db } = await import("../../src/db");
  const { contacts, unsubscribeTokens } = await import("../../src/db/schema");
  const { sql } = await import("drizzle-orm");
  const { sendEmail } = await import("../../src/lib/email");
  const { dbSuppressionStore } = await import("../../src/lib/suppressionDb");
  const { assertSendable } = await import("../../src/lib/suppression");

  await assertSendable(SEED_TO, dbSuppressionStore); // throws if contacts.unsubscribed for naumansulaiman@
  let [c] = await db.select().from(contacts).where(sql`lower(${contacts.email}) = ${normalizeEmail(SEED_TO)}`);
  if (!c) [c] = await db.insert(contacts).values({ email: SEED_TO, username: SEED_TO, firstname: "Nauman", source: "newsletter_seed" }).returning();

  for (const t of templates) {
    await assertSendable(SEED_TO, dbSuppressionStore);
    const token = generateUnsubscribeToken();
    await db.insert(unsubscribeTokens).values({ token, contactId: c.id });
    const msg = buildNewsletterMessage({ to: SEED_TO, subject: t.subject, html: t.html, text: t.text, token,
      tags: { campaign: "issue01", version: t.key, seed: "true" } });
    const out = await sendEmail(msg);
    console.log(`SENT ${t.key} -> ${SEED_TO} MessageId=${out.id}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(String(e?.message || e)); process.exit(1); });
