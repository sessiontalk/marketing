/**
 * Manually suppress addresses (marketing unsubscribe). Use for unsubscribe requests that arrive by
 * email at support@sessiontalk.co.uk (the List-Unsubscribe mailto): those are NOT recorded
 * automatically. Sets contacts.unsubscribed = true on every row with that lower(email), creating a
 * contact row (source=unsubscribe_mailto) if none exists, and cancels active sequence enrolments.
 * Every sender checks contacts.unsubscribed before sending (see src/lib/suppression.ts).
 *
 *   DATABASE_URL=... npx tsx scripts/suppress-emails.ts a@example.com b@example.com          # dry run
 *   DATABASE_URL=... npx tsx scripts/suppress-emails.ts --file=list.txt --confirm            # writes
 * Without --confirm nothing is read or written: it only validates and prints the plan.
 */
import { readFileSync } from "fs";
import { isPlausibleEmail, normalizeEmail } from "../src/lib/suppression";

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes("--confirm");
  const file = args.find((a) => a.startsWith("--file="))?.slice("--file=".length);
  const raw = [
    ...args.filter((a) => !a.startsWith("--")),
    ...(file ? readFileSync(file, "utf8").split(/[\s,;]+/) : []),
  ].filter(Boolean);
  const emails = Array.from(new Set(raw.map(normalizeEmail)));
  const bad = emails.filter((e) => !isPlausibleEmail(e));
  if (bad.length) throw new Error(`invalid address(es): ${bad.join(", ")}`);
  if (!emails.length) throw new Error("usage: suppress-emails.ts <email...> [--file=path] [--confirm]");
  if (!confirm) {
    console.log(`[dry run] would suppress ${emails.length} address(es); re-run with --confirm to write.`);
    return;
  }
  const { dbSuppressionStore } = await import("../src/lib/suppressionDb");
  let created = 0;
  for (const e of emails) if ((await dbSuppressionStore.suppress(e, "unsubscribe_mailto")).created) created++;
  console.log(`suppressed ${emails.length} address(es) (${created} new contact rows).`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(String(e?.message || e)); process.exit(1); });
