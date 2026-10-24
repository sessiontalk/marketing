/**
 * Newsletter issue #1 REAL BROADCAST (e.g. Send 1 = A1 55 + B 67). NEVER run without Nauman's explicit go.
 *
 *   npx tsx scripts/newsletter-issue01/send-newsletter-issue01.ts --list=A1:/path/a1.csv --list=B:/path/b.csv
 *       # DRY RUN (default): no DB, no SES. Templates/images preflight + CSV-level plan and counts.
 *   ... --check-db
 *       # DRY RUN + read-only SELECTs (contacts, activities, processed_events) for the exact send count.
 *   ... --confirm-send --expect-count=122 [--limit=N] [--rate=2] [--suppression-csv=/path/ses-suppression.csv]
 *       # REAL SEND. Aborts before the first email unless the final DB-filtered count == --expect-count.
 *
 * Lists: CSV with an `email` column; variant per list (A1 | A2alt | B). Lists stay off git (*.csv ignored).
 * Excluded: seed inbox (naumansulaiman[+*]@googlemail/gmail), contacts.source = 'newsletter_seed',
 * contacts.unsubscribed, the SES suppression CSV, anyone with a newsletter_sent activity or a claim
 * for this campaign (re-run guard). Per recipient: assertSendable() again, atomic claim in
 * processed_events ('newsletter:<campaign>:<contact id>'), fresh unsubscribe token, send, newsletter_sent
 * activity + send_logs row with the SES MessageId. Failed sends keep their claim (never auto-retried).
 * Rate limited (default 2/s); stops as soon as failures exceed 2% of attempts.
 * SES_CONFIGURATION_SET (optional): when set, sends carry ConfigurationSetName + contact_id/campaign/variant tags.
 */
import fs from "fs";
import { parse } from "csv-parse/sync";
import { buildNewsletterMessage, sendNewsletterAndLog, isNewsletterSentFor, NEWSLETTER_SENT_ACTIVITY } from "../../src/lib/newsletter";
import { NEWSLETTER_FROM_EMAIL } from "../../src/lib/email";
import { normalizeEmail } from "../../src/lib/suppression";
import { planBroadcast, runBroadcast, contactExclusion, type BroadcastContact, type BroadcastRow } from "../../src/lib/newsletterBroadcast";
import { CAMPAIGN, VERSIONS, readTemplates, templatePreflight, readSuppressionCsv, type VariantKey } from "./issue01";

const args = process.argv.slice(2);
const arg = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const CONFIRM = args.includes("--confirm-send");
const CHECK_DB = args.includes("--check-db") || CONFIRM;
const LIMIT = arg("limit") !== undefined ? Number(arg("limit")) : undefined;
const RATE = Number(arg("rate") ?? 2);
const EXPECT = arg("expect-count") !== undefined ? Number(arg("expect-count")) : undefined;
const SUPP_CSV = arg("suppression-csv");
const LISTS = args.filter((a) => a.startsWith("--list=")).map((a) => {
  const v = a.slice("--list=".length); const i = v.indexOf(":");
  return { variant: v.slice(0, i) as VariantKey, file: v.slice(i + 1) };
});
export const claimKey = (campaign: string, contactId: string) => `newsletter:${campaign}:${contactId}`;

export function readListCsv(file: string, variant: string): BroadcastRow[] {
  const recs: Record<string, string>[] = parse(fs.readFileSync(file, "utf8"), { columns: true, skip_empty_lines: true, bom: true });
  return recs.map((r) => ({ email: String(r.email ?? ""), variant }));
}

