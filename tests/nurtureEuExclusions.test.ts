import { test } from "node:test";
import assert from "node:assert/strict";
import { workspaceHost, workspaceTeamUrl, workspaceRoutingUrl, assertSafeNurtureText, isEuSipDomain } from "../src/lib/trialNurture/links";
import { render } from "../src/lib/trialNurture/schedule";
import { NURTURE_COPY } from "../src/lib/trialNurture/copy";
import { TrialEvent } from "../src/lib/trialNurture/events";
import { isExcludedWorkspace } from "../src/lib/trialNurture/exclusions";

test("EU sip_domain maps to {slug}.eu.sessiontalk.io (with or without .sip)", () => {
  assert.equal(workspaceHost("acme.eu.sip.sessiontalk.io"), "acme.eu.sessiontalk.io");
  assert.equal(workspaceHost("acme.eu.sessiontalk.io"), "acme.eu.sessiontalk.io");
  assert.equal(workspaceTeamUrl("Acme.EU.sip.sessiontalk.io"), "https://acme.eu.sessiontalk.io/admin/team");
  assert.equal(workspaceRoutingUrl("acme.eu.sessiontalk.io"), "https://acme.eu.sessiontalk.io/admin/routing");
});

test("non-EU sip_domain unchanged", () => {
  for (const s of ["utilitystar.us.sip.sessiontalk.io", "acme.uk.sip.sessiontalk.io", "x.asia.sip.sessiontalk.io"]) {
    assert.equal(workspaceHost(s), s);
    assert.equal(workspaceTeamUrl(s), `https://${s}/admin/team`);
  }
  assert.equal(isEuSipDomain("acme.uk.sip.sessiontalk.io"), false);
});

test("rendered EU emails use .eu host and never .uk", () => {
  for (const c of NURTURE_COPY.filter((x) => x.body.includes("{sip_domain}"))) {
    const text = render(c.body, "Sam", { sipDomain: "acme.eu.sip.sessiontalk.io" });
    assert.match(text, /https:\/\/acme\.eu\.sessiontalk\.io\/admin\//);
    assert.doesNotMatch(text, /\.uk\./);
    assert.doesNotMatch(text, /\{sip_domain\}/);
    assertSafeNurtureText(text, "acme.eu.sip.sessiontalk.io");
  }
});

test("guard: EU tenant text containing a .uk link throws", () => {
  assert.throws(() => assertSafeNurtureText("https://acme.uk.sip.sessiontalk.io/admin/team", "acme.eu.sessiontalk.io"));
  assert.doesNotThrow(() => assertSafeNurtureText("https://acme.uk.sip.sessiontalk.io/admin/team", "acme.uk.sip.sessiontalk.io"));
});

test("trial event schema accepts EU sip_domain, still rejects junk", () => {
  const base = { event: "trial.started", event_id: "e1", occurred_at: "2026-10-14T10:00:00Z", email: "a@example.com" };
  assert.equal(TrialEvent.safeParse({ ...base, sip_domain: "acme.eu.sessiontalk.io" }).success, true);
  assert.equal(TrialEvent.safeParse({ ...base, sip_domain: "acme.eu.sip.sessiontalk.io" }).success, true);
  assert.equal(TrialEvent.safeParse({ ...base, sip_domain: "acme.uk.sip.sessiontalk.io" }).success, true);
  assert.equal(TrialEvent.safeParse({ ...base, sip_domain: "acme.uk.sessiontalk.io" }).success, false);
  assert.equal(TrialEvent.safeParse({ ...base, sip_domain: "evil.example.com" }).success, false);
});

test("VOXIOs and MaryamApp workspaces are excluded (slug, accountName or appId)", () => {
  assert.equal(isExcludedWorkspace({ sipDomain: "voxios.uk.sip.sessiontalk.io" }), true);
  assert.equal(isExcludedWorkspace({ accountName: "MaryamApp" }), true);
  assert.equal(isExcludedWorkspace({ appId: "VOXIOS" }), true);
  assert.equal(isExcludedWorkspace({ sipDomain: "acme.eu.sessiontalk.io", accountName: "acme", appId: "a1" }), false);
  assert.equal(isExcludedWorkspace({}), false);
});