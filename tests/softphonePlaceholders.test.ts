import { test } from "node:test";
import assert from "node:assert/strict";
import { render, renderSubject } from "../src/lib/trialNurture/schedule";
import { missingLinkFields, UNFILLED_PLACEHOLDER_RE, formatTrialEndsDate } from "../src/lib/trialNurture/links";
import { GENERIC_SOFTPHONE_COPY, HOSTED_PBX_COPY } from "../src/lib/trialNurture/copyHostedGeneric";
import { NURTURE_COPY } from "../src/lib/trialNurture/copy";
import { buildTestSequence } from "../src/lib/trialNurture/testSequence";

const ends = new Date("2026-11-05T12:00:00Z");
test("generic softphone: all 5 steps fill every token incl. subject", () => {
  for (const c of GENERIC_SOFTPHONE_COPY) {
    const f = { accountName: "acme", trialEndsAt: ends, product: "generic_softphone", step: c.step };
    const text = render(c.body, "Sam", f), subj = renderSubject(c.subject, "Sam", f);
    assert.ok(!UNFILLED_PLACEHOLDER_RE.test(text), `step ${c.step} body`);
    assert.ok(!UNFILLED_PLACEHOLDER_RE.test(subj), `step ${c.step} subject`);
  }
  assert.equal(formatTrialEndsDate(ends), "5 November 2026");
  const s1 = render(GENERIC_SOFTPHONE_COPY[0].body, "Sam", { product: "generic_softphone", step: 1 });
  assert.match(s1, /https:\/\/cloud\.sessiontalk\.io\n/);
  assert.match(s1, /sessioncloud\/creating-first-app/);
  assert.match(s1, /sessioncloud\/provisioning/);
  assert.ok(GENERIC_SOFTPHONE_COPY.every((c) => c.final && !!c.html), "softphone final=true, html present");
  assert.ok(GENERIC_SOFTPHONE_COPY.every((c) => !/provider_directory_url|\{docs_url\}|voip-providers/.test(c.body + (c.html || ""))));
});
test("step 5 without trialEndsAt holds and leaves raw token", () => {
  const c = GENERIC_SOFTPHONE_COPY.find((x) => x.step === 5)!;
  assert.deepEqual(missingLinkFields(5, { accountName: "acme" }, "generic_softphone"), ["trial_ends_date"]);
  assert.deepEqual(missingLinkFields(5, {}, "generic_softphone"), ["accountName", "trial_ends_date"]);
  assert.ok(UNFILLED_PLACEHOLDER_RE.test(renderSubject(c.subject, "Sam", { product: "generic_softphone", step: 5 })));
});
test("hosted/teams unchanged", () => {
  assert.deepEqual(missingLinkFields(5, { accountName: "a" }, "hosted_pbx"), []);
  assert.deepEqual(missingLinkFields(1, { sipDomain: "x.us.sip.sessiontalk.io" }, "teams_phone"), []);
  assert.ok(HOSTED_PBX_COPY.every((c) => !c.final));
  const t = NURTURE_COPY[0];
  assert.equal(render(t.body, "Sam", { sipDomain: "x.us.sip.sessiontalk.io", accountName: "x", product: "teams_phone", step: 1 }),
               render(t.body, "Sam", { sipDomain: "x.us.sip.sessiontalk.io", accountName: "x" }));
});
test("test-sequence softphone sample passes", () => {
  const out = buildTestSequence({ to: "a@b.co", sipDomain: "acme.us.sip.sessiontalk.io", sequence: "generic_softphone", trialEndsAt: ends });
  assert.equal(out.length, 5);
  assert.equal(out[4].subject, "[TEST 5/5] Your softphone trial ends on 5 November 2026");
});