async function main() {
  const fail: string[] = [];
  const keys = VERSIONS.map((v) => v.key) as VariantKey[];
  if (!LISTS.length) fail.push("no --list=VARIANT:path given");
  for (const l of LISTS) {
    if (!keys.includes(l.variant)) fail.push(`unknown variant ${l.variant}`);
    if (!fs.existsSync(l.file)) fail.push(`list not found for ${l.variant}`);
  }
  if (!(RATE > 0 && RATE <= 10)) fail.push("--rate must be in (0, 10] per second");
  if (LIMIT !== undefined && !(Number.isInteger(LIMIT) && LIMIT > 0)) fail.push("--limit must be a positive integer");
  if (NEWSLETTER_FROM_EMAIL !== "SessionTalk <support@sessiontalk.co.uk>") fail.push("unexpected From");
  if (SUPP_CSV && !fs.existsSync(SUPP_CSV)) fail.push("suppression CSV not found");
  if (CONFIRM) {
    if (EXPECT === undefined || !Number.isInteger(EXPECT)) fail.push("--confirm-send needs --expect-count=N");
    if (!/^https:\/\//.test(process.env.NEXT_PUBLIC_APP_URL || "")) fail.push("NEXT_PUBLIC_APP_URL must be https");
    if (!process.env.DATABASE_URL) fail.push("DATABASE_URL is not set");
  }
  if (!fail.length) fail.push(...(await templatePreflight(Array.from(new Set(LISTS.map((l) => l.variant))))));
  if (fail.length) { console.error("PREFLIGHT FAILED, nothing sent:\n - " + fail.join("\n - ")); process.exit(1); }

  const rows = LISTS.flatMap((l) => readListCsv(l.file, l.variant));
  const sesSuppressed = SUPP_CSV ? readSuppressionCsv(SUPP_CSV) : undefined;
  const templates = new Map(readTemplates(Array.from(new Set(LISTS.map((l) => l.variant)))).map((t) => [t.key as string, t]));
  const cfgSet = (process.env.SES_CONFIGURATION_SET || "").trim() ? "set" : "unset";

  if (!CHECK_DB) {
    const plan = planBroadcast({ rows, contactsByEmail: new Map(), alreadySentContactIds: new Set(), sesSuppressed });
    console.log(`[dry run, no DB] campaign=${CAMPAIGN} rows=${rows.length} would_send<=${plan.send.length} excluded=${JSON.stringify(plan.excluded)} by_variant=${JSON.stringify(countBy(plan.send))} SES_CONFIGURATION_SET ${cfgSet}`);
    console.log("CRM exclusions (unsubscribed, newsletter_seed, already sent) need --check-db (read-only SELECTs).");
    return;
  }

  // DB reads (SELECT only) for the plan. Writes happen only after --confirm-send and the count check.
  const { db } = await import("../../src/db");
  const { contacts, activities, processedEvents, unsubscribeTokens, sendLogs } = await import("../../src/db/schema");
  const { sql, inArray, and, eq } = await import("drizzle-orm");
  const emails = Array.from(new Set(rows.map((r) => normalizeEmail(r.email))));
  const contactsByEmail = new Map<string, BroadcastContact>();
  for (let i = 0; i < emails.length; i += 500) {
    const chunk = emails.slice(i, i + 500);
    const found = await db.select({ id: contacts.id, email: contacts.email, source: contacts.source, unsubscribed: contacts.unsubscribed })
      .from(contacts).where(inArray(sql<string>`lower(${contacts.email})`, chunk));
    for (const c of found) contactsByEmail.set(normalizeEmail(c.email), c);
  }
  const ids = Array.from(contactsByEmail.values()).map((c) => c.id);
  const alreadySent = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const acts = await db.select({ contactId: activities.contactId, type: activities.type, body: activities.body }).from(activities)
      .where(and(eq(activities.type, NEWSLETTER_SENT_ACTIVITY), inArray(activities.contactId, chunk)));
    for (const a of acts) if (isNewsletterSentFor(a, CAMPAIGN)) alreadySent.add(a.contactId);
    const claims = await db.select({ eventId: processedEvents.eventId }).from(processedEvents)
      .where(inArray(processedEvents.eventId, chunk.map((id) => claimKey(CAMPAIGN, id))));
    for (const c of claims) alreadySent.add(c.eventId.split(":").pop()!);
  }
  const plan = planBroadcast({ rows, contactsByEmail, alreadySentContactIds: alreadySent, sesSuppressed });
  const toSend = LIMIT !== undefined ? plan.send.slice(0, LIMIT) : plan.send;
  console.log(`campaign=${CAMPAIGN} rows=${rows.length} SEND=${plan.send.length}${LIMIT !== undefined ? ` (limit ${toSend.length})` : ""} new_contacts=${plan.toCreate} excluded=${JSON.stringify(plan.excluded)} by_variant=${JSON.stringify(countBy(plan.send))} rate=${RATE}/s SES_CONFIGURATION_SET ${cfgSet}`);
  if (!CONFIRM) { console.log("Dry run only (read-only SELECTs). Nothing written, nothing sent."); return; }
  if (plan.send.length !== EXPECT) { console.error(`COUNT CHECK FAILED: SEND=${plan.send.length} but --expect-count=${EXPECT}. Nothing sent.`); process.exit(1); }

  const { sendEmail } = await import("../../src/lib/email");
  const { dbSuppressionStore } = await import("../../src/lib/suppressionDb");
  const { assertSendable } = await import("../../src/lib/suppression");
  const { generateUnsubscribeToken } = await import("../../src/lib/tokens");

  const summary = await runBroadcast(toSend, {
    assertSendable: (email) => assertSendable(email, dbSuppressionStore),
    async ensureContact(email) {
      await db.insert(contacts).values({ email, username: email, source: "newsletter_list" }).onConflictDoNothing();
      const [c] = await db.select({ id: contacts.id, email: contacts.email, source: contacts.source, unsubscribed: contacts.unsubscribed })
        .from(contacts).where(sql`lower(${contacts.email}) = ${email}`);
      if (!c) throw new Error("contact row not found after insert");
      if (contactExclusion(c)) throw new Error(`contact excluded (${contactExclusion(c)})`);
      return c.id;
    },
    async claim(campaign, contactId) {
      const r = await db.insert(processedEvents).values({ eventId: claimKey(campaign, contactId) }).onConflictDoNothing().returning();
      return r.length > 0;
    },
    async sendOne(p) {
      const t = templates.get(p.variant)!;
      const token = generateUnsubscribeToken();
      await db.insert(unsubscribeTokens).values({ token, contactId: p.contactId });
      const tracking = { contactId: p.contactId, campaign: CAMPAIGN, variant: p.variant };
      const msg = buildNewsletterMessage({ to: p.email, subject: t.subject, html: t.html, text: t.text, token, tracking });
      const out = await sendNewsletterAndLog(msg, tracking, { send: sendEmail, logActivity: (row) => db.insert(activities).values(row) });
      await db.insert(sendLogs).values({ contactId: p.contactId, resendId: out.id, status: "sent" });
      return out;
    },
    async recordFailure(contactId, err) {
      await db.insert(activities).values({ contactId, type: "newsletter_failed", subject: `${CAMPAIGN}: send failed`, body: JSON.stringify({ campaign: CAMPAIGN, error: err }), performedBy: "newsletter" });
      await db.insert(sendLogs).values({ contactId, status: "failed", errorMessage: err });
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (l) => console.log(l),
  }, { campaign: CAMPAIGN, limit: LIMIT, ratePerSecond: RATE, maxFailureRate: 0.02 });
  console.log(`DONE ${JSON.stringify(summary)}`);
  if (summary.stopped || summary.failed) process.exit(2);
}

function countBy(xs: { variant: string }[]) {
  return xs.reduce<Record<string, number>>((m, x) => ((m[x.variant] = (m[x.variant] || 0) + 1), m), {});
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error(String(e?.message || e).replace(/[A-Za-z0-9_\-+/=]{24,}/g, "<redacted>")); process.exit(1); });
}
