/**
 * One-off, idempotent: enrol the 12 Oct email-01 recipients into trial nurture so they
 * continue from email 02. Step 1 is recorded as already sent at 2026-10-12T16:05:00Z
 * (not sent again). No email is sent by this script.
 *
 * Input: JSON file (path as argv[2]) built read-only from SessionCloud prod
 * (users / applications / tenants + Chargebee subscription). Prints counts and tenant slugs only.
 *
 *   DATABASE_URL=... npx tsx scripts/backfill-12oct-trials.ts <file.json> [--apply]
 * Without --apply it is a dry run.
 */
import { readFileSync } from "fs";
import { and, count, eq } from "drizzle-orm";
import { db } from "../src/db";
import { contacts, trialAccounts, trialNurtureSteps } from "../src/db/schema";
import { planBackfill, BackfillInput, STEP1_SENT_AT } from "../src/lib/trialNurture/backfill";
import { assignBccInternal } from "../src/lib/trialNurture/bcc";
import { isDripSendingEnabled } from "../src/lib/killSwitch";

async function main() {
  const file = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!file) throw new Error("usage: backfill-12oct-trials.ts <file.json> [--apply]");
  const input = JSON.parse(readFileSync(file, "utf8")) as BackfillInput[];
  const { eligible, skipped } = planBackfill(input, new Date());
  for (const s of skipped) console.log(`skip slug=${s.slug} reason=${s.reason}`);
  let inserted = 0, existing = 0, step1 = 0;
  for (const e of eligible) {
    if (!apply) { console.log(`would enrol slug=${e.slug} product=${e.product}`); continue; }
    await db.insert(contacts).values({ email: e.email, username: e.email, firstname: e.firstname ?? undefined, source: "webhook" })
      .onConflictDoNothing({ target: contacts.email });
    const [contact] = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.email, e.email)).limit(1);
    const [{ flagged }] = await db.select({ flagged: count() }).from(trialAccounts).where(eq(trialAccounts.bccInternal, true));
    const bccInternal = assignBccInternal({ sendingEnabled: isDripSendingEnabled(), earlierFlaggedCount: Number(flagged) || 0 });
    const ins = await db.insert(trialAccounts).values({
      contactId: contact.id, appId: e.appId, product: e.product, accountName: e.accountName, sipDomain: e.sipDomain,
      bccInternal, enrolledAt: e.trialStartedAt, trialStartedAt: e.trialStartedAt, trialEndsAt: e.trialEndsAt,
      projectCreatedAt: e.trialStartedAt, planStatus: "trial",
    }).onConflictDoNothing({ target: trialAccounts.appId }).returning({ id: trialAccounts.id });
    if (ins.length) inserted++; else existing++;
    const [ta] = await db.select({ id: trialAccounts.id }).from(trialAccounts).where(eq(trialAccounts.appId, e.appId)).limit(1);
    const s1 = await db.insert(trialNurtureSteps).values({ trialAccountId: ta.id, step: 1, status: "sent", reason: "manual_12oct", createdAt: STEP1_SENT_AT })
      .onConflictDoNothing().returning({ id: trialNurtureSteps.id });
    if (s1.length) step1++;
    const [{ n }] = await db.select({ n: count() }).from(trialAccounts).where(and(eq(trialAccounts.appId, e.appId), eq(trialAccounts.bccInternal, true)));
    console.log(`enrolled slug=${e.slug} new=${ins.length > 0} bcc=${Number(n) > 0} step1_recorded=${s1.length > 0}`);
  }
  console.log(JSON.stringify({ apply, eligible: eligible.length, skipped: skipped.length, inserted, existing, step1Recorded: step1 }));
}
main().catch((e) => { console.error("ERR", String(e?.message || e).slice(0, 200)); process.exit(1); });