import { isExcludedEmail, isExcludedWorkspace, junkReason, looksRandom } from "@/lib/trialNurture/exclusions";

const ok = { email: "luis.mendes@techbase.pt", firstname: "Luis", emailVerified: true };
test("NorthwindDemo excluded", () => {
  expect(isExcludedEmail("Demo-Screens+20261104@sessiontalk.co.uk")).toBe(true);
  expect(isExcludedWorkspace({ sipDomain: "northwind-demo.uk.sip.sessiontalk.io" })).toBe(true);
  expect(isExcludedWorkspace({ accountName: "NorthwindDemo" })).toBe(true);
  expect(isExcludedWorkspace({ appId: "nZ9fr84qDy" })).toBe(true);
});
test("junk filters", () => {
  expect(junkReason({ accountName: "Techbase" }, ok)).toBeNull();
  expect(junkReason({ accountName: "ASPICON" }, ok)).toBeNull();
  expect(junkReason({ accountName: "Allegiance" }, ok)).toBeNull();
  expect(junkReason({ accountName: "Techbase" }, { ...ok, emailVerified: false })).toBe("unverified_email");
  expect(junkReason({ accountName: "Rome5871" }, ok)).toBe("abuse_cluster_workspace");
  expect(junkReason({ accountName: "Romebumann48" }, ok)).toBe("abuse_cluster_workspace");
  expect(junkReason({ accountName: "Acme" }, { ...ok, email: "3cxdemo3@gmail.com" })).toBe("abuse_cluster_email");
  expect(junkReason({ accountName: "Workaaaasas" }, ok)).toBe("random_name");
  expect(looksRandom("Xkcdqwrt")).toBe(true);
  expect(looksRandom("EirConnect")).toBe(false);
});
