import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeAdAttribution,
  sanitizeSignupSourcePage,
  sanitizeSignupMethod,
  signupAttributionColumns,
} from "../src/lib/adAttribution";

test("keeps only whitelisted string keys, capped at 255", () => {
  assert.deepEqual(
    sanitizeAdAttribution({ gclid: " C1 ", utm_campaign: "ThemeA", bad: "x", utm_term: "t".repeat(300) }),
    { gclid: "C1", utm_campaign: "ThemeA", utm_term: "t".repeat(255) },
  );
});
test("null for absent, junk or timestamp-only payloads", () => {
  assert.equal(sanitizeAdAttribution(undefined), null);
  assert.equal(sanitizeAdAttribution("gclid=x"), null);
  assert.equal(sanitizeAdAttribution([1]), null);
  assert.equal(sanitizeAdAttribution({ gclid: 1 }), null);
  assert.equal(sanitizeAdAttribution({ captured_at: "2026-10-31T12:00:00Z", landing_url: "https://x" }), null);
});
test("source page must be a bare site path", () => {
  assert.equal(sanitizeSignupSourcePage("/hosted-pbx-branded-softphones-googleads"), "/hosted-pbx-branded-softphones-googleads");
  assert.equal(sanitizeSignupSourcePage("https://evil.example/x"), null);
  assert.equal(sanitizeSignupSourcePage("/x?gclid=1"), null);
  assert.equal(sanitizeSignupSourcePage("/" + "a".repeat(300)), null);
  assert.equal(sanitizeSignupSourcePage(5), null);
});
test("signup method is whitelisted", () => {
  assert.equal(sanitizeSignupMethod("website_inline"), "website_inline");
  assert.equal(sanitizeSignupMethod("google"), "google");
  assert.equal(sanitizeSignupMethod("admin"), null);
});
test("columns only include fields that are present (older payloads set nothing)", () => {
  assert.deepEqual(signupAttributionColumns({ email: "a@b.c" }), {});
  assert.deepEqual(
    signupAttributionColumns({
      signup_source_page: "/simplify-softphone-deployment-googleads",
      signup_method: "website_inline",
      ad_attribution: { gclid: "G" },
    }),
    {
      adAttribution: { gclid: "G" },
      signupSourcePage: "/simplify-softphone-deployment-googleads",
      signupMethod: "website_inline",
    },
  );
});
