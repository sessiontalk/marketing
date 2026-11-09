import { test } from "node:test";
import assert from "node:assert/strict";
import { isExcludedEmail, isExcludedWorkspace, junkReason, looksRandom } from "../src/lib/trialNurture/exclusions";

const ok = { email: "luis.mendes@techbase.pt", firstname: "Luis", emailVerified: true };

test("NorthwindDemo excluded", () => {
  assert.equal(isExcludedEmail("Demo-Screens+20261104@sessiontalk.co.uk"), true);
  assert.equal(isExcludedWorkspace({ sipDomain: "northwind-demo.uk.sip.sessiontalk.io" }), true);
  assert.equal(isExcludedWorkspace({ accountName: "NorthwindDemo" }), true);
  assert.equal(isExcludedWorkspace({ appId: "nZ9fr84qDy" }), true);
});

test("junk filters", () => {
  assert.equal(junkReason({ accountName: "Techbase" }, ok), null);
  assert.equal(junkReason({ accountName: "ASPICON" }, ok), null);
  assert.equal(junkReason({ accountName: "Allegiance" }, ok), null);
  assert.equal(junkReason({ accountName: "Techbase" }, { ...ok, emailVerified: false }), "unverified_email");
  assert.equal(junkReason({ accountName: "Rome5871" }, ok), "abuse_cluster_workspace");
  assert.equal(junkReason({ accountName: "Romebumann48" }, ok), "abuse_cluster_workspace");
  assert.equal(junkReason({ accountName: "Acme" }, { ...ok, email: "3cxdemo3@gmail.com" }), "abuse_cluster_email");
  assert.equal(junkReason({ accountName: "Workaaaasas" }, ok), "random_name");
  assert.equal(looksRandom("Xkcdqwrt"), true);
  assert.equal(looksRandom("EirConnect"), false);
});
