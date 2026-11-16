/**
 * Survey #1 invite REAL SEND. NEVER run without Nauman's explicit yes. Same safety model as
 * scripts/newsletter-issue01/send-newsletter-issue01.ts (planBroadcast/runBroadcast, CRM unsubscribe +
 * SES suppression, one claim per recipient in processed_events 'survey:survey-01:<contact id>',
 * fresh unsubscribe token + List-Unsubscribe headers, From/Reply-To SessionTalk <support@sessiontalk.co.uk>).
 *
 *   npx tsx scripts/survey-01/send-survey01.ts --list=S01:/path/survey01_recipients.csv \
 *       --survey-url=https://tally.so/r/<id> --feature-url=https://tally.so/r/<id> [--template-dir=/path]
 *       # DRY RUN (default): no DB, no SES, no AWS. Template + link gates, CSV-level plan and counts.
 *   ... --check-db          # + read-only SELECTs (contacts, activities, processed_events) for the exact count.
 *   ... --confirm-send --expect-count=54 [--batch-size=25] [--batch-gap-min=20] [--rate=2]
 *       [--max-bounce-rate=0.045] [--max-complaint-rate=0.0008] [--suppression-csv=/path]
 *       # REAL SEND. Needs SES_CONFIGURATION_SET=marketing-newsletter. Before the first email and before every
 *       # batch: CloudWatch account rates must be below the thresholds (fail closed). Between batches it waits
 *       # --batch-gap-min and reads the SES event archive for the previous batch: any complaint or 2+ hard
 *       # bounces pauses the run. Re-runs skip claimed recipients, so a paused run can be resumed.
 *
 * Templates (survey01-invite.template.{html,txt} + .subject.txt) are NOT committed (public repo, draft copy);
 * point --template-dir at the send pack. Recipient CSVs never go in git.
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { parse } from "csv-parse/sync";
import { buildNewsletterMessage, sendNewsletterAndLog, isNewsletterSentFor, NEWSLETTER_SENT_ACTIVITY } from "../../src/lib/newsletter";
import { NEWSLETTER_FROM_EMAIL, NEWSLETTER_REPLY_TO } from "../../src/lib/email";
import { normalizeEmail } from "../../src/lib/suppression";
import { planBroadcast, runBroadcast, contactExclusion, type BroadcastContact, type PlannedSend } from "../../src/lib/newsletterBroadcast";
import { BANNED, readSuppressionCsv } from "../newsletter-issue01/issue01";
import {
  SURVEY_CAMPAIGN, SURVEY_VARIANT, SURVEY_TEMPLATE_FILE, surveyClaimKey, DEFAULT_MAX_BOUNCE_RATE, DEFAULT_MAX_COMPLAINT_RATE,
  templatePlaceholderProblems, formUrlProblems, surveyLink, renderSurvey, safeFirstName, reputationGate, batchStopRule, chunk, type Rates,
} from "../../src/lib/survey01";

const args = process.argv.slice(2);
const arg = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const num = (k: string, d?: number) => (arg(k) !== undefined ? Number(arg(k)) : d);
const CONFIRM = args.includes("--confirm-send");
const CHECK_DB = args.includes("--check-db") || CONFIRM;
const EXPECT = num("expect-count");
const RATE = num("rate", 2)!;
const BATCH = num("batch-size", 25)!;
const GAP_MIN = num("batch-gap-min", 20)!;
const MAX_BOUNCE = num("max-bounce-rate", DEFAULT_MAX_BOUNCE_RATE)!;
const MAX_COMPLAINT = num("max-complaint-rate", DEFAULT_MAX_COMPLAINT_RATE)!;
const SUPP_CSV = arg("suppression-csv");
const TPL_DIR = arg("template-dir") || __dirname;
const SURVEY_URL = arg("survey-url");
const FEATURE_URL = arg("feature-url");
const LIST = args.filter((a) => a.startsWith("--list=")).map((a) => { const v = a.slice(7); const i = v.indexOf(":"); return { variant: v.slice(0, i), file: v.slice(i + 1) }; });

interface Row { email: string; variant: string; firstName?: string; seg?: string }
export function readSurveyCsv(file: string): Row[] {
  const recs: Record<string, string>[] = parse(fs.readFileSync(file, "utf8"), { columns: true, skip_empty_lines: true, bom: true });
  return recs.map((r) => ({ email: String(r.email ?? ""), variant: SURVEY_VARIANT, firstName: safeFirstName(r.first_name), seg: r.segment || undefined }));
}

function readTemplate() {
  const p = (ext: string) => path.join(TPL_DIR, `${SURVEY_TEMPLATE_FILE}.${ext}`);
  const subjFile = fs.readFileSync(p("subject.txt"), "utf8");
  const subject = (subjFile.match(/^Subject:\s*(.+)$/m)?.[1] ?? subjFile.split(/\r?\n/)[0]).trim();
  return { subject, html: fs.readFileSync(p("template.html"), "utf8"), text: fs.readFileSync(p("template.txt"), "utf8") };
}

/** Offline gates (no DB/SES/AWS). */
export function surveyPreflight(): string[] {
  const f: string[] = [];
  if (LIST.length !== 1 || LIST[0].variant !== SURVEY_VARIANT) f.push(`exactly one --list=${SURVEY_VARIANT}:path`);
  else if (!fs.existsSync(LIST[0].file)) f.push("list not found");
  if (!(RATE > 0 && RATE <= 10)) f.push("--rate must be in (0, 10]");
  if (!(Number.isInteger(BATCH) && BATCH > 0)) f.push("--batch-size must be a positive integer");
  if (!(GAP_MIN >= 0)) f.push("--batch-gap-min must be >= 0");
  if (!(MAX_BOUNCE > 0 && MAX_BOUNCE <= 0.1) || !(MAX_COMPLAINT > 0 && MAX_COMPLAINT <= 0.01)) f.push("rate thresholds out of range");
  if (NEWSLETTER_FROM_EMAIL !== "SessionTalk <support@sessiontalk.co.uk>" || NEWSLETTER_REPLY_TO !== "support@sessiontalk.co.uk") f.push("unexpected From/Reply-To");
  if (SUPP_CSV && !fs.existsSync(SUPP_CSV)) f.push("suppression CSV not found");
  f.push(...formUrlProblems("--survey-url", SURVEY_URL), ...formUrlProblems("--feature-url", FEATURE_URL));
  for (const ext of ["subject.txt", "template.html", "template.txt"]) {
    const p = path.join(TPL_DIR, `${SURVEY_TEMPLATE_FILE}.${ext}`);
    if (!fs.existsSync(p)) { f.push(`missing ${path.basename(p)} (use --template-dir)`); continue; }
    const s = fs.readFileSync(p, "utf8");
    if (BANNED.test(s)) f.push(`banned term in ${path.basename(p)}`);
    f.push(...templatePlaceholderProblems(path.basename(p), s));
    if (ext !== "subject.txt" && !s.includes("{{unsubscribe_url}}")) f.push(`no {{unsubscribe_url}} in ${path.basename(p)}`);
    if (ext !== "subject.txt" && (!s.includes("{{survey_url}}") || !s.includes("{{feature_request_url}}"))) f.push(`missing survey/feature link in ${path.basename(p)}`);
  }
  if (CONFIRM) {
    if (EXPECT === undefined || !Number.isInteger(EXPECT)) f.push("--confirm-send needs --expect-count=N");
    if ((process.env.SES_CONFIGURATION_SET || "").trim() !== "marketing-newsletter") f.push("SES_CONFIGURATION_SET must be marketing-newsletter");
    if (!/^https:\/\//.test(process.env.NEXT_PUBLIC_APP_URL || "")) f.push("NEXT_PUBLIC_APP_URL must be https");
    if (!process.env.DATABASE_URL) f.push("DATABASE_URL is not set");
  }
  return f;
}

// ── read-only AWS (aws CLI, same as the 28 Oct runbook): CloudWatch reputation + SES event archive ──
const REGION = (process.env.AWS_SES_REGION || "eu-west-2").trim();
function aws(a: string[], raw = false): any {
  const env: NodeJS.ProcessEnv = { ...process.env, AWS_DEFAULT_REGION: REGION, AWS_PAGER: "" };
  const r = spawnSync("aws", [...a, "--region", REGION, ...(raw ? [] : ["--output", "json"])], { env, encoding: "utf8", shell: process.platform === "win32", maxBuffer: 256 << 20 });
  if (r.status !== 0) throw new Error(`aws ${a[0]} ${a[1]} failed`);
  return raw ? r.stdout : JSON.parse(r.stdout || "{}");
}
function readRates(): Rates {
  try {
    const end = new Date(), start = new Date(end.getTime() - 6 * 3600e3);
    const q = path.join(require("os").tmpdir(), `survey01-cwq-${process.pid}.json`);
    fs.writeFileSync(q, JSON.stringify([["b", "Reputation.BounceRate"], ["c", "Reputation.ComplaintRate"]].map(([Id, MetricName]) => ({ Id, MetricStat: { Metric: { Namespace: "AWS/SES", MetricName }, Period: 300, Stat: "Average" } }))));
    let r: any; try { r = aws(["cloudwatch", "get-metric-data", "--metric-data-queries", `file://${q}`, "--start-time", start.toISOString(), "--end-time", end.toISOString()]); } finally { fs.rmSync(q, { force: true }); }
    const v = (id: string) => { const x = r.MetricDataResults?.find((m: any) => m.Id === id); return x?.Values?.length ? Number(x.Values[0]) : null; };
    return { bounce: v("b"), complaint: v("c") };
  } catch { return { bounce: null, complaint: null }; }
}
function splitJson(s: string): any[] {
  const out: any[] = []; let d = 0, st = -1, inS = false, esc = false;
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (inS) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inS = false; continue; }
    if (c === '"') inS = true; else if (c === "{") { if (d++ === 0) st = i; } else if (c === "}" && --d === 0 && st >= 0) { try { out.push(JSON.parse(s.slice(st, i + 1))); } catch {} st = -1; } }
  return out;
}
/** Hard bounces + complaints for this campaign and these contact ids since `since` (counts only). */
function measureBatch(contactIds: Set<string>, since: Date): { hardBounces: number; complaints: number } | null {
  try {
    const fh = aws(["firehose", "describe-delivery-stream", "--delivery-stream-name", "marketing-ses-events"]);
    const dest = fh.DeliveryStreamDescription.Destinations[0]; const s3 = dest.ExtendedS3DestinationDescription || dest.S3DestinationDescription;
    const bucket = s3.BucketARN.split(":").pop(); const hb = new Set<string>(), cp = new Set<string>();
    for (let t = Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()); t <= Date.now(); t += 86400e3) {
      const d = new Date(t); const p = `ses/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/`;
      for (const o of aws(["s3api", "list-objects-v2", "--bucket", bucket, "--prefix", p]).Contents || []) {
        if (new Date(o.LastModified) < since) continue;
        for (const ev of splitJson(aws(["s3", "cp", `s3://${bucket}/${o.Key}`, "-"], true))) {
          const tag = (n: string) => ev.mail?.tags?.[n]?.[0];
          if (tag("campaign") !== SURVEY_CAMPAIGN || !contactIds.has(tag("contact_id"))) continue;
          const ty = ev.eventType || ev.notificationType;
          if (ty === "Bounce" && ev.bounce?.bounceType === "Permanent") hb.add(ev.mail.messageId);
          if (ty === "Complaint") cp.add(ev.mail.messageId);
        }
      }
    }
    return { hardBounces: hb.size, complaints: cp.size };
  } catch { return null; }
}

