import { test } from "node:test";
import assert from "node:assert/strict";
import { VERSIONS, BANNED } from "../scripts/newsletter-issue01/issue01";

// 26 Oct 2026: B is a plain news update (no come-back wording), so all three variants share one subject.
test("issue #1: A1, A2alt and B all use the plain news subject", () => {
  assert.deepEqual(VERSIONS.map((v) => v.key), ["A1", "A2alt", "B"]);
  for (const v of VERSIONS) {
    assert.equal(v.subject, "Dark mode is here, plus a few other new things", v.key);
    assert.doesNotMatch(v.subject, /since you left|come back|welcome back/i, v.key);
    assert.doesNotMatch(v.subject, BANNED, v.key);
  }
});