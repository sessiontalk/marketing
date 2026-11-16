import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSesRecord, unwrap, suppressionReason, type SesEvent } from "../src/lib/sesEvents/parse";
import { classifyMessage } from "../src/lib/sesEvents/classify";
import { processBatch, type EventStore } from "../src/lib/sesEvents/process";
import { drain, type QueuePort } from "../src/lib/sesEvents/sqsDrain";
import { splitRecords } from "../scripts/ses-events-backfill";

const T0 = Date.parse("2026-10-26T13:00:00Z");
const iso = (s: number) => new Date(T0 + s * 1000).toISOString();
const mail = (id = "m1", to = "Bob@Example.com") => ({ messageId: id, timestamp: iso(0), destination: [to], tags: { campaign: ["newsletter-2026-10"], variant: ["A1"] }, commonHeaders: { subject: "S" } });
const delivery = (id = "m1", s = 1) => ({ eventType: "Delivery", mail: mail(id), delivery: { timestamp: iso(s), recipients: ["bob@example.com"] } });
const click = (s: number, link: string, ua = "Mozilla/5.0 (Windows NT 10.0) Chrome/142", id = "m1") => ({ eventType: "Click", mail: mail(id), click: { timestamp: iso(s), link, userAgent: ua, ipAddress: "8.8.8.8", isBotEvent: "Unlikely" } });
const open = (s: number, ua = "Mozilla/5.0 (Windows NT 10.0) Chrome/142", ip = "8.8.8.8") => ({ eventType: "Open", mail: mail(), open: { timestamp: iso(s), userAgent: ua, ipAddress: ip } });
const ev = (...raws: any[]): SesEvent[] => raws.flatMap(parseSesRecord);
const sns = (r: any) => JSON.stringify({ Type: "Notification", Message: JSON.stringify(r) });

test("parse: SNS envelope in SQS body, lower-cased recipient, stable key", () => {
  const [a] = parseSesRecord(unwrap(sns(click(100, "https://x"))));
  const [b] = parseSesRecord(unwrap(sns(click(100, "https://x"))));
  assert.equal(a.recipient, "bob@example.com"); assert.equal(a.kind, "click"); assert.equal(a.campaign, "newsletter-2026-10");
  assert.equal(a.eventKey, b.eventKey);
  assert.notEqual(a.eventKey, parseSesRecord(click(100, "https://y"))[0].eventKey);
  assert.equal(unwrap("not json"), null);
});

test("suppression: complaint, SES unsubscribe, hard bounce only", () => {
  assert.equal(suppressionReason({ kind: "complaint", bounceType: null }), "ses_complaint");
  assert.equal(suppressionReason({ kind: "unsubscribe", bounceType: null }), "ses_unsubscribe");
  assert.equal(suppressionReason({ kind: "bounce", bounceType: "Permanent" }), "ses_hard_bounce");
  assert.equal(suppressionReason({ kind: "bounce", bounceType: "Transient" }), null);
  const [b] = parseSesRecord({ eventType: "Bounce", mail: mail(), bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "Bob <BOB@example.com>" }], timestamp: iso(2) } });
  assert.equal(b.recipient, "bob@example.com");
});

test("classify: all links within 60s of delivery = bot", () => {
  const e = ev(delivery(), click(20, "a"), click(21, "b"), click(22, "c"));
  const v = classifyMessage(e);
  for (const x of e.filter((x) => x.kind === "click")) assert.deepEqual(v.get(x.eventKey), { isBot: true, reason: "all_links_within_60s" });
});

test("classify: burst of distinct links later = bot; single human click later = real", () => {
  const e = ev(delivery(), click(3600, "a"), click(3602, "b"));
  assert.ok([...classifyMessage(e).values()].every((x) => x.reason === "multi_link_burst"));
  const h = ev(delivery(), click(3600, "a"), click(4000, "b"));
  assert.ok([...classifyMessage(h).values()].every((x) => !x.isBot));
});

test("classify: scanner UA, scanner IP, Apple MPP, fast open", () => {
  const ua = ev(delivery(), click(9999, "a", "python-requests/2.31"));
  assert.equal(classifyMessage(ua).get(ua[1].eventKey)!.reason, "scanner_user_agent");
  const curl = ev(delivery(), click(9999, "a", "curl/8.1"));
  assert.equal(classifyMessage(curl).get(curl[1].eventKey)!.reason, "scanner_user_agent");
  const mpp = ev(delivery(), open(5000, "Mozilla/5.0", "17.58.1.1"));
  assert.equal(classifyMessage(mpp).get(mpp[1].eventKey)!.reason, "apple_mpp");
  const fast = ev(delivery(), open(3));
  assert.equal(classifyMessage(fast).get(fast[1].eventKey)!.reason, "open_within_5s_of_delivery");
  const gmail = ev(delivery(), open(500, "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)", "66.249.93.71"));
  assert.equal(classifyMessage(gmail).get(gmail[1].eventKey)!.isBot, false);
});

