import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { approvedRenderHashes, FIXTURE_FIELDS, FIXTURE_UNSUBSCRIBE_URL } from "./helpers/approvedRenders";
import { NURTURE_SEQUENCES, copyFor } from "../src/lib/trialNurture/copy";
import { YOUTUBE_DRAFT_SEQUENCES, YOUTUBE_DRAFT_PLAN } from "../src/lib/trialNurture/copyYoutubeDrafts";
import { YOUTUBE_VIDEOS, youtubeThumbBlockHtml, youtubeThumbUrl, HOM_COPY_PENDING, YOUTUBE_THUMB_DIR } from "../src/lib/trialNurture/youtubeBlocks";
import { render, renderSubject, type Step } from "../src/lib/trialNurture/schedule";
import { renderNurtureHtml, escapeHtml, htmlHasUnfilledPlaceholder, htmlToVisibleText, htmlHrefs } from "../src/lib/trialNurture/htmlTemplate";
import { assertSafeNurtureText, UNFILLED_PLACEHOLDER_RE } from "../src/lib/trialNurture/links";
import { isPublicEmailAsset } from "../src/lib/publicAssets";
import { DEFAULT_PUBLIC_BASE_URL } from "../src/lib/unsubscribe";

const fixture = JSON.parse(readFileSync(join(process.cwd(), "tests", "fixtures", "approved-nurture-render-hashes.json"), "utf8"));

test("approved/live nurture renders are byte-identical to master 92437f76 (sha256 fingerprint)", () => {
  assert.equal(fixture.baseline, "92437f76f403cb65e42b0eea93e5d2f5104f3409");
  assert.deepEqual(approvedRenderHashes(), fixture.hashes);
});

test("live sequences carry no YouTube content and copyFor never returns a draft", () => {
  for (const [key, seq] of Object.entries(NURTURE_SEQUENCES)) {
    for (const c of seq) {
      const all = JSON.stringify(c);
      assert.ok(!/youtube|\/email\/youtube|HoM copy pending/i.test(all), `${key} step ${c.step} must stay unchanged`);
      assert.ok(!c.file.includes("#youtube-draft"));
      assert.equal(copyFor(key as keyof typeof NURTURE_SEQUENCES, c.step), c);
    }
  }
});

test("every YouTube draft is final:false, marked [HoM copy pending], and only covers planned steps", () => {
  for (const [key, seq] of Object.entries(YOUTUBE_DRAFT_SEQUENCES)) {
    const planned = Object.keys(YOUTUBE_DRAFT_PLAN[key as keyof typeof YOUTUBE_DRAFT_PLAN]).map(Number).sort();
    assert.deepEqual(seq.map((c) => c.step).sort(), planned, key);
    for (const c of seq) {
      assert.equal(c.final, false, `${key} ${c.step} final`);
      assert.ok(c.file.endsWith("#youtube-draft"));
      assert.ok(c.body.includes(HOM_COPY_PENDING) && (c.html || "").includes(HOM_COPY_PENDING));
      assert.ok(!/\$\d/.test(c.body.split(HOM_COPY_PENDING)[1] || ""), "block adds no pricing");
    }
  }
  // Drafts only add the block: removing it gives back the approved text.
  const live = NURTURE_SEQUENCES.generic_softphone.find((c) => c.step === 1)!;
  const draft = YOUTUBE_DRAFT_SEQUENCES.generic_softphone.find((c) => c.step === 1)!;
  const v = YOUTUBE_VIDEOS.setupSipAccount;
  assert.equal(draft.body.replace(`\n\n${HOM_COPY_PENDING} Watch the video: ${v.title}\nhttps://www.youtube.com/watch?v=${v.id}`, ""), live.body);
  assert.equal(draft.html!.replace(youtubeThumbBlockHtml(v) + "\n", ""), live.html);
});

test("thumbnail block is email-safe: table layout, sized img with alt, own-domain src, no background-image", () => {
  for (const v of Object.values(YOUTUBE_VIDEOS)) {
    const html = youtubeThumbBlockHtml(v);
    assert.match(html, /^<table role="presentation"/);
    assert.match(html, /<img src="https:\/\/marketing\.sessiontalk\.co\.uk\/email\/youtube\/[a-z0-9-]+\.jpg" width="520" height="293" alt="Play video: [^"]+"/);
    assert.ok(!/background(-image)?\s*:\s*url|i\.ytimg|ytimg\.com|\/workspace\//i.test(html));
    assert.equal((html.match(new RegExp(`href="https://www\\.youtube\\.com/watch\\?v=${v.id}"`, "g")) || []).length, 2, "image + caption link");
    assert.match(html, /\[HoM copy pending\]/);
  }
  assert.equal(youtubeThumbUrl("07-no-sound", DEFAULT_PUBLIC_BASE_URL), "https://marketing.sessiontalk.co.uk/email/youtube/07-no-sound.jpg");
  assert.throws(() => youtubeThumbUrl("../x"));
});

test("thumbnail files exist in public/email/youtube, are small JPEGs, and are the only public email assets", () => {
  for (const v of Object.values(YOUTUBE_VIDEOS)) {
    const p = join(process.cwd(), "public", YOUTUBE_THUMB_DIR, `${v.slug}.jpg`);
    assert.ok(existsSync(p), p);
    const buf = readFileSync(p);
    assert.equal(buf[0], 0xff); assert.equal(buf[1], 0xd8, "JPEG magic");
    assert.ok(statSync(p).size < 60_000, `${v.slug}.jpg should stay small`);
    assert.equal(isPublicEmailAsset(`${YOUTUBE_THUMB_DIR}/${v.slug}.jpg`), true);
  }
  for (const p of ["/dashboard", "/email/youtube/", "/email/youtube/x.png", "/email/youtube/../api/crm/x.jpg", "/email/other.jpg", "/api/crm/contacts", "/email/youtube/a/b.jpg"]) {
    assert.equal(isPublicEmailAsset(p), false, p);
  }
});

test("drafts render through the production path with no unfilled tokens and pass link-safety", () => {
  const product: Record<string, string> = { generic_softphone: "generic_softphone", sessionpbx_trial: "teams_phone", hosted_pbx: "hosted_pbx" };
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
      assert.match(html, /\/email\/youtube\/[a-z0-9-]+\.jpg/);
      assert.match(text, /https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}/);
    }
  }
});
