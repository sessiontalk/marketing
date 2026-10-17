import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  listUnsubscribeHeaders, publicBaseUrl, publicUnsubscribeUrl, handleUnsubscribe, isValidUnsubscribeToken,
  DEFAULT_PUBLIC_BASE_URL, type UnsubscribeStore,
} from "../src/lib/unsubscribe";
import { buildSendEmailInput, NURTURE_REPLY_TO } from "../src/lib/email";
import { buildTestSequence, buildTestSend, parseRecipients, parseSteps, MAX_TEST_RECIPIENTS, TEST_UNSUBSCRIBE_TOKEN } from "../src/lib/trialNurture/testSequence";
import { NURTURE_COPY } from "../src/lib/trialNurture/copy";
import { generateUnsubscribeToken } from "../src/lib/tokens";

const TOKEN = "a".repeat(64);

// ─── List-Unsubscribe headers ───────────────────────────────────────

test("listUnsubscribeHeaders: https URL + mailto, and RFC 8058 one-click Post header", () => {
  const h = listUnsubscribeHeaders(`https://marketing.sessiontalk.co.uk/api/unsubscribe?token=${TOKEN}`, "maryam@sessiontalk.co.uk");
  assert.equal(h["List-Unsubscribe"], `<https://marketing.sessiontalk.co.uk/api/unsubscribe?token=${TOKEN}>, <mailto:maryam@sessiontalk.co.uk?subject=unsubscribe>`);
  assert.equal(h["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.throws(() => listUnsubscribeHeaders("http://x.com/u", "a@b.com"));
  assert.throws(() => listUnsubscribeHeaders("https://x.com/u\r\nBcc: a@b.com", "a@b.com"));
  assert.throws(() => listUnsubscribeHeaders("https://x.com/u", "not-an-email"));
});

test("publicBaseUrl: https env only, never localhost/http; falls back to production host", () => {
  assert.equal(publicBaseUrl({}), DEFAULT_PUBLIC_BASE_URL);
  assert.equal(publicBaseUrl({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" }), DEFAULT_PUBLIC_BASE_URL);
  assert.equal(publicBaseUrl({ NEXT_PUBLIC_APP_URL: "https://crm.example.com/" }), "https://crm.example.com");
  assert.equal(publicUnsubscribeUrl(TOKEN, {}), `https://marketing.sessiontalk.co.uk/api/unsubscribe?token=${TOKEN}`);
});

test("generated tokens match the format the unsubscribe handler accepts", () => {
  assert.ok(isValidUnsubscribeToken(generateUnsubscribeToken()));
  assert.ok(!isValidUnsubscribeToken("test-send-no-token"));
});

// ─── email.ts ───────────────────────────────────────────────────────

test("buildSendEmailInput puts headers in Content.Simple.Headers and adds no SES list management", () => {
  const headers = listUnsubscribeHeaders(publicUnsubscribeUrl(TOKEN, {}), NURTURE_REPLY_TO);
  const input = buildSendEmailInput({ to: "x@example.com", subject: "s", text: "t", headers });
  assert.deepEqual(input.Content?.Simple?.Headers, [
    { Name: "List-Unsubscribe", Value: headers["List-Unsubscribe"] },
    { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
  ]);
  assert.equal(input.ListManagementOptions, undefined);
  assert.deepEqual(input.Content?.Simple?.Body, { Text: { Data: "t" } });
  assert.equal(input.Destination?.BccAddresses, undefined);
});

test("buildSendEmailInput: no headers key when none given; rejects CRLF and header + unsubscribeUrl together", () => {
  assert.equal(buildSendEmailInput({ to: "x@example.com", subject: "s", text: "t" }).Content?.Simple?.Headers, undefined);
  assert.throws(() => buildSendEmailInput({ to: "x@example.com", subject: "s", text: "t", headers: { "X-A": "a\r\nBcc: e@x.com" } }));
  assert.throws(() => buildSendEmailInput({ to: "x@example.com", subject: "s", text: "t", headers: { "Bad Name": "a" } }));
  assert.throws(() => buildSendEmailInput({ to: "x@example.com", subject: "s", html: "h", unsubscribeUrl: "https://u",
    headers: { "List-Unsubscribe": "<https://u>" } }));
  // Existing sequences path unchanged: unsubscribeUrl -> SES list management.
  assert.ok(buildSendEmailInput({ to: "x@example.com", subject: "s", html: "h", unsubscribeUrl: "https://u" }).ListManagementOptions);
});

// ─── /api/unsubscribe handler ───────────────────────────────────────

function fakeStore(known: string[]) {
  const calls = { exists: 0, unsubscribed: [] as string[] };
  const store: UnsubscribeStore = {
    async tokenExists(t) { calls.exists++; return known.includes(t); },
    async unsubscribe(t) { if (!known.includes(t)) return false; calls.unsubscribed.push(t); return true; },
  };
  return { store, calls };
}

test("GET shows a confirm page with a POST form and never unsubscribes", async () => {
  const { store, calls } = fakeStore([TOKEN]);
  const r = await handleUnsubscribe("GET", TOKEN, store);
  assert.equal(r.status, 200);
  assert.match(r.html, /<form method="POST" action="\/api\/unsubscribe\?token=a{64}">/);
  assert.deepEqual(calls.unsubscribed, []);
});

test("POST (confirm button / RFC 8058 one-click) unsubscribes", async () => {
  const { store, calls } = fakeStore([TOKEN]);
  const r = await handleUnsubscribe("POST", TOKEN, store);
  assert.equal(r.status, 200);
  assert.match(r.html, /You've been unsubscribed/);
  assert.deepEqual(calls.unsubscribed, [TOKEN]);
});

test("missing / malformed / unknown tokens: 400/404 with no DB access for malformed", async () => {
  const { store, calls } = fakeStore([TOKEN]);
  assert.equal((await handleUnsubscribe("GET", null, store)).status, 400);
  assert.equal((await handleUnsubscribe("POST", "", store)).status, 400);
  for (const bad of [TEST_UNSUBSCRIBE_TOKEN, "<script>", "A".repeat(64)]) {
    assert.equal((await handleUnsubscribe("GET", bad, store)).status, 404);
    assert.equal((await handleUnsubscribe("POST", bad, store)).status, 404);
  }
  assert.equal(calls.exists, 0);
  assert.equal((await handleUnsubscribe("GET", "b".repeat(64), store)).status, 404);
  assert.equal((await handleUnsubscribe("POST", "b".repeat(64), store)).status, 404);
  assert.deepEqual(calls.unsubscribed, []);
});

test("unsubscribe route: GET delegates read-only, POST reads ?token= (one-click) or form token", () => {
  const src = readFileSync("src/app/api/unsubscribe/route.ts", "utf8");
  assert.match(src, /export async function GET[\s\S]*handleUnsubscribe\("GET"/);
  assert.match(src, /export async function POST[\s\S]*searchParams\.get\("token"\)[\s\S]*formData\(\)[\s\S]*handleUnsubscribe\("POST"/);
  // State changes only live in store.unsubscribe, which only the POST path reaches.
  const getBody = src.slice(src.indexOf("export async function GET"), src.indexOf("export async function POST"));
  assert.doesNotMatch(getBody, /update\(/);
});

// ─── Nurture worker ─────────────────────────────────────────────────

test("nurture worker creates one unsubscribe token per send and passes List-Unsubscribe headers", () => {
  const src = readFileSync("src/app/api/worker/trial-nurture/route.ts", "utf8");
  const sendIdx = src.indexOf("await sendEmail(");
  const tokIdx = src.indexOf("generateUnsubscribeToken()");
  const insIdx = src.indexOf("db.insert(unsubscribeTokens)");
  assert.ok(tokIdx > 0 && insIdx > tokIdx && sendIdx > insIdx, "token generated and stored before send");
  assert.match(src, /listUnsubscribeHeaders\(publicUnsubscribeUrl\(unsubToken\), NURTURE_REPLY_TO\)/);
  assert.match(src.slice(sendIdx, sendIdx + 300), /headers/);
  // Token insert is inside the try, after the step claim: a failure marks the step failed, never double-sends.
  assert.ok(insIdx > src.indexOf("const claimed"));
  assert.ok(insIdx > src.indexOf("try {"));
});

// ─── Admin test-send ────────────────────────────────────────────────

test("parseRecipients: list, dedupe, max 10, rejects bad entries", () => {
  assert.deepEqual(parseRecipients("a@b.com"), ["a@b.com"]);
  assert.deepEqual(parseRecipients("a@b.com, c@d.com;\ne@f.com A@B.com"), ["a@b.com", "c@d.com", "e@f.com"]);
  assert.deepEqual(parseRecipients(["a@b.com", " c@d.com "]), ["a@b.com", "c@d.com"]);
  assert.throws(() => parseRecipients(""));
  assert.throws(() => parseRecipients([]));
  assert.throws(() => parseRecipients("a@b.com, nope"));
  const many = Array.from({ length: MAX_TEST_RECIPIENTS + 1 }, (_, i) => `u${i}@example.com`);
  assert.throws(() => parseRecipients(many));
  assert.equal(parseRecipients(many.slice(0, MAX_TEST_RECIPIENTS)).length, MAX_TEST_RECIPIENTS);
});

test("parseSteps: default all, subset sorted/deduped, rejects out of range", () => {
  assert.deepEqual(parseSteps(undefined), [1, 2, 3, 4, 5]);
  assert.deepEqual(parseSteps([]), [1, 2, 3, 4, 5]);
  assert.deepEqual(parseSteps([1]), [1]);
  assert.deepEqual(parseSteps(["3", 1, 3]), [1, 3]);
  for (const bad of [[0], [6], ["x"], [1.5]]) assert.throws(() => parseSteps(bad as any));
  assert.throws(() => parseSteps("1" as any));
});

test("test-send email 01 only, multiple addresses, production subject toggle", () => {
  const input = { to: ["seed1@example.com", "test-abc@srv1.mail-tester.com"], sipDomain: "acme.asia.sip.sessiontalk.io", steps: [1] };
  const t = buildTestSend(input, NURTURE_REPLY_TO);
  assert.deepEqual(t.recipients, ["seed1@example.com", "test-abc@srv1.mail-tester.com"]);
  assert.equal(t.steps.length, 1);
  assert.equal(t.steps[0].step, 1);
  assert.equal(t.steps[0].subject, `[TEST 1/5] ${NURTURE_COPY[0].subject}`);
  assert.match(t.steps[0].text, /https:\/\/acme\.asia\.sip\.sessiontalk\.io\/admin\/team/);
  assert.equal(t.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.match(t.headers["List-Unsubscribe"], /^<https:\/\/[^>]+\/api\/unsubscribe\?token=test-send-no-token>, <mailto:maryam@sessiontalk\.co\.uk\?subject=unsubscribe>$/);
  const prod = buildTestSequence({ ...input, productionSubject: true });
  assert.equal(prod[0].subject, NURTURE_COPY[0].subject);
});

test("admin test-send route: no DB import, no BCC, sends headers, loops recipients x steps", () => {
  const src = readFileSync("src/app/api/admin/test-sequence/route.ts", "utf8");
  assert.doesNotMatch(src, /@\/db|drizzle|unsubscribeTokens|insert\(/);
  assert.doesNotMatch(src, /bcc\s*:/i);
  assert.match(src, /headers: plan\.headers/);
  assert.match(src, /for \(const to of plan\.recipients\)[\s\S]*for \(const s of plan\.steps\)/);
  assert.match(src, /productionSubject: body\?\.productionSubject === true/);
});
