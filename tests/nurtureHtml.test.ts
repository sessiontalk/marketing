import { test } from "node:test";
import assert from "node:assert/strict";
import { renderNurtureHtml, htmlHasUnfilledPlaceholder, textToHtml } from "../src/lib/trialNurture/htmlTemplate";
import { buildTestSequence } from "../src/lib/trialNurture/testSequence";

test("html wraps text: escaped, paragraphs, autolinks, unsubscribe link", () => {
  const html = renderNurtureHtml({ textBody: "Hi <Bob> & co,\n\nSee https://cloud.sessiontalk.io/x.\n\nMaryam", unsubscribeUrl: "https://ex.test/u?t=a&b=1" });
  assert.match(html, /Hi &lt;Bob&gt; &amp; co,/);
  assert.ok(!html.includes("<Bob>"));
  assert.match(html, /<a href="https:\/\/cloud\.sessiontalk\.io\/x"/);
  assert.match(html, /href="https:\/\/ex\.test\/u\?t=a&amp;b=1"[^>]*>Unsubscribe/);
  assert.equal((textToHtml("a\n\nb").match(/<p /g) || []).length, 2);
  assert.equal(htmlHasUnfilledPlaceholder(html), false);
  assert.equal(htmlHasUnfilledPlaceholder(renderNurtureHtml({ textBody: "x {docs_url}", unsubscribeUrl: "https://u" })), true);
});

test("HoM htmlBody seam: unsubscribe token substituted", () => {
  const html = renderNurtureHtml({ textBody: "t", htmlBody: "<p>Hi</p><a href=\"{{unsubscribe_url}}\">u</a>", unsubscribeUrl: "https://u.test/1" });
  assert.match(html, /href="https:\/\/u\.test\/1"/);
  assert.equal(htmlHasUnfilledPlaceholder(html), false);
});

test("test sequence produces both text and html (Teams)", () => {
  const steps = buildTestSequence({ to: "a@b.co", sipDomain: "acme.uk.sip.sessiontalk.io" });
  assert.equal(steps.length, 5);
  for (const s of steps) { assert.ok(s.text.length > 0); assert.match(s.html, /SessionTalk/); assert.match(s.html, /Unsubscribe/); }
});
