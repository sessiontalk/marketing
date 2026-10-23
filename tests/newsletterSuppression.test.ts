import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleUnsubscribe, makeUnsubscribeStore, postToken } from "../src/lib/unsubscribe";
import { partitionSendable, assertSendable, normalizeEmail, type SuppressionStore } from "../src/lib/suppression";
import { buildNewsletterMessage } from "../src/lib/newsletter";
import { buildSendEmailInput, LIST_UNSUBSCRIBE_MAILTO, NEWSLETTER_FROM_EMAIL, NEWSLETTER_REPLY_TO } from "../src/lib/email";
import { generateUnsubscribeToken } from "../src/lib/tokens";

const TOKEN = "c".repeat(64);

/** In-memory suppression store standing in for contacts.unsubscribed (matched on lower(email)). */
function memStore(initial: string[] = []) {
  const set = new Set(initial.map(normalizeEmail));
  const writes: Array<{ email: string; source: string }> = [];
  const store: SuppressionStore = {
    async suppressed(emails) { return new Set(emails.map(normalizeEmail).filter((e) => set.has(e))); },
    async suppress(email, source) { const n = normalizeEmail(email); const created = !set.has(n); set.add(n); writes.push({ email: n, source }); return { created }; },
  };
  return { store, set, writes };
}

function unsubStore(tokens: Record<string, string>, supp = memStore()) {
  let reads = 0;
  const store = makeUnsubscribeStore({
    async emailForToken(t) { reads++; return tokens[t] ?? null; },
    suppression: supp.store,
  });
  return { store, supp, reads: () => reads };
}

// ─── mailto ─────────────────────────────────────────────────────────

test("List-Unsubscribe mailto is support@, never maryam@ (nurture, test-send, newsletter)", () => {
  assert.equal(LIST_UNSUBSCRIBE_MAILTO, "support@sessiontalk.co.uk");
  for (const f of ["src/app/api/worker/trial-nurture/route.ts", "src/app/api/admin/test-sequence/route.ts"]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /LIST_UNSUBSCRIBE_MAILTO/);
    assert.doesNotMatch(src, /listUnsubscribeHeaders\([^)]*\), NURTURE_REPLY_TO\)/);
    assert.doesNotMatch(src, /\}, NURTURE_REPLY_TO\);/);
  }
});

// ─── /api/unsubscribe → suppression ────────────────────────────────

test("GET never changes state (shows confirm form that POSTs)", async () => {
  const { store, supp } = unsubStore({ [TOKEN]: "Person@Example.com" });
  const r = await handleUnsubscribe("GET", TOKEN, store);
  assert.equal(r.status, 200);
  assert.match(r.html, /<form method="POST" action="\/api\/unsubscribe\?token=c{64}">/);
  assert.equal(supp.writes.length, 0);
  assert.equal(supp.set.size, 0);
});

test("POST from the confirm button (form token) writes the suppression for the token's email", async () => {
  const { store, supp } = unsubStore({ [TOKEN]: "Person@Example.com" });
  const form = new URLSearchParams({ token: TOKEN });
  const r = await handleUnsubscribe("POST", postToken(null, form), store);
  assert.equal(r.status, 200);
  assert.deepEqual(supp.writes, [{ email: "person@example.com", source: "unsubscribe_link" }]);
});

test("RFC 8058 one-click (POST List-Unsubscribe=One-Click, token in query) writes the suppression", async () => {
  const { store, supp } = unsubStore({ [TOKEN]: "person@example.com" });
  const oneClickBody = new URLSearchParams("List-Unsubscribe=One-Click");
  const r = await handleUnsubscribe("POST", postToken(TOKEN, oneClickBody), store);
  assert.equal(r.status, 200);
  assert.deepEqual(supp.writes.map((w) => w.email), ["person@example.com"]);
  // and the suppression then blocks future sends
  await assert.rejects(assertSendable("PERSON@example.com", supp.store), /suppressed/);
});

test("token validation: missing/malformed tokens never reach the DB; unknown tokens write nothing", async () => {
  const { store, supp, reads } = unsubStore({ [TOKEN]: "person@example.com" });
  assert.equal((await handleUnsubscribe("POST", postToken(null, new URLSearchParams("List-Unsubscribe=One-Click")), store)).status, 400);
  for (const bad of ["x", "C".repeat(64), "c".repeat(63), "c".repeat(65), "../" + "c".repeat(61)]) {
    assert.equal((await handleUnsubscribe("POST", bad, store)).status, 404);
    assert.equal((await handleUnsubscribe("GET", bad, store)).status, 404);
  }
  assert.equal(reads(), 0);
  assert.equal((await handleUnsubscribe("POST", "d".repeat(64), store)).status, 404);
  assert.equal(supp.writes.length, 0);
});