function memStore(contacts: Record<string, string> = { "bob@example.com": "c1" }, failInsert = false) {
  const rows = new Map<string, any>(); const acts: any[] = []; const supp: Array<[string, string]> = [];
  const store: EventStore = {
    async insertEvents(evs) { if (failInsert) throw new Error("db down"); const s = new Set<string>(); for (const e of evs) if (!rows.has(e.eventKey)) { rows.set(e.eventKey, { ...e, isBot: null, activityId: null }); s.add(e.eventKey); } return s; },
    async contactIdsByEmail(es) { return new Map(es.filter((e) => contacts[e]).map((e) => [e, contacts[e]])); },
    async eventsForMessages(p) { return [...rows.values()].filter((r) => p.some((x) => x.sesMessageId === r.sesMessageId && x.recipient === r.recipient)); },
    async setVerdicts(v) { for (const x of v) Object.assign(rows.get(x.eventKey), { isBot: x.isBot, botReason: x.reason }); },
    async createActivity(e) { acts.push(e); rows.get(e.eventKey).activityId = "a" + acts.length; },
    async suppress(email, reason) { supp.push([email, reason]); },
  };
  return { store, rows, acts, supp };
}

test("processBatch: idempotent replay, bot clicks get no activity, real ones do once", async () => {
  const m = memStore();
  const bodies = [sns(delivery()), sns(click(5, "a")), sns(click(6, "b")), sns(open(4000)), "garbage"];
  const r1 = await processBatch(bodies, m.store);
  assert.equal(r1.unparseable, 1); assert.deepEqual(r1.okIndexes, [0, 1, 2, 3]);
  assert.equal(m.acts.length, 1); assert.equal(m.acts[0].kind, "open");
  const r2 = await processBatch(bodies, m.store);
  assert.equal(r2.inserted, 0); assert.equal(m.acts.length, 1);
  assert.equal([...m.rows.values()].filter((r) => r.isBot).length, 2);
});

test("processBatch: complaint + hard bounce suppress via store", async () => {
  const m = memStore();
  await processBatch([{ eventType: "Complaint", mail: mail(), complaint: { complainedRecipients: [{ emailAddress: "bob@example.com" }], timestamp: iso(9) } }], m.store);
  assert.deepEqual(m.supp, [["bob@example.com", "ses_complaint"]]);
  assert.equal(m.acts[0].kind, "complaint");
});

test("drain: deletes only after successful write; nothing deleted on DB error", async () => {
  const mk = (bodies: string[]) => { let given = false; const deleted: string[] = []; const q: QueuePort = { async receive() { if (given) return []; given = true; return bodies.map((b, i) => ({ receiptHandle: "h" + i, body: b })); }, async deleteBatch(h) { deleted.push(...h); } }; return { q, deleted }; };
  const ok = mk([sns(delivery()), "garbage"]);
  const r = await drain(ok.q, memStore().store);
  assert.deepEqual(ok.deleted, ["h0"]); assert.equal(r.unparseable, 1);
  const bad = mk([sns(delivery())]);
  await assert.rejects(drain(bad.q, memStore({}, true).store));
  assert.deepEqual(bad.deleted, []);
});

test("backfill splitRecords handles array, jsonl and concatenated JSON", () => {
  assert.equal(splitRecords('[{"a":1},{"a":2}]').length, 2);
  assert.equal(splitRecords('{"a":1}\n{"a":"}"}').length, 2);
  assert.equal(splitRecords('{"a":1}{"b":2}').length, 2);
});

test("identity notifications (notificationType, no tags, raw) also suppress: SessionCloud / maryam@ shape", async () => {
  const m = memStore({});
  const identityComplaint = { notificationType: "Complaint", mail: { messageId: "scl-1", timestamp: iso(0), destination: ["Someone@Hotmail.example"] },
    complaint: { complaintFeedbackType: "abuse", timestamp: iso(240), complainedRecipients: [{ emailAddress: "Someone@Hotmail.example" }] } };
  const identityHardBounce = { notificationType: "Bounce", mail: { messageId: "scl-2", timestamp: iso(0), destination: ["gone@example.org"] },
    bounce: { bounceType: "Permanent", bounceSubType: "General", timestamp: iso(5), bouncedRecipients: [{ emailAddress: "gone@example.org" }] } };
  const transient = { notificationType: "Bounce", mail: { messageId: "scl-3", timestamp: iso(0), destination: ["full@example.org"] },
    bounce: { bounceType: "Transient", timestamp: iso(5), bouncedRecipients: [{ emailAddress: "full@example.org" }] } };
  const r = await processBatch([JSON.stringify(identityComplaint), sns(identityHardBounce), JSON.stringify(transient)], m.store);
  assert.deepEqual(r.okIndexes, [0, 1, 2]);
  assert.deepEqual(m.supp.sort(), [["gone@example.org", "ses_hard_bounce"], ["someone@hotmail.example", "ses_complaint"]]);
});

test("re-delivery, duplicates and out-of-order arrival converge (one row per event, suppression never reversed)", async () => {
  const m = memStore();
  const complaint = { eventType: "Complaint", mail: mail(), complaint: { complainedRecipients: [{ emailAddress: "bob@example.com" }], timestamp: iso(900) } };
  // complaint first, then the earlier delivery/open, then the same complaint again (SQS at-least-once + SNS duplicate)
  await processBatch([sns(complaint)], m.store);
  await processBatch([sns(open(4000)), sns(delivery()), JSON.stringify(complaint)], m.store);
  await processBatch([sns(complaint), sns(complaint)], m.store);
  assert.equal(m.rows.size, 3);
  assert.equal([...m.rows.values()].filter((r) => r.kind === "complaint").length, 1);
  assert.ok(m.supp.every(([e, why]) => e === "bob@example.com" && why === "ses_complaint"));
  assert.equal(m.acts.filter((a) => a.kind === "complaint").length, 1);
});
