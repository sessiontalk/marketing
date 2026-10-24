import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { QueryBuilder } from "drizzle-orm/pg-core";
import {
  buildNewsletterMessage, sanitizeTagValue, newsletterSesOptions, addSesNoTrack, sendNewsletterAndLog,
  newsletterSentActivity, isNewsletterSentFor, NEWSLETTER_SENT_ACTIVITY,
} from "../src/lib/newsletter";
import { buildSendEmailInput, type SendEmailParams } from "../src/lib/email";
import { planBroadcast, runBroadcast, broadcastContactWhere, contactExclusion, type BroadcastContact } from "../src/lib/newsletterBroadcast";
import { contacts } from "../src/db/schema";

const TOKEN = "a".repeat(64);
const CID = "3f1c2b9e-1111-4222-8333-944455556666";
const tracking = { contactId: CID, campaign: "newsletter-2026-10", variant: "A1" };
const base = { to: "x@example.com", subject: "s", html: '<a href="{{unsubscribe_url}}">u</a>', text: "u {{unsubscribe_url}}", token: TOKEN, tracking };

// ─── SES configuration set + tags ──────────────────────────────────

test("SES_CONFIGURATION_SET set: ConfigurationSetName and contact_id/campaign/variant tags are sent", () => {
  const m = buildNewsletterMessage({ ...base, env: { SES_CONFIGURATION_SET: "marketing-newsletter" } });
  const input = buildSendEmailInput(m);
  assert.equal(input.ConfigurationSetName, "marketing-newsletter");
  assert.deepEqual(input.EmailTags, [
    { Name: "contact_id", Value: CID },
    { Name: "campaign", Value: "newsletter-2026-10" },
    { Name: "variant", Value: "A1" },
  ]);
});

test("SES_CONFIGURATION_SET unset (or blank): neither ConfigurationSetName nor tags are sent", () => {
  for (const env of [{}, { SES_CONFIGURATION_SET: "" }, { SES_CONFIGURATION_SET: "   " }]) {
    const input = buildSendEmailInput(buildNewsletterMessage({ ...base, env }));
    assert.equal("ConfigurationSetName" in input, false);
    assert.equal("EmailTags" in input, false);
  }
  assert.deepEqual(newsletterSesOptions(tracking, {}), {});
});

test("tag values are sanitised to [A-Za-z0-9_.-]", () => {
  assert.equal(sanitizeTagValue("A2alt"), "A2alt");
  assert.equal(sanitizeTagValue("newsletter 2026/10 #1"), "newsletter_2026_10__1");
  assert.equal(sanitizeTagValue("é<b>"), "__b_");
  assert.equal(sanitizeTagValue(""), "_");
  assert.equal(sanitizeTagValue("x".repeat(300)).length, 256);
  const o = newsletterSesOptions({ contactId: "a b", campaign: "c:d", variant: "B!" }, { SES_CONFIGURATION_SET: "marketing-newsletter" });
  for (const v of Object.values(o.tags!)) assert.match(v, /^[A-Za-z0-9_.-]+$/);
});

test("other senders unchanged: no ConfigurationSetName, tags only when given", () => {
  const plain = buildSendEmailInput({ to: "a@b.co", subject: "s", text: "t" });
  assert.equal("ConfigurationSetName" in plain, false);
  assert.equal("EmailTags" in plain, false);
  assert.deepEqual(buildSendEmailInput({ to: "a@b.co", subject: "s", text: "t", tags: { k: "v" } }).EmailTags, [{ Name: "k", Value: "v" }]);
});

// ─── ses:no-track + List-Unsubscribe ───────────────────────────────

