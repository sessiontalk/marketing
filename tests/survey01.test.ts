import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SURVEY_CAMPAIGN, surveyClaimKey, templatePlaceholderProblems, formUrlProblems, surveyLink, renderSurvey, safeFirstName,
  reputationGate, batchStopRule, bouncesToTrip, chunk, DEFAULT_MAX_BOUNCE_RATE, DEFAULT_MAX_COMPLAINT_RATE,
} from "../src/lib/survey01";
import { buildNewsletterMessage } from "../src/lib/newsletter";
import { buildSendEmailInput } from "../src/lib/email";
import { planBroadcast, runBroadcast } from "../src/lib/newsletterBroadcast";

const gate = { maxBounce: DEFAULT_MAX_BOUNCE_RATE, maxComplaint: DEFAULT_MAX_COMPLAINT_RATE };

test("claim key is per campaign survey-01 and distinct from the newsletter key", () => {
  assert.equal(SURVEY_CAMPAIGN, "survey-01");
  assert.equal(surveyClaimKey("abc"), "survey:survey-01:abc");
});

test("placeholder gate: TODO / PLACEHOLDER / FORMID / FRFORM / example URLs refuse", () => {
  for (const s of ["<a href=\"https://tally.so/r/FORMID\">", "TODO link", "PLACEHOLDER", "https://tally.so/r/FRFORM", "https://example.com/x"])
    assert.equal(templatePlaceholderProblems("t", s).length, 1, s);
  assert.deepEqual(templatePlaceholderProblems("t", '<a href="{{survey_url}}">x</a> {{feature_request_url}} {{unsubscribe_url}}'), []);
});

test("form URLs must be real https://tally.so/r/<id> links", () => {
  assert.deepEqual(formUrlProblems("s", "https://tally.so/r/w7Lk2Q"), []);
  for (const u of [undefined, "", "https://tally.so/r/FORMID", "https://tally.so/r/FRFORM", "http://tally.so/r/w7Lk2Q", "https://example.com/r/abc", "https://tally.so/r/w7Lk2Q?x=1", "{{survey_url}}", "https://tally.so/r/TODO"])
    assert.ok(formUrlProblems("s", u as any).length > 0, String(u));
});

test("surveyLink adds hidden fields seg and v, never the unsubscribe token", () => {
  const u = new URL(surveyLink("https://tally.so/r/w7Lk2Q", { seg: "generic softphone" }));
  assert.equal(u.searchParams.get("seg"), "generic_softphone");
  assert.equal(u.searchParams.get("v"), "s01");
  assert.equal(u.searchParams.get("t"), null);
});

test("renderSurvey fills name/links, escapes HTML, keeps {{unsubscribe_url}}, fails on unknown placeholders", () => {
  const tpl = 'Hi {{first_name|there}}, <a href="{{survey_url}}">s</a> <a href="{{feature_request_url}}">f</a> <a href="{{unsubscribe_url}}">u</a>';
  const out = renderSurvey(tpl, { firstName: "A<b>", surveyUrl: "https://tally.so/r/aaaa?seg=x&v=s01", featureUrl: "https://tally.so/r/bbbb" }, true);
  assert.match(out, /Hi A&lt;b&gt;,/);
  assert.match(out, /seg=x&amp;v=s01/);
  assert.match(out, /\{\{unsubscribe_url\}\}/);
  assert.match(renderSurvey(tpl, { surveyUrl: "https://tally.so/r/aaaa", featureUrl: "https://tally.so/r/bbbb" }, false), /^Hi there,/);
  assert.throws(() => renderSurvey(tpl + " {{company}}", { surveyUrl: "https://tally.so/r/aaaa", featureUrl: "https://tally.so/r/bbbb" }, false), /unfilled/);
});

test("safeFirstName drops emails, junk and long values", () => {
  assert.equal(safeFirstName(" Sam  Jones "), "Sam");
  for (const v of [undefined, "", "a@b.co", "x".repeat(41), "{{x}}", "12345"]) assert.equal(safeFirstName(v as any), undefined);
});

test("reputation gate refuses at/above thresholds and when unreadable", () => {
  assert.deepEqual(reputationGate({ bounce: 0.0445, complaint: 0.0003 }, gate), []);
  assert.equal(reputationGate({ bounce: 0.045, complaint: 0.0003 }, gate).length, 1);
  assert.equal(reputationGate({ bounce: 0.01, complaint: 0.0008 }, gate).length, 1);
  assert.equal(reputationGate({ bounce: null, complaint: null }, gate).length, 2);
  assert.equal(reputationGate({ bounce: 0.0445, complaint: 0 }, { maxBounce: 0.044, maxComplaint: 0.0008 }).length, 1, "configurable");
});

test("batch stop rule: any complaint or 2+ hard bounces pauses", () => {
  assert.equal(batchStopRule({ hardBounces: 1, complaints: 0 }), null);
  assert.ok(batchStopRule({ hardBounces: 2, complaints: 0 }));
  assert.ok(batchStopRule({ hardBounces: 0, complaints: 1 }));
});

