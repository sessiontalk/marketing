import { test } from "node:test";
import assert from "node:assert/strict";
import { isStep5ManualWorkspace, isExcludedWorkspace } from "../src/lib/trialNurture/exclusions";

test("step-5 manual list matches slug, accountName or appId case-insensitively", () => {
  assert.equal(isStep5ManualWorkspace({ sipDomain: "ServyTeam.uk.sip.sessiontalk.io" }), true);
  assert.equal(isStep5ManualWorkspace({ accountName: "AsimHussain" }), true);
  assert.equal(isStep5ManualWorkspace({ appId: "ZAINMOBILE00" }), true);
  assert.equal(isStep5ManualWorkspace({ sipDomain: "acme.uk.sip.sessiontalk.io", accountName: "acme", appId: "a1" }), false);
});

test("step-5 manual tenants are NOT fully excluded (steps 1-4 still send)", () => {
  for (const s of ["servyteam", "asimhussain", "zainmobile00"])
    assert.equal(isExcludedWorkspace({ sipDomain: `${s}.uk.sip.sessiontalk.io` }), false);
});