import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { approvedRenderHashes, FIXTURE_FIELDS, FIXTURE_UNSUBSCRIBE_URL } from "./helpers/approvedRenders";
import { NURTURE_SEQUENCES, copyFor } from "../src/lib/trialNurture/copy";
import { YOUTUBE_DRAFT_SEQUENCES, YOUTUBE_DRAFT_PLACEMENTS } from "../src/lib/trialNurture/copyYoutubeDrafts";
import { YOUTUBE_VIDEOS, youtubeThumbBlockHtml, youtubeThumbBlockText, youtubeThumbUrl } from "../src/lib/trialNurture/youtubeBlocks";
import { render, renderSubject, type Step } from "../src/lib/trialNurture/schedule";
import { renderNurtureHtml, escapeHtml, htmlHasUnfilledPlaceholder, htmlToVisibleText, htmlHrefs } from "../src/lib/trialNurture/htmlTemplate";
import { assertSafeNurtureText, UNFILLED_PLACEHOLDER_RE } from "../src/lib/trialNurture/links";

const root = process.cwd();
const fixture = JSON.parse(readFileSync(join(root, "tests", "fixtures", "approved-nurture-render-hashes.json"), "utf8"));
const MASTER_MIDDLEWARE_SHA256 = "e1beb746258f25750abcfd7ef5fbbff003f7a0790b60e0f703b2be2cfc534bb3"; // src/middleware.ts @ 92437f76 (LF)

test("approved/live nurture renders are byte-identical to master 92437f76 (sha256 fingerprint)", () => {
  assert.equal(fixture.baseline, "92437f76f403cb65e42b0eea93e5d2f5104f3409");
  assert.deepEqual(approvedRenderHashes(), fixture.hashes);
});