test("bouncesToTrip: headroom from 4.45% to 4.5% for 54 sends", () => {
  assert.equal(bouncesToTrip(0.0445, 1207, 54, 0.045), 4);
  assert.equal(bouncesToTrip(0.0445, 0, 54, 0.045), 3);
  assert.equal(bouncesToTrip(0.05, 100, 10, 0.045), 0);
});

test("chunk splits in order", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("survey message keeps From/Reply-To support@, List-Unsubscribe and SES config set + survey tags", () => {
  const html = renderSurvey('<a href="{{survey_url}}">s</a> <a href="{{feature_request_url}}">f</a> <a href="{{unsubscribe_url}}">u</a>', { surveyUrl: "https://tally.so/r/aaaa", featureUrl: "https://tally.so/r/bbbb" }, true);
  const m = buildNewsletterMessage({ to: "x@example.com", subject: "What should we build next?", html, text: "u {{unsubscribe_url}}", token: "a".repeat(64),
    tracking: { contactId: "c1", campaign: "survey-01", variant: "S01" }, env: { SES_CONFIGURATION_SET: "marketing-newsletter", NEXT_PUBLIC_APP_URL: "https://crm.example" } });
  assert.equal(m.from, "SessionTalk <support@sessiontalk.co.uk>");
  assert.equal(m.replyTo, "support@sessiontalk.co.uk");
  assert.ok(Object.keys(m.headers || {}).some((k) => /^list-unsubscribe$/i.test(k)));
  const input = buildSendEmailInput(m);
  assert.equal(input.ConfigurationSetName, "marketing-newsletter");
  assert.deepEqual(input.EmailTags?.map((t) => t.Value), ["c1", "survey-01", "S01"]);
});

test("plan + run: unsubscribed / suppressed / already-claimed are skipped; claim once per recipient", async () => {
  const rows = ["a@x.co", "b@x.co", "c@x.co", "d@x.co"].map((email) => ({ email, variant: "S01" }));
  const plan = planBroadcast({ rows, alreadySentContactIds: new Set(["id-c"]), sesSuppressed: new Set(["d@x.co"]),
    contactsByEmail: new Map([["a@x.co", { id: "id-a", email: "a@x.co", source: null, unsubscribed: false }], ["b@x.co", { id: "id-b", email: "b@x.co", source: null, unsubscribed: true }], ["c@x.co", { id: "id-c", email: "c@x.co", source: null, unsubscribed: false }]]) });
  assert.equal(plan.send.length, 1);
  assert.equal(plan.excluded.unsubscribed, 1); assert.equal(plan.excluded.ses_suppressed, 1); assert.equal(plan.excluded.already_sent, 1);
  const claims = new Set<string>(); let sends = 0;
  const deps = { assertSendable: async () => {}, ensureContact: async () => "new", claim: async (c: string, id: string) => { const k = surveyClaimKey(id); if (claims.has(k)) return false; claims.add(k); return true; },
    sendOne: async () => { sends++; return { id: "m" }; }, recordFailure: async () => {}, sleep: async () => {}, log: () => {} };
  await runBroadcast(plan.send, deps, { campaign: "survey-01", ratePerSecond: 10, maxFailureRate: 0.02 });
  const again = await runBroadcast(plan.send, deps, { campaign: "survey-01", ratePerSecond: 10, maxFailureRate: 0.02 });
  assert.equal(sends, 1); assert.equal(again.skipped, 1);
});

test("surveyLink keeps existing params, appends seg/v, never t", () => {
  const u = new URL(surveyLink("https://tally.so/r/w7Lk2Q?src=invite-s01&t=x", { seg: "paying generic" }));
  assert.equal(u.searchParams.get("src"), "invite-s01");
  assert.equal(u.searchParams.get("seg"), "paying_generic");
  assert.equal(u.searchParams.get("v"), "s01");
  assert.equal(u.searchParams.get("t"), null);
});

test("pack-style template renders with seg/v links and no leftover placeholders", () => {
  const tpl = '<p>Hi {{first_name|there}}</p><a href="{{survey_url}}">S</a><a href="{{feature_request_url}}">F</a><a href="{{unsubscribe_url}}">U</a>';
  const out = renderSurvey(tpl, { firstName: undefined, surveyUrl: surveyLink("https://tally.so/r/w7Lk2Q", { seg: "a" }), featureUrl: surveyLink("https://tally.so/r/m3Pq9Z", { seg: "a" }) }, true);
  assert.match(out, /seg=a&amp;v=s01/);
  assert.doesNotMatch(out, /[?&](amp;)?t=/);
  assert.deepEqual(out.match(/\{\{[^}]*\}\}/g), ["{{unsubscribe_url}}"]);
  assert.throws(() => renderSurvey(tpl + "{{t}}", { surveyUrl: "https://tally.so/r/w7Lk2Q", featureUrl: "https://tally.so/r/m3Pq9Z" }, true));
});