test("unsubscribe route records via the suppression store and GET has no write path", () => {
  const src = readFileSync("src/app/api/unsubscribe/route.ts", "utf8");
  assert.match(src, /makeUnsubscribeStore\(/);
  assert.match(src, /suppression: dbSuppressionStore/);
  const getBody = src.slice(src.indexOf("export async function GET"), src.indexOf("export async function POST"));
  assert.doesNotMatch(getBody, /update\(|insert\(|suppress\(/);
});

// ─── send-path checks ───────────────────────────────────────────────

test("partitionSendable: case-insensitive, de-duplicated, drops invalid, removes suppressed", async () => {
  const { store } = memStore(["Gone@Example.com"]);
  const r = await partitionSendable(["a@example.com", "A@Example.com ", "gone@example.com", "not-an-email"], store);
  assert.deepEqual(r.sendable, ["a@example.com"]);
  assert.deepEqual(r.suppressed, ["gone@example.com"]);
  assert.deepEqual(r.invalid, ["not-an-email"]);
});

test("every automated sender checks the suppression before sending", () => {
  const seq = readFileSync("src/app/api/worker/sequences/route.ts", "utf8");
  assert.ok(seq.indexOf("if (contact.unsubscribed)") > 0 && seq.indexOf("if (contact.unsubscribed)") < seq.indexOf("await sendEmail("));
  const nurture = readFileSync("src/app/api/worker/trial-nurture/route.ts", "utf8");
  assert.match(nurture, /unsubscribed: !!c\.unsubscribed/);
  const sched = readFileSync("src/lib/trialNurture/schedule.ts", "utf8");
  assert.match(sched, /if \(s\.unsubscribed\) return \{ action: "stop"/);
  const seed = readFileSync("scripts/newsletter-issue01/seed-newsletter-issue01.ts", "utf8");
  assert.ok(seed.indexOf("assertSendable(SEED_TO") > 0 && seed.indexOf("assertSendable(SEED_TO") < seed.indexOf("await sendEmail("));
});

// ─── newsletter message ─────────────────────────────────────────────

test("buildNewsletterMessage: support@ sender, per-send https one-click + mailto support@, placeholders filled", () => {
  const token = generateUnsubscribeToken();
  const m = buildNewsletterMessage({ to: "x@example.com", subject: "s", html: "<a href=\"{{unsubscribe_url}}\">u</a>", text: "u: {{unsubscribe_url}}", token, env: {} });
  const url = `https://marketing.sessiontalk.co.uk/api/unsubscribe?token=${token}`;
  assert.equal(m.from, NEWSLETTER_FROM_EMAIL);
  assert.equal(m.from, "SessionTalk <support@sessiontalk.co.uk>");
  assert.equal(m.replyTo, NEWSLETTER_REPLY_TO);
  assert.equal(m.headers!["List-Unsubscribe"], `<${url}>, <mailto:support@sessiontalk.co.uk?subject=unsubscribe>`);
  assert.equal(m.headers!["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.equal(m.html, `<a href="${url}">u</a>`);
  assert.equal(m.text, `u: ${url}`);
  const input = buildSendEmailInput(m);
  assert.equal(input.FromEmailAddress, "SessionTalk <support@sessiontalk.co.uk>");
  assert.equal(input.ListManagementOptions, undefined);
});

test("buildNewsletterMessage rejects bad tokens and templates without an unsubscribe link", () => {
  const ok = { to: "x@example.com", subject: "s", html: "{{unsubscribe_url}}", text: "{{unsubscribe_url}}", env: {} };
  assert.throws(() => buildNewsletterMessage({ ...ok, token: "nope" }));
  assert.throws(() => buildNewsletterMessage({ ...ok, token: TOKEN, html: "no link" }));
  assert.throws(() => buildNewsletterMessage({ ...ok, token: TOKEN, text: "no link" }));
});

test("seed script: hard-coded to nauman@ only, dry run by default, sends only with --confirm-seed, no DB/SES import in dry run", () => {
  const src = readFileSync("scripts/newsletter-issue01/seed-newsletter-issue01.ts", "utf8");
  assert.match(src, /export const SEED_TO = "nauman@sessiontalk\.co\.uk";/);
  const addrs = new Set(src.match(/[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]+/gi) || []);
  assert.deepEqual([...addrs].sort(), ["nauman@sessiontalk.co.uk", "support@sessiontalk.co.uk"]); // support@ = From check only
  assert.match(src, /const CONFIRM = args\.includes\("--confirm-seed"\);/);
  const ret = src.indexOf("if (!CONFIRM) {");
  assert.ok(ret > 0 && ret < src.indexOf('await import("../../src/db")'));
  assert.doesNotMatch(src.slice(0, src.indexOf("async function main")), /^import .*src\/db/m);
  assert.doesNotMatch(src, /^import .*client-sesv2/m);
  assert.doesNotMatch(src, /to: (?!SEED_TO)/);
});

test("middleware public allowlist unchanged (dashboard stays authenticated)", () => {
  const src = readFileSync("src/middleware.ts", "utf8");
  const block = src.slice(src.indexOf("const PUBLIC_PREFIXES = ["), src.indexOf("];", src.indexOf("const PUBLIC_PREFIXES")));
  const prefixes = block.match(/"[^"]+"/g)!.map((x) => x.slice(1, -1));
  // Unchanged by this PR: public = events/worker/unsubscribe; login is the auth form; /api/crm/ checks an API key in-route.
  assert.deepEqual(prefixes, ["/api/events/", "/api/worker/", "/api/unsubscribe", "/api/auth/login", "/api/crm/"]);
});