async function main() {
  const fail = surveyPreflight();
  if (fail.length) { console.error("PREFLIGHT FAILED, nothing sent:\n - " + fail.join("\n - ")); process.exit(1); }
  const rows = readSurveyCsv(LIST[0].file);
  const extra = new Map(rows.map((r) => [normalizeEmail(r.email), r]));
  const tpl = readTemplate();
  // Render-check every row offline (fails on any unfilled placeholder).
  for (const r of rows) for (const [s, h] of [[tpl.html, true], [tpl.text, false]] as const)
    renderSurvey(s, { firstName: r.firstName, surveyUrl: surveyLink(SURVEY_URL!, { seg: r.seg }), featureUrl: surveyLink(FEATURE_URL!, { seg: r.seg }) }, h);
  const sesSuppressed = SUPP_CSV ? readSuppressionCsv(SUPP_CSV) : undefined;
  const cfg = (process.env.SES_CONFIGURATION_SET || "").trim() ? "set" : "unset";
  const head = `campaign=${SURVEY_CAMPAIGN} subject_len=${tpl.subject.length} rows=${rows.length}`;

  if (!CHECK_DB) {
    const plan = planBroadcast({ rows, contactsByEmail: new Map(), alreadySentContactIds: new Set(), sesSuppressed });
    console.log(`[dry run, no DB/SES/AWS] ${head} would_send<=${plan.send.length} excluded=${JSON.stringify(plan.excluded)} batches=${chunk(plan.send, BATCH).length}x<=${BATCH} SES_CONFIGURATION_SET ${cfg}`);
    console.log("Gates passed: template placeholders, form links, banned terms, unsubscribe link, From/Reply-To. CRM exclusions need --check-db.");
    return;
  }

  const { db } = await import("../../src/db");
  const { contacts, activities, processedEvents, unsubscribeTokens, sendLogs } = await import("../../src/db/schema");
  const { sql, inArray, and, eq } = await import("drizzle-orm");
  const emails = Array.from(extra.keys());
  const byEmail = new Map<string, BroadcastContact>();
  for (let i = 0; i < emails.length; i += 500) {
    const found = await db.select({ id: contacts.id, email: contacts.email, source: contacts.source, unsubscribed: contacts.unsubscribed })
      .from(contacts).where(inArray(sql<string>`lower(${contacts.email})`, emails.slice(i, i + 500)));
    for (const c of found) byEmail.set(normalizeEmail(c.email), c);
  }
  const ids = Array.from(byEmail.values()).map((c) => c.id); const already = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const ch = ids.slice(i, i + 500);
    for (const a of await db.select({ contactId: activities.contactId, type: activities.type, body: activities.body }).from(activities)
      .where(and(eq(activities.type, NEWSLETTER_SENT_ACTIVITY), inArray(activities.contactId, ch)))) if (isNewsletterSentFor(a, SURVEY_CAMPAIGN)) already.add(a.contactId);
    for (const c of await db.select({ eventId: processedEvents.eventId }).from(processedEvents).where(inArray(processedEvents.eventId, ch.map(surveyClaimKey)))) already.add(c.eventId.split(":").pop()!);
  }
  const plan = planBroadcast({ rows, contactsByEmail: byEmail, alreadySentContactIds: already, sesSuppressed });
  console.log(`${head} SEND=${plan.send.length} new_contacts=${plan.toCreate} excluded=${JSON.stringify(plan.excluded)} batches=${chunk(plan.send, BATCH).length}x<=${BATCH} rate=${RATE}/s SES_CONFIGURATION_SET ${cfg}`);
  if (!CONFIRM) { console.log("Dry run only (read-only SELECTs). Nothing written, nothing sent."); return; }
  if (plan.send.length !== EXPECT) { console.error(`COUNT CHECK FAILED: SEND=${plan.send.length} but --expect-count=${EXPECT}. Nothing sent.`); process.exit(1); }

  const { sendEmail } = await import("../../src/lib/email");
  const { dbSuppressionStore } = await import("../../src/lib/suppressionDb");
  const { assertSendable } = await import("../../src/lib/suppression");
  const { generateUnsubscribeToken } = await import("../../src/lib/tokens");
  const sentIds = new Map<string, string>(); // email -> contact id (this run)

  const deps = {
    assertSendable: (email: string) => assertSendable(email, dbSuppressionStore),
    async ensureContact(email: string) {
      await db.insert(contacts).values({ email, username: email, source: "survey_list" }).onConflictDoNothing();
      const [c] = await db.select({ id: contacts.id, email: contacts.email, source: contacts.source, unsubscribed: contacts.unsubscribed }).from(contacts).where(sql`lower(${contacts.email}) = ${email}`);
      if (!c) throw new Error("contact row not found after insert");
      if (contactExclusion(c)) throw new Error(`contact excluded (${contactExclusion(c)})`);
      return c.id;
    },
    async claim(_campaign: string, contactId: string) {
      return (await db.insert(processedEvents).values({ eventId: surveyClaimKey(contactId) }).onConflictDoNothing().returning()).length > 0;
    },
    async sendOne(p: PlannedSend & { contactId: string }) {
      const r = extra.get(p.email);
      const token = generateUnsubscribeToken();
      await db.insert(unsubscribeTokens).values({ token, contactId: p.contactId });
      const v = { firstName: r?.firstName, surveyUrl: surveyLink(SURVEY_URL!, { seg: r?.seg }), featureUrl: surveyLink(FEATURE_URL!, { seg: r?.seg }) };
      const tracking = { contactId: p.contactId, campaign: SURVEY_CAMPAIGN, variant: SURVEY_VARIANT };
      const msg = buildNewsletterMessage({ to: p.email, subject: tpl.subject, html: renderSurvey(tpl.html, v, true), text: renderSurvey(tpl.text, v, false), token, tracking });
      const out = await sendNewsletterAndLog(msg, tracking, { send: sendEmail, logActivity: (row) => db.insert(activities).values(row) });
      await db.insert(sendLogs).values({ contactId: p.contactId, resendId: out.id, status: "sent" });
      sentIds.set(p.email, p.contactId);
      return out;
    },
    async recordFailure(contactId: string, err: string) {
      await db.insert(activities).values({ contactId, type: "newsletter_failed", subject: `${SURVEY_CAMPAIGN}: send failed`, body: JSON.stringify({ campaign: SURVEY_CAMPAIGN, error: err }), performedBy: "newsletter" });
      await db.insert(sendLogs).values({ contactId, status: "failed", errorMessage: err });
    },
    sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    log: (l: string) => console.log(l),
  };

  let batchStart = new Date();
  const batches = chunk(plan.send, BATCH); const totals = { sent: 0, failed: 0, skipped: 0 };
  for (let i = 0; i < batches.length; i++) {
    if (i > 0) {
      console.log(`WAIT ${GAP_MIN} min before batch ${i + 1}/${batches.length}`);
      await deps.sleep(GAP_MIN * 60e3);
      const prevIds = new Set(batches[i - 1].map((p) => sentIds.get(p.email)).filter(Boolean) as string[]);
      const m = measureBatch(prevIds, batchStart);
      if (!m) { console.log(`PAUSE before batch ${i + 1}: previous batch unmeasurable`); process.exit(3); }
      console.log(`MEASURE batch ${i}: hard=${m.hardBounces} complaints=${m.complaints}`);
      const stop = batchStopRule(m);
      if (stop) { console.log(`PAUSE before batch ${i + 1}: ${stop}`); process.exit(3); }
    }
    const g = reputationGate(readRates(), { maxBounce: MAX_BOUNCE, maxComplaint: MAX_COMPLAINT });
    if (g.length) { console.log(`STOP before batch ${i + 1}: ${g.join("; ")}`); process.exit(i === 0 ? 1 : 3); }
    batchStart = new Date(Date.now() - 60e3);
    const s = await runBroadcast(batches[i], deps, { campaign: SURVEY_CAMPAIGN, ratePerSecond: RATE, maxFailureRate: 0.02 });
    totals.sent += s.sent; totals.failed += s.failed; totals.skipped += s.skipped;
    console.log(`BATCH ${i + 1}/${batches.length} ${JSON.stringify(s)}`);
    if (s.stopped || s.failed) { console.log(`DONE ${JSON.stringify(totals)}`); process.exit(2); }
  }
  console.log(`DONE ${JSON.stringify(totals)} (measure the last batch with the runbook before any follow-up)`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error(String(e?.message || "error").replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, "<email>").replace(/[A-Za-z0-9_\-+/=]{24,}/g, "<redacted>")); process.exit(1); });
}