test("CRM middleware is identical to master and /email/youtube is NOT public", async () => {
  const src = readFileSync(join(root, "src", "middleware.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(createHash("sha256").update(src).digest("hex"), MASTER_MIDDLEWARE_SHA256);
  assert.ok(!/email/.test(src), "no /email exception");
  assert.ok(!existsSync(join(root, "src", "lib", "publicAssets.ts")));
  assert.ok(!existsSync(join(root, "public", "email", "youtube")), "thumbnails are not hosted in the CRM");
  // Behaviour: without a session, /email/youtube/x.jpg redirects to the login page.
  const prev = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = "test-only-not-a-secret";
  try {
    const { NextRequest } = await import("next/server");
    const { middleware } = await import("../src/middleware");
    const res = await middleware(new NextRequest("https://marketing.sessiontalk.co.uk/email/youtube/x.jpg"));
    assert.equal(res.status, 307);
    assert.equal(new URL(res.headers.get("location")!).pathname, "/");
  } finally {
    if (prev === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = prev;
  }
});

test("live sequences carry no YouTube content and copyFor never returns a draft", () => {
  for (const [key, seq] of Object.entries(NURTURE_SEQUENCES)) {
    for (const c of seq) {
      assert.ok(!/youtube|\/email\/youtube/i.test(JSON.stringify(c)), `${key} step ${c.step} must stay unchanged`);
      assert.equal(copyFor(key as keyof typeof NURTURE_SEQUENCES, c.step), c);
    }
  }
});

test("drafts match HoD placements: final:false, hosted_pbx untouched, HoM wording, no placeholders", () => {
  assert.deepEqual(Object.keys(YOUTUBE_DRAFT_SEQUENCES).sort(), ["generic_softphone", "sessionpbx_trial"]);
  const ids = (k: keyof typeof YOUTUBE_DRAFT_SEQUENCES) => YOUTUBE_DRAFT_SEQUENCES[k].map((c) => [c.step, (c.body.match(/watch\?v=([A-Za-z0-9_-]{11})/) || [])[1]]);
  assert.deepEqual(ids("generic_softphone"), [[2, "Sk6e5jRMb84"], [3, "i0pPhOZJwE4"], [5, "RMv-JA7RH7o"]]);
  assert.deepEqual(ids("sessionpbx_trial"), [[1, "7ftMf6ZNwo0"], [2, "aKed7YABD2o"], [4, "wVg9-Tdf03E"]]);
  assert.equal(YOUTUBE_DRAFT_PLACEMENTS.sessionpbx_trial.find((p) => p.step === 4)?.optional, true);
  for (const seq of Object.values(YOUTUBE_DRAFT_SEQUENCES)) {
    for (const c of seq) {
      assert.equal(c.final, false);
      assert.ok(c.file.endsWith("#youtube-draft"));
      assert.ok(!/HoM copy pending/.test(c.body + c.html));
      assert.equal((c.body.match(/youtube\.com\/watch/g) || []).length, 1, "one video per email (text)");
      assert.match(c.body, /\nWatch: [^\n]+\nhttps:\/\/www\.youtube\.com\/watch\?v=/);
    }
  }
});

test("HoM exact 'after' text for every placement", () => {
  const body = (k: keyof typeof YOUTUBE_DRAFT_SEQUENCES, s: number) => YOUTUBE_DRAFT_SEQUENCES[k].find((c) => c.step === s)!.body;
  assert.ok(body("generic_softphone", 2).includes(`Once someone is set up, make a short test call to another extension. If the app does not register, the usual cause is the Domain, port or Transport not matching your phone system.\n\nThis short video walks through the usual registration checks:\n\nWatch: Fix "Registration Failed" on SessionTalk Softphone Mobile (iPhone & Android)\nhttps://www.youtube.com/watch?v=Sk6e5jRMb84\n\nReply with what you see and I'll help.\n\nMaryam Fatima\nSessionTalk\nmaryam@sessiontalk.co.uk`));
  assert.ok(body("generic_softphone", 3).includes(`Logo branding and white-label apps: {branding_docs_url}\n\nThis short video shows how to put your logo on the softphones your team uses, with no wait for the app stores:\n\nWatch: Put your logo on your team's softphones, with no app-store wait\nhttps://www.youtube.com/watch?v=i0pPhOZJwE4\n\nMiscellaneous: theme colour and help links: {misc_docs_url}`));
  assert.ok(body("generic_softphone", 5).includes(`just reply to this email and I'll pick it up.\n\nIf a test call connects but there's no audio, this short video covers the usual checks:\n\nWatch: No Sound on Calls? Fix Audio on SessionTalk Softphone Mobile (iPhone & Android)\nhttps://www.youtube.com/watch?v=RMv-JA7RH7o\n\nQR codes for iPhone and Android: {qr_docs_url}`));
  assert.ok(body("sessionpbx_trial", 1).includes(`The steps are here: https://docs.sessiontalk.io/docs/hosted-pbx/team-members/extensions\n\nThis short video shows how to add team members and extensions:\n\nWatch: Add team members and extensions in SessionPBX\nhttps://www.youtube.com/watch?v=7ftMf6ZNwo0\n\nIf anything looks unclear, just reply and I'll help.`));
  assert.ok(body("sessionpbx_trial", 2).includes(`Setup guide for the apps: https://docs.sessiontalk.io/docs/hosted-pbx/team-members/install-apps\n\nThis short video shows how to set up SessionTalk Softphone on iPhone or Android with a SIP account:\n\nWatch: How to Set Up SessionTalk Softphone Mobile with Your SIP Account (iPhone & Android)\nhttps://www.youtube.com/watch?v=aKed7YABD2o\n\nOnce you hear it ring`));
  assert.equal(body("sessionpbx_trial", 4), `Hi {first_name},\n\nYou're a week into your SessionPBX trial, so I wanted to see how it's going.\n\nIf a short overview would help, this video explains how SessionPBX works:\n\nWatch: Hosted Phone System for Small Businesses, Explained | SessionPBX\nhttps://www.youtube.com/watch?v=wVg9-Tdf03E\n\nIf anything's unclear, just reply to this email.\n\nMaryam Fatima\nSessionTalk\nmaryam@sessiontalk.co.uk`);
});

test("softphone HTML drafts only add the block to the approved fragment", () => {
  for (const p of YOUTUBE_DRAFT_PLACEMENTS.generic_softphone) {
    const live = NURTURE_SEQUENCES.generic_softphone.find((c) => c.step === p.step)!;
    const draft = YOUTUBE_DRAFT_SEQUENCES.generic_softphone.find((c) => c.step === p.step)!;
    assert.equal(draft.html!.replace(youtubeThumbBlockHtml(p) + "\n", ""), live.html, `step ${p.step}`);
  }
});

test("thumbnail block is email-safe and points at sessiontalk.io (never i.ytimg / CRM)", () => {
  for (const seq of Object.values(YOUTUBE_DRAFT_PLACEMENTS)) {
    for (const p of seq) {
      const html = youtubeThumbBlockHtml(p);
      assert.match(html, /<table role="presentation"/);
      assert.ok(html.includes(`<img src="https://sessiontalk.io/email/youtube/${p.video.slug}.jpg" width="480" height="270" alt="${escapeHtml(p.alt)}"`));
      assert.ok(!/background(-image)?\s*:\s*url|ytimg|marketing\.sessiontalk|\/workspace\//i.test(html));
      assert.equal((html.match(new RegExp(`href="https://www\\.youtube\\.com/watch\\?v=${p.video.id}"`, "g")) || []).length, 2, "image + caption link");
      assert.ok(html.includes(`>${escapeHtml(`Watch: ${p.video.title}`)}</a>`));
      assert.ok(html.startsWith(`<p style="margin:0 0 12px 0;`) && html.includes(escapeHtml(p.leadIn)));
      assert.ok(youtubeThumbBlockText(p).startsWith(p.leadIn + "\n\nWatch: "));
    }
  }
  assert.equal(youtubeThumbUrl(YOUTUBE_VIDEOS.noSound.slug), "https://sessiontalk.io/email/youtube/07-no-sound.jpg");
  assert.throws(() => youtubeThumbUrl("../x"));
});

test("drafts render through the production path with no unfilled tokens and pass link-safety", () => {
  const product: Record<string, string> = { generic_softphone: "generic_softphone", sessionpbx_trial: "teams_phone" };
  for (const [key, seq] of Object.entries(YOUTUBE_DRAFT_SEQUENCES)) {
    for (const c of seq) {
      const fields = { ...FIXTURE_FIELDS, product: product[key], step: c.step as Step };
      const text = render(c.body, "Sam", fields);
      const subject = renderSubject(c.subject, "Sam", fields);
      const html = renderNurtureHtml({ textBody: text, unsubscribeUrl: FIXTURE_UNSUBSCRIBE_URL, subject, htmlBody: render(c.html!, escapeHtml("Sam"), fields) });
      assert.ok(!UNFILLED_PLACEHOLDER_RE.test(text), `${key} ${c.step} text`);
      assert.equal(htmlHasUnfilledPlaceholder(html), false, `${key} ${c.step} html`);
      assertSafeNurtureText(text, FIXTURE_FIELDS.sipDomain);
      assertSafeNurtureText(htmlToVisibleText(html) + "\n" + htmlHrefs(html), FIXTURE_FIELDS.sipDomain);
      assert.equal((html.match(/<img src="https:\/\/sessiontalk\.io\/email\/youtube\//g) || []).length, 1);
    }
  }
});
