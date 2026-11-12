/**
 * Replay SES newsletter events from the S3 archive (or a local JSON file) into email_events.
 * DRY-RUN BY DEFAULT: classifies and prints a summary, writes nothing.
 *   npx tsx scripts/ses-events-backfill.ts --file events.json
 *   npx tsx scripts/ses-events-backfill.ts --s3 sessiontalk-marketing-ses-events [--prefix p/]
 *   ... --apply   (writes via the same idempotent processBatch as the worker; needs DATABASE_URL)
 * Queue contents are NOT read here (ReceiveMessage hides messages): the worker drains SQS; overlap with S3 dedupes on event_key.
 */
import { readFileSync } from "node:fs";
import { classifyAll } from "../src/lib/sesEvents/classify";
import { parseSesRecord, suppressionReason, unwrap, type SesEvent } from "../src/lib/sesEvents/parse";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes("--apply");

/** Accepts JSON array, JSON-lines, concatenated JSON (Firehose), SNS envelopes. */
export function splitRecords(text: string): unknown[] {
  const t = text.trim();
  if (!t) return [];
  try { const j = JSON.parse(t); return Array.isArray(j) ? j : [j]; } catch {}
  const out: unknown[] = []; let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true; else if (ch === "{") { if (depth++ === 0) start = i; } else if (ch === "}" && --depth === 0) { try { out.push(JSON.parse(t.slice(start, i + 1))); } catch {} }
  }
  return out;
}

async function loadS3(bucket: string, prefix?: string): Promise<unknown[]> {
  const { S3Client, ListObjectsV2Command, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });
  const out: unknown[] = []; let token: string | undefined;
  do {
    const l = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const o of l.Contents ?? []) {
      const g = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: o.Key! }));
      out.push(...splitRecords(await g.Body!.transformToString()));
    }
    token = l.NextContinuationToken;
  } while (token);
  return out;
}

async function main() {
  const file = flag("--file"), bucket = flag("--s3");
  if (!file && !bucket) throw new Error("need --file or --s3");
  const bodies = file ? splitRecords(readFileSync(file, "utf8")) : await loadS3(bucket!, flag("--prefix"));
  const dedup = new Map<string, SesEvent>(); let unparseable = 0;
  for (const b of bodies) { const raw = unwrap(b); const evs = raw ? parseSesRecord(raw) : []; if (!evs.length) unparseable++; for (const e of evs) dedup.set(e.eventKey, e); }
  const events = Array.from(dedup.values());
  const v = classifyAll(events);
  const byKind: Record<string, number> = {}, botReasons: Record<string, number> = {};
  const eng = { open: { real: 0, bot: 0, realUnique: new Set<string>() }, click: { real: 0, bot: 0, realUnique: new Set<string>() } };
  const dnc = new Map<string, string>();
  for (const e of events) {
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    if (e.kind === "open" || e.kind === "click") {
      const x = v.get(e.eventKey)!; const b = eng[e.kind];
      if (x.isBot) { b.bot++; botReasons[`${e.kind}:${x.reason}`] = (botReasons[`${e.kind}:${x.reason}`] ?? 0) + 1; } else { b.real++; b.realUnique.add(e.recipient); }
    }
    const why = suppressionReason(e); if (why && !dnc.has(e.recipient)) dnc.set(e.recipient, why);
  }
  const dncByReason: Record<string, number> = {}; for (const r of dnc.values()) dncByReason[r] = (dncByReason[r] ?? 0) + 1;
  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run", records: bodies.length, unparseable, uniqueEvents: events.length, byKind,
    opens: { real: eng.open.real, bot: eng.open.bot, realUniqueRecipients: eng.open.realUnique.size },
    clicks: { real: eng.click.real, bot: eng.click.bot, realUniqueRecipients: eng.click.realUnique.size },
    botReasons, wouldBecomeDoNotContact: dnc.size, dncByReason,
  }, null, 2));
  if (!APPLY) return;
  const { processBatch } = await import("../src/lib/sesEvents/process");
  const { dbEventStore } = await import("../src/lib/sesEvents/store");
  for (let i = 0; i < bodies.length; i += 200) { const r = await processBatch(bodies.slice(i, i + 200), dbEventStore); console.log(JSON.stringify({ batch: i / 200, ...r, okIndexes: undefined })); }
}
if (process.argv[1]?.includes("ses-events-backfill")) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