test("ses:no-track is added to unsubscribe and privacy links only; headers keep RFC 8058 one-click", () => {
  const html = [
    '<a href="{{unsubscribe_url}}" style="x">Unsubscribe</a>',
    '<a href="https://sessiontalk.io/privacy" style="y">Privacy</a>',
    '<a href="https://cloud.sessiontalk.io/">Portal</a>',
    '<a href="mailto:support@sessiontalk.co.uk">Mail</a>',
  ].join("");
  const out = addSesNoTrack(html);
  assert.match(out, /<a ses:no-track href="\{\{unsubscribe_url\}\}" style="x">/);
  assert.match(out, /<a ses:no-track href="https:\/\/sessiontalk\.io\/privacy" style="y">/);
  assert.match(out, /<a href="https:\/\/cloud\.sessiontalk\.io\/">/);
  assert.match(out, /<a href="mailto:support@sessiontalk\.co\.uk">/);
  assert.equal(addSesNoTrack(out), out); // idempotent
  const m = buildNewsletterMessage({ ...base, html, env: {} });
  assert.match(m.html!, /<a ses:no-track href="https:\/\/marketing\.sessiontalk\.co\.uk\/api\/unsubscribe\?token=a{64}"/);
  assert.match(m.headers!["List-Unsubscribe"], /^<https:\/\/marketing\.sessiontalk\.co\.uk\/api\/unsubscribe\?token=a{64}>, <mailto:support@sessiontalk\.co\.uk\?subject=unsubscribe>$/);
  assert.equal(m.headers!["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

// ─── newsletter_sent activity ──────────────────────────────────────

test("sendNewsletterAndLog logs a newsletter_sent activity with the SES MessageId (config set or not)", async () => {
  for (const env of [{}, { SES_CONFIGURATION_SET: "marketing-newsletter" }]) {
    const logged: any[] = [];
    const sent: SendEmailParams[] = [];
    const msg = buildNewsletterMessage({ ...base, env });
    const out = await sendNewsletterAndLog(msg, tracking, {
      send: async (m) => { sent.push(m); return { id: "0100-msg-id" }; },
      logActivity: async (row) => { logged.push(row); },
    });
    assert.equal(out.id, "0100-msg-id");
    assert.equal(sent.length, 1);
    assert.equal(logged.length, 1);
    assert.equal(logged[0].type, NEWSLETTER_SENT_ACTIVITY);
    assert.equal(logged[0].contactId, CID);
    assert.deepEqual(JSON.parse(logged[0].body), { campaign: "newsletter-2026-10", variant: "A1", ses_message_id: "0100-msg-id" });
    assert.ok(isNewsletterSentFor(logged[0], "newsletter-2026-10"));
    assert.ok(!isNewsletterSentFor(logged[0], "newsletter-2026-11"));
  }
  await assert.rejects(sendNewsletterAndLog(buildNewsletterMessage({ ...base, env: {} }), tracking, { send: async () => ({}), logActivity: async () => {} }));
  assert.equal(JSON.parse(newsletterSentActivity({ ...tracking, messageId: "m", subject: "s", seed: true }).body).seed, true);
});

// ─── broadcast recipients ──────────────────────────────────────────

const c = (id: string, email: string, source: string | null = "csv_import", unsubscribed = false): BroadcastContact => ({ id, email, source, unsubscribed });

test("broadcast plan excludes seed inbox/aliases, newsletter_seed contacts, unsubscribed, SES-suppressed and already-sent", () => {
  const rows = [
    "ok1@example.com", "OK1@example.com", "bad", "naumansulaiman@googlemail.com", "naumansulaiman+1@googlemail.com",
    "seedsrc@example.com", "unsub@example.com", "suppressed@example.com", "sent@example.com", "new@example.com",
  ].map((email) => ({ email, variant: "A1" }));
  const contactsByEmail = new Map([
    ["ok1@example.com", c("id-ok1", "ok1@example.com")],
    ["seedsrc@example.com", c("id-seed", "seedsrc@example.com", "newsletter_seed")],
    ["unsub@example.com", c("id-unsub", "unsub@example.com", "webhook", true)],
    ["sent@example.com", c("id-sent", "sent@example.com")],
  ]);
  const p = planBroadcast({ rows, contactsByEmail, alreadySentContactIds: new Set(["id-sent"]), sesSuppressed: new Set(["suppressed@example.com"]) });
  assert.deepEqual(p.send.map((s) => s.email), ["ok1@example.com", "new@example.com"]);
  assert.deepEqual(p.excluded, { invalid: 1, duplicate: 1, seed_inbox: 2, seed_contact: 1, unsubscribed: 1, ses_suppressed: 1, already_sent: 1 });
  assert.equal(p.toCreate, 1);
  assert.equal(contactExclusion({ email: "x@y.com", source: "NEWSLETTER_SEED ", unsubscribed: false }), "seed_contact");
});

test("broadcast SQL condition excludes source newsletter_seed, unsubscribed and the seed inbox", () => {
  const q = new QueryBuilder().select({ id: contacts.id }).from(contacts).where(broadcastContactWhere()).toSQL();
  assert.match(q.sql, /"contacts"\."source" is null or "contacts"\."source" <> \$1/);
  assert.match(q.sql, /"contacts"\."unsubscribed" is null or "contacts"\."unsubscribed" = \$2/);
  assert.match(q.sql, /lower\("contacts"\."email"\) !~ \$3/);
  assert.deepEqual(q.params.slice(0, 2), ["newsletter_seed", false]);
});

function fakeDeps(over: Partial<Parameters<typeof runBroadcast>[1]> = {}) {
  const claims = new Set<string>();
  const log: string[] = [];
  const sent: string[] = [];
  const sleeps: number[] = [];
  const deps = {
    assertSendable: async () => {},
    ensureContact: async (email: string) => `new-${email}`,
    claim: async (campaign: string, id: string) => (claims.has(`${campaign}:${id}`) ? false : (claims.add(`${campaign}:${id}`), true)),
    sendOne: async (p: any) => { sent.push(p.contactId); return { id: `m-${p.contactId}` }; },
    recordFailure: async () => {},
    sleep: async (ms: number) => { sleeps.push(ms); },
    log: (l: string) => { log.push(l); },
    ...over,
  };
  return { deps, claims, log, sent, sleeps };
}
const plan = (n: number) => Array.from({ length: n }, (_, i) => ({ email: `u${i}@example.com`, variant: i % 2 ? "B" : "A1", contactId: i % 3 ? `c${i}` : null }));
const opts = { campaign: "newsletter-2026-10", ratePerSecond: 2, maxFailureRate: 0.02 };

test("runBroadcast: rate limited, honours --limit, re-run sends nothing (claims)", async () => {
  const f = fakeDeps();
  const r1 = await runBroadcast(plan(5), f.deps, opts);
  assert.deepEqual([r1.sent, r1.failed, r1.skipped, r1.stopped], [5, 0, 0, false]);
  assert.deepEqual(f.sleeps, [500, 500, 500, 500, 500]);
  const r2 = await runBroadcast(plan(5), f.deps, opts); // same claims store = a re-run
  assert.deepEqual([r2.sent, r2.skipped], [0, 5]);
  const g = fakeDeps();
  assert.equal((await runBroadcast(plan(5), g.deps, { ...opts, limit: 2 })).sent, 2);
});

test("runBroadcast: suppressed at send time is skipped, failures stop the run above 2% and keep the claim", async () => {
  const s = fakeDeps({ assertSendable: async (e: string) => { if (e === "u1@example.com") throw new Error("suppressed"); } });
  const r = await runBroadcast(plan(3), s.deps, opts);
  assert.deepEqual([r.sent, r.skipped, r.failed], [2, 1, 0]);
  const failures: string[] = [];
  const f = fakeDeps({
    sendOne: async (p: any) => { if (p.contactId === "c2") throw new Error("Throttling AKIAABCDEFGHIJKLMNOPQRSTUVWX"); return { id: "m" }; },
    recordFailure: async (id: string, err: string) => { failures.push(`${id} ${err}`); },
  });
  const r2 = await runBroadcast(plan(10), f.deps, opts);
  assert.equal(r2.stopped, true);
  assert.deepEqual([r2.sent, r2.failed], [2, 1]);
  assert.equal(failures.length, 1);
  assert.doesNotMatch(failures[0] + f.log.join("\n"), /AKIAABCDEFGHIJKLMNOPQRSTUVWX/); // secrets redacted
  assert.ok(f.claims.has("newsletter-2026-10:c2")); // claim kept: never auto-retried
});

test("broadcast script: dry run by default, real send needs --confirm-send and --expect-count, no top-level DB/SES import", () => {
  const src = readFileSync("scripts/newsletter-issue01/send-newsletter-issue01.ts", "utf8");
  assert.match(src, /const CONFIRM = args\.includes\("--confirm-send"\);/);
  assert.match(src, /--confirm-send needs --expect-count=N/);
  assert.ok(src.indexOf("if (!CHECK_DB) {") < src.indexOf('await import("../../src/db")'));
  assert.ok(src.indexOf("if (!CONFIRM) {") < src.indexOf('await import("../../src/lib/email")'));
  assert.ok(src.indexOf("plan.send.length !== EXPECT") < src.indexOf("runBroadcast(toSend"));
  assert.doesNotMatch(src.slice(0, src.indexOf("async function main")), /^import .*src\/db/m);
  assert.doesNotMatch(src, /^import .*client-sesv2/m);
  const seed = readFileSync("scripts/newsletter-issue01/seed-newsletter-issue01.ts", "utf8");
  assert.match(seed, /RE-RUN GUARD/);
  assert.ok(seed.indexOf("RE-RUN GUARD") < seed.indexOf("await sendNewsletterAndLog("));
});

test(".env.example documents SES_CONFIGURATION_SET commented out (not set by default)", () => {
  const env = readFileSync(".env.example", "utf8");
  assert.match(env, /^# SES_CONFIGURATION_SET=marketing-newsletter$/m);
  assert.doesNotMatch(env, /^SES_CONFIGURATION_SET=/m);
});
